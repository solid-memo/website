// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Deck } from "@solid-memo/domain/deck";
import {
  canonicalUrlOf,
  documentKeyOf,
  catalogUrlOf,
  historyUrlOf,
  instanceDocumentUrls,
  isDocumentIn,
  isSameDocuments,
} from "@solid-memo/domain/instanceLayout";
import {
  summarize,
  unreadableDocument,
  withUnclaimed,
  type DocumentReport,
  type UnclaimedDeck,
  type ValidationReport,
} from "@solid-memo/domain/validation";
import { deckHealth, type DeckHealth, type DeckTextCheck } from "@solid-memo/domain/deckHealth";
import type { MarkdownFinding } from "@solid-memo/domain/release/problems";
import type { InstanceDigest } from "@solid-memo/domain/studyDigest";
import type { ShapeValidator, DocumentContext, ReadBudget, SharedReads } from "./ports/checks";
import type { DeckLibrary, ReleaseDraftRepository } from "./ports/library";
import type { DeckRepository } from "./ports/pod";
import type { StorageGateway } from "./ports/session";
import type { AnswerStore } from "./answerStore";
import { AppError } from "@solid-memo/domain/appError";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { TextMap } from "@solid-memo/domain/pathKeys";
import { allSettledThen, inTurns, mapAtOnce, READS_AT_ONCE } from "./atOnce";
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
   * written to and deleted as the deck's. `documents` are the addresses
   * the user was shown and confirmed (UnclaimedDeck `documents`), and
   * only those are claimed. Each in one write made only while it is as
   * read; nothing else in it changes. deckGone when the instance has no
   * such deck; changedElsewhere, with nothing written, when the deck's
   * unclaimed documents, read again, are not those (in any spelling,
   * documentKeyOf, and any order); claimOutsidePod, with nothing
   * written, when any of them is outside the instance's folder and in
   * no storage of the user's found to hold the instance too
   * (UnclaimedDeck `outsidePod`).
   */
  claimDeckDocuments(
    instanceUrl: string,
    deckUrl: string,
    documents: readonly string[],
  ): Promise<void>;
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
   * What a check of the instance found of a document since it was last
   * read afresh is reused (checkInstance, forgetDeckCheck), so the
   * decks that share a document, or the catalog, check it once; and
   * given one frozen `text` for them all, what the cards of a document
   * they share hold is found once too (deckHealth).
   */
  checkDeck<F extends MarkdownFinding>(
    instanceUrl: string,
    deck: Deck,
    text: DeckTextCheck<F>,
  ): Promise<DeckHealth<F>>;
  /**
   * Have the deck's next check read its cards and reviews documents and
   * the catalog afresh, not reuse what an earlier check found of them:
   * as its health is opened or checked again, after the user may have
   * changed them.
   */
  forgetDeckCheck(instanceUrl: string, deck: Deck): void;
}

/**
 * A test of whether the document at an address is one of these decks'
 * unclaimed ones, in whatever spelling: a deck may name one document
 * twice, and only the first spelling is listed as unclaimed. Each
 * address is compared as a server or its file system may read it
 * (documentKeyOf: `decks/A.ttl` is `decks/a.ttl`), the
 * unclaimed ones brought to that form once for the test, so that a
 * catalog naming many decks costs one lookup per address, not a
 * comparison with every unclaimed document.
 */
function unclaimedTest(unclaimed: readonly UnclaimedDeck[]): (url: string) => boolean {
  // Keyed by pieces (TextMap): an address in documentKeyOf's form may be longer than V8 hashes all of.
  const skipped = new TextMap<true>();
  for (const deck of unclaimed) {
    for (const document of deck.documents)
      skipped.set(documentKeyOf(documentUrlOf(document)), true);
  }
  return (url) => skipped.has(documentKeyOf(documentUrlOf(url)));
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

/**
 * How many decks' checks read at once, each reading up to three
 * documents: as many decks as the deck list's study counts read at once.
 */
const DECK_CHECKS_AT_ONCE = READS_AT_ONCE / 2;

/** The budget a read of the document is made within: the check's for one outside the instance's folder, none for one in it. */
function budgetFor(url: string, instanceUrl: string, budget: ReadBudget): ReadBudget | undefined {
  return isDocumentIn(url, instanceUrl) ? undefined : budget;
}

/** The address of the document `url` is in, as a request sends it (canonicalUrlOf); null for one that is no URL. */
function canonicalDocumentOf(url: string): string | null {
  return canonicalUrlOf(documentUrlOf(url));
}

/** A document to check, and where it is, which picks its shapes. */
type ToCheck = { url: string; context: Exclude<DocumentContext, "library"> };

/**
 * What a check found of a document (sharedCheck): its report, or null
 * for one still at the version the digest says conformed; the version
 * it was read at (null: none known); and whether this read checked it
 * (`fresh`), not a check made before.
 */
interface SharedCheck {
  /** The address the document was read at, in the spelling of the check that read it. */
  url: string;
  report: DocumentReport | null;
  version: string | null;
  fresh: boolean;
}

/**
 * What is kept of a document of the instance last checked (sharedCheck):
 * what the last check of it found, the check of it under way, each with
 * when it started (a tick of the instance checks' clock); its read
 * (sharedReads), with when it started; and since when a check or read of
 * it is to be reused (`since`, forgetDeckCheck).
 */
interface SharedEntry {
  kept?: SharedCheck & { started: number };
  check?: { started: number; found: Promise<SharedCheck> };
  read?: { started: number; found: Promise<unknown> };
  since: number;
}

/**
 * The documents to check, each once however many name it, in whatever
 * spelling of its address (canonicalDocumentOf): a catalog may name one
 * document for a thousand decks. `firsts` are the first to name each;
 * `summary` reports them (null: left out, so no spelling of it is
 * reported), each once, with the other spellings named of their
 * addresses (ValidationReport.spellings), so that a deck finds its
 * documents' reports by the addresses it names and a document's
 * problems are counted and listed once, however it is spelled.
 */
function onceEach(documents: readonly ToCheck[]): {
  firsts: ToCheck[];
  summary: (instanceUrl: string, reports: readonly (DocumentReport | null)[]) => ValidationReport;
} {
  const firsts: ToCheck[] = [];
  const at = new TextMap<number>();
  const firstOf = documents.map((document) => {
    const key = `${document.context} ${canonicalDocumentOf(document.url) ?? document.url}`;
    let index = at.get(key);
    if (index === undefined) {
      index = firsts.push(document) - 1;
      at.set(key, index);
    }
    return index;
  });
  return {
    firsts,
    summary: (instanceUrl, reports) => {
      // Each address is listed once (instanceDocumentUrls), so each spelling is named once.
      const spellings = documents.flatMap((document, index) => {
        const first = firsts[firstOf[index]!]!;
        if (reports[firstOf[index]!] === null || document.url === first.url) return [];
        return [{ url: document.url, of: first.url }];
      });
      return summarize(
        instanceUrl,
        reports.filter((report) => report !== null),
        spellings,
      );
    },
  };
}

/** The longest reason given for a document that could not be read, as the shape check gives one. */
const MAX_REASON_LENGTH = 300;

/**
 * A deck's report with its cards document (`url`) as one that could not
 * be read, for `error`, when the read that lists its cards failed: the
 * deck's health shows that document as unreadable, in place of what its
 * check found, rather than failing as a whole. A report that already
 * says so is kept.
 */
function withCardsUnread(report: ValidationReport, url: string, error: unknown): ValidationReport {
  const found = report.documents.find((document) => document.url === url);
  if (found?.status === "unreadable") return report;
  const reason = error instanceof Error ? error.message : String(error);
  return withUnclaimed(
    summarize(
      report.instanceUrl,
      [
        ...report.documents.filter((document) => document !== found),
        unreadableDocument(
          url,
          reason.length > MAX_REASON_LENGTH ? `${reason.slice(0, MAX_REASON_LENGTH)}…` : reason,
        ),
      ],
      report.spellings,
    ),
    report.unclaimed ?? [],
  );
}

/**
 * The checks of an instance against Solid Memo's shapes (docs/validation.md):
 * the quick one made when it is opened, which spares a document the digest
 * says conformed and has not changed since, the full one of every document,
 * and one deck's; and the decks' unclaimed documents claimed once the user
 * confirms they are the deck's. What a check finds is reported, never
 * repaired: the app leaves that data as it is.
 */
export function createInstanceCheckUseCases({
  deckRepository,
  releaseDraftRepository,
  answerStore,
  shapeValidator,
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
  deckLibrary: DeckLibrary;
  digestStore: Pick<DigestStore, "of" | "remember" | "isInstances">;
  storageGateway: Pick<StorageGateway, "discoverStorages">;
  /** The WebID of whoever is signed in, asked at each call; none when no one is. */
  webId: () => string | undefined;
  ruleset: string;
}): InstanceCheckUseCases {
  /** The instance checks' clock: it ticks as a check of a document starts, or what was found is forgotten. */
  let clock = 0;
  /**
   * What is kept of each document of the instance last checked, by where
   * it is and its address as a request sends it; and since when what was
   * found of every document is to be reused (`since`, checkInstance).
   */
  let shared = { instanceUrl: "", since: 0, entries: new TextMap<SharedEntry>() };
  /** What is kept of the instance's documents, made anew for another instance. */
  function sharedOf(instanceUrl: string) {
    if (shared.instanceUrl !== instanceUrl)
      shared = { instanceUrl, since: 0, entries: new TextMap() };
    return shared;
  }
  /** What is kept of one document of the instance, made when there is none. */
  function entryOf(instanceUrl: string, { url, context }: ToCheck): SharedEntry {
    const { entries } = sharedOf(instanceUrl);
    const key = `${context} ${canonicalDocumentOf(url) ?? url}`;
    let entry = entries.get(key);
    if (entry === undefined) entries.set(key, (entry = { since: 0 }));
    return entry;
  }
  /**
   * The reads of the instance's documents its checks share (SharedReads):
   * of the cards to map them, and to find where a document stands for a
   * deck (DeckRepository.unclaimedDocuments, isUnclaimedAsRead). A
   * catalog may name one document for a thousand decks, and each deck's
   * badge on the Studio's Home checks its deck: the document is read
   * once for them all, in whatever spelling of its address each names
   * it, as it is checked once (sharedCheck), and read again when what was
   * found of it is forgotten, as its check is. A read that fails is kept
   * failed until then too, as a check that could not read the document
   * keeps its report: each deck naming the document is told so, from that
   * one read, and none reads it again for itself.
   *
   * Every read of it is made at its address as a request sends it
   * (SharedReads), so what the first gives is resolved against that
   * spelling, whichever deck asked: a deck finds its cards by their ids
   * and their problems by the document compared in that form
   * (cardSpotsOf), and one frozen list of a document's cards is mapped
   * for them all.
   */
  function sharedReads(instanceUrl: string): SharedReads {
    return <T>(url: string, read: () => Promise<T>): Promise<T> => {
      const entry = entryOf(instanceUrl, { url, context: "pod" });
      const since = Math.max(shared.since, entry.since);
      const kept = entry.read;
      if (kept !== undefined && kept.started > since) return kept.found as Promise<T>;
      const started = ++clock;
      const found = read();
      entry.read = { started, found };
      return found;
    };
  }
  /**
   * The check of a document of the instance, shared by every check that
   * asks for it: each deck's badge on the Studio's Home, say, where a
   * catalog may name one document, and the catalog itself, for a
   * thousand decks. What a check started since what was found was last
   * forgotten found is reused, and a check under way is joined, so a
   * document is checked once for them all, whatever the server answers:
   * with no version, one that cannot be sent, or a new one on every
   * read. What was found is forgotten, and the document read again,
   * when the instance's check is made (checkInstance: as the instance is
   * opened, or its check read afresh), and of a deck's documents when
   * its health is opened or checked again (forgetDeckCheck): a change
   * since, another app's or the user's own, is then found. That read is
   * on condition (validateDocumentSince) with the version it was checked
   * at, or else the one the digest says conformed (`conformed`), and an
   * unchanged document's report is reused. The reports are kept for one
   * instance, the last checked.
   *
   * A check under way is joined within the budget of the check that
   * started it: every check gives a budget of its own (OUTSIDE_READS_MS)
   * as it starts.
   */
  function sharedCheck(
    instanceUrl: string,
    document: ToCheck,
    conformed: string | undefined,
    budget: ReadBudget | undefined,
  ): Promise<SharedCheck> {
    const { url, context } = document;
    const entry = entryOf(instanceUrl, document);
    const since = Math.max(shared.since, entry.since);
    let found: Promise<SharedCheck>;
    if (entry.check !== undefined && entry.check.started > since) found = entry.check.found;
    else if (entry.kept !== undefined && entry.kept.started > since)
      found = Promise.resolve({ ...entry.kept, fresh: false });
    else {
      const started = ++clock;
      const kept = entry.kept;
      const version = kept === undefined ? conformed : (kept.version ?? undefined);
      found = shapeValidator
        .validateDocumentSince(url, version, context, budget)
        .then((read): SharedCheck => {
          const result: SharedCheck = read.unchanged
            ? kept === undefined
              ? // Unchanged only on condition: on the version the digest says conformed.
                { url, report: null, version: version!, fresh: false }
              : { ...kept, fresh: false }
            : { url, report: read.value, version: read.version, fresh: true };
          // A check started earlier that ends later keeps the newer's.
          if (entry.kept === undefined || entry.kept.started < started)
            entry.kept = { ...result, started };
          return result;
        })
        .finally(() => {
          if (entry.check?.started === started) entry.check = undefined;
        });
      entry.check = { started, found };
    }
    // Under the address this check names it by, as onceEach reports another spelling.
    return found.then((one) =>
      one.report === null || one.url === url
        ? { ...one, url }
        : { ...one, url, report: { ...one.report, url } },
    );
  }
  async function checkInstance(instanceUrl: string): Promise<ValidationReport> {
    // Made as the instance is opened, or its check read afresh: what was found of it before is read again.
    sharedOf(instanceUrl).since = ++clock;
    const [decks, drafts, digest] = await Promise.all([
      deckRepository.listDecks(instanceUrl),
      releaseDraftRepository.documents(instanceUrl),
      digestStore.of(instanceUrl),
    ]);
    const budget = readBudget(OUTSIDE_READS_MS);
    const unclaimed = await unclaimedDecksOf(instanceUrl, decks, budget, sharedReads(instanceUrl));
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
   * longer. With `reads`, each is read as those reads share it.
   */
  async function unclaimedDecksOf(
    instanceUrl: string,
    decks: readonly Deck[],
    budget: ReadBudget,
    reads?: SharedReads,
  ): Promise<UnclaimedDeck[]> {
    const outsidePodOf = outsidePodTest(instanceUrl);
    const found = await mapAtOnce(decks, async (deck) => {
      const documents = await deckRepository.unclaimedDocuments(deck, budget, reads);
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
   * spelling of its address (unclaimedTest): it may be anyone's, and
   * what the check found there would hold back a deck for data that is
   * not its own.
   */
  function documentsToCheck(
    instanceUrl: string,
    decks: readonly Deck[],
    drafts: readonly string[],
    unclaimed: readonly UnclaimedDeck[],
  ): ToCheck[] {
    const isUnclaimed = unclaimedTest(unclaimed);
    return [
      ...instanceDocumentUrls(instanceUrl, decks)
        .filter((url) => !isUnclaimed(url))
        .map((url) => ({ url, context: "pod" as const })),
      ...drafts.map((url) => ({ url, context: "draft" as const })),
    ];
  }
  /**
   * The check of these documents of the instance, each once however many
   * name it (onceEach), and not checked again while still at the version
   * the digest says conformed, nor again what a check of the instance made
   * since it was last forgotten found (sharedCheck). A receipt is
   * kept only of one that is the instance's (DigestStore.isInstances).
   * A document that cannot be read is in the report as one
   * (ShapeValidator), so it holds back only what it is part of; so is one
   * outside the instance's folder not read within the check's `budget`.
   */
  async function checkDocuments(
    instanceUrl: string,
    urls: readonly ToCheck[],
    digest: InstanceDigest,
    decks: readonly Deck[],
    budget: ReadBudget,
  ): Promise<ValidationReport> {
    const { firsts, summary } = onceEach(urls);
    // A few at a time: the catalog says how many there are (MAX_CATALOG_LINKS of each kind at most).
    const documents = await mapAtOnce(firsts, async (document): Promise<DocumentReport> => {
      const { url } = document;
      const receipt = digest.receipts[url];
      const found = await sharedCheck(
        instanceUrl,
        document,
        receipt?.conformedTo === ruleset ? receipt.version : undefined,
        budgetFor(url, instanceUrl, budget),
      );
      if (found.report === null) return { url, status: "checked", subjects: [] };
      // A receipt only of a document that is the instance's: one an instance from another's pod names may be the user's own.
      if (
        found.fresh &&
        found.version !== null &&
        summarize(instanceUrl, [found.report]).conforms &&
        (await digestStore.isInstances(instanceUrl, url))
      ) {
        digestStore.remember(instanceUrl, noting(url, found.version, { conformedTo: ruleset }));
      }
      return found.report;
    });
    return summary(
      instanceUrl,
      await withoutUnclaimedOnRead(instanceUrl, decks, documents, budget, sharedReads(instanceUrl)),
    );
  }
  /**
   * The reports without those of a deck's document that its read shows
   * is unclaimed for every deck naming it (isUnclaimedAsRead): what the
   * check found is in a document that is no deck's, a release in the
   * instance's folder say, and holds back no deck. Only a report with a
   * problem needs that read, so a check of an
   * unchanged instance still downloads nothing. One outside the
   * instance's folder is read within the check's `budget`, and its report
   * kept when it is not. Each report in its place, null for one left out;
   * given each document once (onceEach), each is read once, and with
   * `reads` once for the checks that share them too.
   */
  async function withoutUnclaimedOnRead(
    instanceUrl: string,
    decks: readonly Deck[],
    documents: readonly DocumentReport[],
    budget: ReadBudget,
    reads?: SharedReads,
  ): Promise<(DocumentReport | null)[]> {
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
          reads,
        ))
      );
    });
    return documents.map((document, index) => (left[index] ? null : document));
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
    const { firsts, summary } = onceEach(urls);
    let checked = 0;
    onChecked(checked, firsts.length);
    const documents = await mapAtOnce(firsts, async ({ url, context }) => {
      const document = await shapeValidator.validateDocument(
        url,
        context,
        budgetFor(url, instanceUrl, budget),
      );
      onChecked(++checked, firsts.length);
      return document;
    });
    return withUnclaimed(
      summary(instanceUrl, await withoutUnclaimedOnRead(instanceUrl, decks, documents, budget)),
      unclaimed,
    );
  }

  /**
   * The decks' checks, in turns of their own (DECK_CHECKS_AT_ONCE): a
   * list shows a health badge for every deck its catalog names, and each
   * badge seen asks for its deck's check, so a long list never has all of
   * their documents read at once. A turn ends only once every read of its
   * check has settled, even when one of them fails first.
   */
  const deckCheckTurn = inTurns(DECK_CHECKS_AT_ONCE);
  /**
   * What one deck's check reads of the pod: its entry and documents
   * checked against the shapes, as the instance's check does, and its
   * cards as the deck's page reads them.
   */
  function checkDeckReads(instanceUrl: string, deck: Deck) {
    const budget = readBudget(OUTSIDE_READS_MS);
    const reads = sharedReads(instanceUrl);
    return allSettledThen([
      Promise.all([
        digestStore.of(instanceUrl),
        unclaimedDecksOf(instanceUrl, [deck], budget, reads),
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
      // Read as the deck's page reads it, within the read's own deadlines: a read that fails shows the
      // cards document as unreadable in this deck's health (withCardsUnread), and holds back nothing else.
      deckRepository.listCards(deck, { reads }).then(
        (cards) => ({ cards, unread: undefined }),
        (error: unknown) => {
          if (error instanceof AppError && error.code === "deckGone") throw error;
          return { cards: [], unread: error };
        },
      ),
    ]);
  }

  return {
    validateInstance,
    checkInstance,
    async claimDeckDocuments(instanceUrl, deckUrl, documents) {
      const deck = (await deckRepository.listDecks(instanceUrl)).find(
        (listed) => listed.url === deckUrl,
      );
      if (deck === undefined) throw new AppError("deckGone", { deck: deckUrl });
      // The catalog may name other documents now than the check showed the user: only those confirmed are claimed.
      if (!isSameDocuments(await deckRepository.unclaimedDocuments(deck), documents))
        throw new AppError("changedElsewhere", { url: deckUrl });
      const [outside] = await outsidePodTest(instanceUrl)(documents);
      if (outside !== undefined)
        throw new AppError("claimOutsidePod", { deck: deck.title, url: outside });
      await deckRepository.claimDocuments(deck, documents);
    },
    forgetDeckCheck(instanceUrl, deck) {
      if (shared.instanceUrl !== instanceUrl) return;
      for (const url of [catalogUrlOf(instanceUrl), deck.cardsDocumentUrl, deck.reviewsDocumentUrl])
        entryOf(instanceUrl, { url, context: "pod" }).since = ++clock;
    },
    async checkDeck(instanceUrl, deck, text) {
      // Nothing kept is looked up before a check of the instance started in the same turn forgets it: one
      // reading of the instance's check afresh starts it and the decks' at once, in whatever order.
      await Promise.resolve();
      const [[report, listed], release] = await Promise.all([
        deckCheckTurn(() => checkDeckReads(instanceUrl, deck)),
        // A release that cannot be read leaves the sides to settle unknown, not the rest of the check. The
        // library takes its own reads in turns.
        deck.sourceUrl === undefined
          ? []
          : deckLibrary.fetchLibraryDeck(deck.sourceUrl).then(
              (release) => release.cards,
              () => undefined,
            ),
      ]);
      return deckHealth(
        deck,
        listed.unread === undefined
          ? report
          : withCardsUnread(report, deck.cardsDocumentUrl, listed.unread),
        listed.cards,
        release,
        text,
      );
    },
  };
}
