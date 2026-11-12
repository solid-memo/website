// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { planRepair, type Repair, type RepairPlan } from "@solid-memo/domain/repair";
import type { Deck } from "@solid-memo/domain/deck";
import {
  canonicalUrlOf,
  catalogUrlOf,
  historyUrlOf,
  instanceDocumentUrls,
  isDocumentIn,
} from "@solid-memo/domain/instanceLayout";
import {
  summarize,
  withUnclaimed,
  type DocumentReport,
  type UnclaimedDeck,
  type ValidationReport,
} from "@solid-memo/domain/validation";
import { deckHealth, type DeckHealth, type DeckTextCheck } from "@solid-memo/domain/deckHealth";
import type { MarkdownFinding } from "@solid-memo/domain/release/problems";
import type { InstanceDigest } from "@solid-memo/domain/studyDigest";
import type {
  DeckLibrary,
  DeckRepository,
  ShapeValidator,
  RepairRepository,
  DocumentContext,
  ReadBudget,
  ReleaseDraftRepository,
  StorageGateway,
} from "./ports";
import type { AnswerStore } from "./answerStore";
import { AppError } from "@solid-memo/domain/appError";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { TextMap } from "@solid-memo/domain/pathKeys";
import { mapAtOnce } from "./atOnce";
import { readBudget } from "./readBudget";
import { noting } from "./digestStore";
import type { DigestStore } from "./digestStore";
import { isInInstancePod } from "./releaseDrafts";

export interface InstanceCheckUseCases {
  /**
   * Developer tool: every document of the instance checked against
   * Solid Memo's shapes (docs/validation.md). Reads only. `onChecked` is
   * told how many documents are checked of how many, from none.
   */
  validateInstance(
    instanceUrl: string,
    onChecked?: (count: number, of: number) => void,
  ): Promise<ValidationReport>;
  /**
   * The check made when an instance is opened: validateInstance, but a
   * document still at the version the instance's digest says conformed
   * is not checked (nor downloaded) again.
   */
  checkInstance(instanceUrl: string): Promise<ValidationReport>;
  /**
   * Mark a deck's unclaimed documents (the report's `unclaimed`) as the
   * deck's, once the user has confirmed they are: from then on they are
   * written to and deleted as the deck's. Each in one write made only
   * while it is as read; nothing else in it changes. deckGone when the
   * instance has no such deck; claimOutsidePod, with nothing written,
   * when any of them is outside the instance's folder and in no storage
   * of the user's found to hold the instance too (UnclaimedDeck
   * `outsidePod`).
   */
  claimDeckDocuments(instanceUrl: string, deckUrl: string): Promise<void>;
  /**
   * Everything wrong with one deck of the instance (domain/deckHealth.ts):
   * the check of its entry in the catalog and of its cards and reviews
   * documents, made as checkInstance makes it (a document still at the
   * version the digest says conformed is not checked again); the sides
   * whose language is not stated, of the cards the user may settle
   * (unknown when the release the deck was copied from cannot be read);
   * the cards that say the same; and what `text` (the markdown package's
   * plain text and check, which the caller passes in) finds in its text
   * written in Markdown. Writes nothing but the digest's receipts.
   */
  checkDeck<F extends MarkdownFinding>(
    instanceUrl: string,
    deck: Deck,
    text: DeckTextCheck<F>,
  ): Promise<DeckHealth<F>>;
  /** What the app can repair of what a check found, and what it leaves to the user. */
  planRepair(report: ValidationReport): RepairPlan;
  /**
   * Apply repairs (the planned ones, or removals the user chose) to the
   * instance's documents. A document that its read shows is not to be
   * written is left as it is (RepairRepository).
   */
  applyRepairs(instanceUrl: string, repairs: readonly Repair[]): Promise<void>;
}

/**
 * A test of whether the document at an address is one of these decks'
 * unclaimed ones, in whatever spelling: a deck may name one document
 * twice, and only the first spelling is listed as unclaimed. Each
 * address is compared as a request would send it (canonicalUrlOf), the
 * unclaimed ones brought to that form once for the test, so that a
 * catalog naming many decks costs one lookup per address, not a
 * comparison with every unclaimed document.
 */
function unclaimedTest(unclaimed: readonly UnclaimedDeck[]): (url: string) => boolean {
  // Keyed by pieces (TextMap): an address as a request sends it may be longer than V8 hashes all of.
  const skipped = new TextMap<true>();
  for (const deck of unclaimed) {
    for (const document of deck.documents) {
      const canonical = canonicalDocumentOf(document);
      if (canonical !== null) skipped.set(canonical, true);
    }
  }
  return (url) => {
    const canonical = canonicalDocumentOf(url);
    return canonical !== null && skipped.has(canonical);
  };
}

/**
 * A lookup of the decks naming a document as theirs, in whatever spelling
 * of its address, each once: found once for all the documents, so that a
 * catalog naming many decks costs one lookup per document.
 */
function decksByDocument(decks: readonly Deck[]): (url: string) => readonly Deck[] {
  const naming = new TextMap<Deck[]>();
  for (const deck of decks) {
    const documents = [deck.cardsDocumentUrl, deck.reviewsDocumentUrl].map(canonicalDocumentOf);
    for (const url of new Set(documents)) {
      if (url === null) continue;
      const listed = naming.get(url);
      if (listed === undefined) naming.set(url, [deck]);
      else listed.push(deck);
    }
  }
  return (url) => {
    const canonical = canonicalDocumentOf(url);
    return (canonical === null ? undefined : naming.get(canonical)) ?? [];
  };
}

/**
 * How long one check may read, in all, the decks' documents outside
 * their instance's folder, in milliseconds (readBudget): to find which
 * are unclaimed, to check them and to read again one that does not
 * conform. A catalog may name a thousand of them on servers that answer
 * slowly, and every deck page waits on the check. The clock runs only
 * while one of those reads is under way, so a slow read of the
 * instance's own documents takes nothing from it.
 */
const OUTSIDE_READS_MS = 60_000;

/** The budget a read of the document is made within: the check's for one outside the instance's folder, none for one in it. */
function budgetFor(url: string, instanceUrl: string, budget: ReadBudget): ReadBudget | undefined {
  return isDocumentIn(url, instanceUrl) ? undefined : budget;
}

/** The address of the document `url` is in, as a request sends it (canonicalUrlOf); null for one that is no URL. */
function canonicalDocumentOf(url: string): string | null {
  return canonicalUrlOf(documentUrlOf(url));
}

/**
 * The checks of an instance against Solid Memo's shapes (docs/validation.md):
 * the quick one made when it is opened, which spares a document the digest
 * says conformed and has not changed since, the full one of every document,
 * and one deck's; the decks' unclaimed documents claimed once the user
 * confirms they are the deck's; and what the app can repair of what a check
 * found (domain/repair.ts).
 */
export function createInstanceCheckUseCases({
  deckRepository,
  releaseDraftRepository,
  answerStore,
  shapeValidator,
  repairRepository,
  deckLibrary,
  digestStore,
  storageGateway,
  webId,
  ruleset,
}: {
  deckRepository: DeckRepository;
  releaseDraftRepository: ReleaseDraftRepository;
  answerStore: Pick<AnswerStore, "logMonths">;
  shapeValidator: ShapeValidator;
  repairRepository: RepairRepository;
  deckLibrary: DeckLibrary;
  digestStore: Pick<DigestStore, "of" | "remember" | "isInstances">;
  storageGateway: Pick<StorageGateway, "discoverStorages">;
  /** The WebID of whoever is signed in, asked at each call; none when no one is. */
  webId: () => string | undefined;
  ruleset: string;
}): InstanceCheckUseCases {
  async function checkInstance(instanceUrl: string): Promise<ValidationReport> {
    const [decks, drafts, digest] = await Promise.all([
      deckRepository.listDecks(instanceUrl),
      releaseDraftRepository.documents(instanceUrl),
      digestStore.of(instanceUrl),
    ]);
    const budget = readBudget(OUTSIDE_READS_MS);
    const unclaimed = await unclaimedDecksOf(instanceUrl, decks, budget);
    return withUnclaimed(
      await checkDocuments(
        instanceUrl,
        documentsToCheck(instanceUrl, decks, drafts, unclaimed),
        digest,
        decks,
        budget,
      ),
      unclaimed,
    );
  }
  /**
   * A test of which documents may not be claimed for a deck of the
   * instance, giving those of `documents` outside its folder and in no
   * storage of the user's that holds it too (isInInstancePod): a claim
   * lets the app write to a document as the user and delete from it, and
   * an instance attached from someone else's pod may name a document of
   * the user's own. A storage counts only when it can be found; when none
   * can, or no one is signed in, only the instance's own folder does.
   * The user's storages are found once for one test.
   */
  function outsidePodTest(
    instanceUrl: string,
  ): (documents: readonly string[]) => Promise<string[]> {
    const user = webId();
    let found: ReturnType<StorageGateway["discoverStorages"]> | undefined;
    const storages: Pick<StorageGateway, "discoverStorages"> = {
      discoverStorages: (id) => (found ??= storageGateway.discoverStorages(id)),
    };
    return async (documents) => {
      const inside = await Promise.all(
        documents.map(async (url) =>
          user === undefined
            ? isDocumentIn(url, instanceUrl)
            : isInInstancePod(storages, instanceUrl, url, user),
        ),
      );
      return documents.filter((_, index) => !inside[index]);
    };
  }
  /**
   * The decks whose documents are unclaimed, each with those documents
   * (DeckRepository.unclaimedDocuments) and which of them may not be
   * claimed (outsidePodTest). The documents outside the instance's
   * folder, which a catalog may name on anyone's server, are read within
   * the check's `budget` (OUTSIDE_READS_MS): one not read by then counts
   * as unclaimed, so a server that answers slowly holds the check up no
   * longer.
   */
  async function unclaimedDecksOf(
    instanceUrl: string,
    decks: readonly Deck[],
    budget: ReadBudget,
  ): Promise<UnclaimedDeck[]> {
    const outsidePodOf = outsidePodTest(instanceUrl);
    const found = await mapAtOnce(decks, async (deck) => {
      const documents = await deckRepository.unclaimedDocuments(deck, budget);
      return {
        deckUrl: deck.url,
        title: deck.title,
        documents,
        outsidePod: await outsidePodOf(documents),
      };
    });
    return found.filter((deck) => deck.documents.length > 0);
  }
  /**
   * The instance's documents, then its drafts': each with where it is,
   * which picks its shapes. An unclaimed document is not checked, in any
   * spelling of its address (unclaimedTest): it may be anyone's, and a
   * repair of what the check finds writes to it.
   */
  function documentsToCheck(
    instanceUrl: string,
    decks: readonly Deck[],
    drafts: readonly string[],
    unclaimed: readonly UnclaimedDeck[],
  ): { url: string; context: Exclude<DocumentContext, "library"> }[] {
    const isUnclaimed = unclaimedTest(unclaimed);
    return [
      ...instanceDocumentUrls(instanceUrl, decks)
        .filter((url) => !isUnclaimed(url))
        .map((url) => ({ url, context: "pod" as const })),
      ...drafts.map((url) => ({ url, context: "draft" as const })),
    ];
  }
  /**
   * The check of these documents of the instance, each not checked again
   * while still at the version the digest says conformed. A receipt is
   * kept only of one that is the instance's (DigestStore.isInstances).
   * A document that cannot be read is in the report as one
   * (ShapeValidator), so it holds back only what it is part of; so is one
   * outside the instance's folder not read within the check's `budget`.
   */
  async function checkDocuments(
    instanceUrl: string,
    urls: readonly { url: string; context: Exclude<DocumentContext, "library"> }[],
    digest: InstanceDigest,
    decks: readonly Deck[],
    budget: ReadBudget,
  ): Promise<ValidationReport> {
    // A few at a time: the catalog says how many there are (MAX_CATALOG_LINKS of each kind at most).
    const documents = await mapAtOnce(urls, async ({ url, context }): Promise<DocumentReport> => {
      const receipt = digest.receipts[url];
      const since = await shapeValidator.validateDocumentSince(
        url,
        receipt?.conformedTo === ruleset ? receipt.version : undefined,
        context,
        budgetFor(url, instanceUrl, budget),
      );
      if (since.unchanged) return { url, status: "checked", subjects: [] };
      // A receipt only of a document that is the instance's: one an instance from another's pod names may be the user's own.
      if (
        since.version !== null &&
        summarize(instanceUrl, [since.value]).conforms &&
        (await digestStore.isInstances(instanceUrl, url))
      ) {
        digestStore.remember(instanceUrl, noting(url, since.version, { conformedTo: ruleset }));
      }
      return since.value;
    });
    return summarize(
      instanceUrl,
      await withoutUnclaimedOnRead(instanceUrl, decks, documents, budget),
    );
  }
  /**
   * The reports without those of a deck's document that its read shows
   * is unclaimed for every deck naming it (isUnclaimedAsRead): a repair
   * or removal of what the check found would write to a document that
   * is no deck's to change, a release in the instance's folder say. Only
   * a report with something to repair needs that read, so a check of an
   * unchanged instance still downloads nothing. One outside the
   * instance's folder is read within the check's `budget`, and its report
   * kept when it is not.
   */
  async function withoutUnclaimedOnRead(
    instanceUrl: string,
    decks: readonly Deck[],
    documents: readonly DocumentReport[],
    budget: ReadBudget,
  ): Promise<DocumentReport[]> {
    const decksOf = decksByDocument(decks);
    const left = await mapAtOnce(documents, async (document) => {
      const naming = decksOf(document.url);
      return (
        naming.length > 0 &&
        !summarize(instanceUrl, [document]).conforms &&
        (await deckRepository.isUnclaimedAsRead(
          naming,
          document.url,
          budgetFor(document.url, instanceUrl, budget),
        ))
      );
    });
    return documents.filter((_, index) => !left[index]);
  }
  /** Every document of the instance, its answer log's too: not checked on every visit, being large and growing. */
  async function validateInstance(
    instanceUrl: string,
    onChecked: (count: number, of: number) => void = () => undefined,
  ): Promise<ValidationReport> {
    const [decks, months, drafts] = await Promise.all([
      deckRepository.listDecks(instanceUrl),
      answerStore.logMonths(instanceUrl),
      releaseDraftRepository.documents(instanceUrl),
    ]);
    const budget = readBudget(OUTSIDE_READS_MS);
    const unclaimed = await unclaimedDecksOf(instanceUrl, decks, budget);
    const urls = [
      ...documentsToCheck(instanceUrl, decks, drafts, unclaimed),
      ...months.map((month) => ({
        url: historyUrlOf(instanceUrl, month),
        context: "pod" as const,
      })),
    ];
    let checked = 0;
    onChecked(checked, urls.length);
    const documents = await mapAtOnce(urls, async ({ url, context }) => {
      const document = await shapeValidator.validateDocument(
        url,
        context,
        budgetFor(url, instanceUrl, budget),
      );
      onChecked(++checked, urls.length);
      return document;
    });
    return withUnclaimed(
      summarize(instanceUrl, await withoutUnclaimedOnRead(instanceUrl, decks, documents, budget)),
      unclaimed,
    );
  }

  return {
    validateInstance,
    checkInstance,
    async claimDeckDocuments(instanceUrl, deckUrl) {
      const deck = (await deckRepository.listDecks(instanceUrl)).find(
        (listed) => listed.url === deckUrl,
      );
      if (deck === undefined) throw new AppError("deckGone", { deck: deckUrl });
      const documents = await deckRepository.unclaimedDocuments(deck);
      const [outside] = await outsidePodTest(instanceUrl)(documents);
      if (outside !== undefined)
        throw new AppError("claimOutsidePod", { deck: deck.title, url: outside });
      await deckRepository.claimDocuments(deck);
    },
    async checkDeck(instanceUrl, deck, text) {
      const budget = readBudget(OUTSIDE_READS_MS);
      const [report, cards, release] = await Promise.all([
        Promise.all([
          digestStore.of(instanceUrl),
          unclaimedDecksOf(instanceUrl, [deck], budget),
        ]).then(async ([digest, unclaimed]) => {
          const isUnclaimed = unclaimedTest(unclaimed);
          const urls = [deck.cardsDocumentUrl, deck.reviewsDocumentUrl].filter(
            (url) => !isUnclaimed(url),
          );
          return withUnclaimed(
            await checkDocuments(
              instanceUrl,
              [catalogUrlOf(instanceUrl), ...urls].map((url) => ({
                url,
                context: "pod" as const,
              })),
              digest,
              [deck],
              budget,
            ),
            unclaimed,
          );
        }),
        // Read as the deck's page reads it, within the read's own deadlines: it holds back this deck's health alone.
        deckRepository.listCards(deck),
        // A release that cannot be read leaves the sides to settle unknown, not the rest of the check.
        deck.sourceUrl === undefined
          ? []
          : deckLibrary.fetchLibraryDeck(deck.sourceUrl).then(
              (release) => release.cards,
              () => undefined,
            ),
      ]);
      return deckHealth(deck, report, cards, release, text);
    },
    planRepair(report) {
      return planRepair(report);
    },
    async applyRepairs(instanceUrl, repairs) {
      const decks = await deckRepository.listDecks(instanceUrl);
      return repairRepository.applyRepairs(repairs, decksByDocument(decks));
    },
  };
}
