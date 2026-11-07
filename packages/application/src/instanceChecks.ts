// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { planRepair, type Repair, type RepairPlan } from "@solid-memo/domain/repair";
import type { Deck } from "@solid-memo/domain/deck";
import {
  catalogUrlOf,
  historyUrlOf,
  instanceDocumentUrls,
  isDocumentIn,
  isSameUrl,
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
  ReleaseDraftRepository,
  StorageGateway,
} from "./ports";
import type { AnswerStore } from "./answerStore";
import { AppError } from "@solid-memo/domain/appError";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { mapAtOnce } from "./atOnce";
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
  /** Apply repairs (the planned ones, or removals the user chose). */
  applyRepairs(repairs: readonly Repair[]): Promise<void>;
}

/**
 * Whether the document at `url` is one of these decks' unclaimed ones,
 * in whatever spelling (isSameUrl): a deck may name one document twice,
 * and only the first spelling is listed as unclaimed.
 */
function isUnclaimed(url: string, unclaimed: readonly UnclaimedDeck[]): boolean {
  return unclaimed.some((deck) =>
    deck.documents.some((document) => isSameUrl(documentUrlOf(document), documentUrlOf(url))),
  );
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
    const unclaimed = await unclaimedDecksOf(instanceUrl, decks);
    return withUnclaimed(
      await checkDocuments(
        instanceUrl,
        documentsToCheck(instanceUrl, decks, drafts, unclaimed),
        digest,
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
  /** The decks whose documents are unclaimed, each with those documents (DeckRepository.unclaimedDocuments) and which of them may not be claimed (outsidePodTest). */
  async function unclaimedDecksOf(
    instanceUrl: string,
    decks: readonly Deck[],
  ): Promise<UnclaimedDeck[]> {
    const outsidePodOf = outsidePodTest(instanceUrl);
    const found = await mapAtOnce(decks, async (deck) => {
      const documents = await deckRepository.unclaimedDocuments(deck);
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
   * spelling of its address (isUnclaimed): it may be anyone's, and a
   * repair of what the check finds writes to it.
   */
  function documentsToCheck(
    instanceUrl: string,
    decks: readonly Deck[],
    drafts: readonly string[],
    unclaimed: readonly UnclaimedDeck[],
  ): { url: string; context: Exclude<DocumentContext, "library"> }[] {
    return [
      ...instanceDocumentUrls(instanceUrl, decks)
        .filter((url) => !isUnclaimed(url, unclaimed))
        .map((url) => ({ url, context: "pod" as const })),
      ...drafts.map((url) => ({ url, context: "draft" as const })),
    ];
  }
  /**
   * The check of these documents of the instance, each not checked again
   * while still at the version the digest says conformed. A receipt is
   * kept only of one that is the instance's (DigestStore.isInstances).
   */
  async function checkDocuments(
    instanceUrl: string,
    urls: readonly { url: string; context: Exclude<DocumentContext, "library"> }[],
    digest: InstanceDigest,
  ): Promise<ValidationReport> {
    // A few at a time: the catalog says how many there are (MAX_CATALOG_LINKS of each kind at most).
    const documents = await mapAtOnce(urls, async ({ url, context }): Promise<DocumentReport> => {
      const receipt = digest.receipts[url];
      const since = await shapeValidator.validateDocumentSince(
        url,
        receipt?.conformedTo === ruleset ? receipt.version : undefined,
        context,
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
    return summarize(instanceUrl, documents);
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
    const unclaimed = await unclaimedDecksOf(instanceUrl, decks);
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
      const document = await shapeValidator.validateDocument(url, context);
      onChecked(++checked, urls.length);
      return document;
    });
    return withUnclaimed(summarize(instanceUrl, documents), unclaimed);
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
      const [report, cards, release] = await Promise.all([
        Promise.all([digestStore.of(instanceUrl), unclaimedDecksOf(instanceUrl, [deck])]).then(
          async ([digest, unclaimed]) => {
            const urls = [deck.cardsDocumentUrl, deck.reviewsDocumentUrl].filter(
              (url) => !isUnclaimed(url, unclaimed),
            );
            return withUnclaimed(
              await checkDocuments(
                instanceUrl,
                [catalogUrlOf(instanceUrl), ...urls].map((url) => ({
                  url,
                  context: "pod" as const,
                })),
                digest,
              ),
              unclaimed,
            );
          },
        ),
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
    applyRepairs(repairs) {
      return repairRepository.applyRepairs(repairs);
    },
  };
}
