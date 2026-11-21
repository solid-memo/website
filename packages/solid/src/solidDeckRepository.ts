// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  type NamedSubject,
  type Subject,
  type SubjectBuilder,
  buildThing,
  createSolidDataset,
  getThing,
  getUrlAll,
  setThing,
} from "./client/rdf";
import type { Catalog } from "@solid-memo/domain/catalog";
import type { LangText } from "@solid-memo/domain/langText";
import { copyKeywords, noKeywords, type LangTexts } from "@solid-memo/domain/keywords";
import type { CardChangeOptions, CardChanges, DeckRepository } from "@solid-memo/application/ports";
import type { KeptDocuments } from "@solid-memo/domain/instance";
import {
  CARD_FORMAT_VERSION,
  DECK_FORMAT_VERSION,
  DEFAULT_DECK_DIRECTION,
  MAX_DECK_GROUPS,
  boundedCompletedChapters,
  withBoundedMetadata,
  type Card,
  type CardContent,
  type Deck,
  type DeckDirection,
} from "@solid-memo/domain/deck";
import { cardToRecord } from "@solid-memo/domain/deckRecord";
import { editCompletedChapters as completedChaptersAfter } from "@solid-memo/domain/course";
import { withStatedLanguages } from "@solid-memo/domain/deckLanguages";
import { withCardLanguage } from "@solid-memo/domain/deckCardLanguage";
import { storedPictureHosts, withPictureHost } from "@solid-memo/domain/deckPictures";
import type { DeckPause } from "@solid-memo/domain/deckPause";
import {
  cardsContainerOf,
  catalogUrlOf,
  documentsInUse,
  ensureTrailingSlash,
  canonicalUrlOf,
  documentKeyOf,
  reviewsContainerOf,
  subjectOfDocument,
} from "@solid-memo/domain/instanceLayout";
import { isDeckInPlace } from "@solid-memo/domain/deckAddress";
import { TextMap } from "@solid-memo/domain/pathKeys";
import { documentUrlOf, fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { isDeckOutdated, isOutdated, upgradeCard, upgradeDeck } from "@solid-memo/domain/migration";
import { ABSENT_VERSION } from "@solid-memo/domain/studyDigest";
import { CARD_V7, DECK_V6 } from "@solid-memo/vocab/descriptors.generated";
import {
  applyDeckTreeEdit,
  buildTree,
  groupCount,
  type StoredLayout,
  treeChanges,
} from "@solid-memo/domain/deckTree";
import {
  deleteDataset,
  getSolidDatasetOrNull,
  PreconditionFailedError,
  refuseUnreadableImport,
  removeOwned,
  saveDataset,
  statusOf,
  versionOf,
  type Removal,
  TOO_LARGE,
  UNREADABLE,
} from "./datasets";
import { deckDocumentSubjects } from "./ownership";
import { DCTERMS, RDF, SCHEMA, SM } from "./vocab";
import {
  deckSubjects,
  decksSubjects,
  toDistractor,
  toCard,
  toCards,
  toCatalog,
  toDecks,
  decksWithAgentsWithinBound,
  withCatalog,
  withDeck,
  withDecks,
  writeDistractors,
  withoutCardSubjects,
  withoutUnnamedDistractors,
  assertDistractorsOwnedOnce,
  withoutDecks,
  withSuggestedAnswers,
} from "./mappers/deckMapper";
import { toStoredLayout, withTreeChanges } from "./mappers/deckTreeMapper";
import { createDeckDocumentGuard, readAt, type UserStorages } from "./deckPlace";
import { editOf, type DatasetEdit } from "./datasetEdit";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { withoutReviewStates } from "./mappers/reviewStateMapper";
import {
  datetimeLiteral,
  readDatetime,
  carriedTo,
  recordThing,
  unlessNewer,
  unlessTyped,
  withoutForeignShapedClasses,
} from "./records";
import { mapSince, readSince } from "./readSince";
import { AppError } from "@solid-memo/domain/appError";
import { linksGuestPod } from "@solid-memo/domain/guest";
import { finishCutOffImport, unsent } from "@solid-memo/application/writes";
import { sameDeckState, withDeckChanges } from "@solid-memo/domain/deckUpgrade";
import { refuseFullDeckList, withinCatalogLimit } from "./catalogLinks";

/**
 * A card to write, by its id: a new card is stamped with the time of
 * writing; one with `fromRelease` names the release it was taken from.
 */
type CardToWrite = CardContent & {
  id: string;
  createdAt?: string;
  retired?: true;
  fromRelease?: string;
};

/** A card to write, onto the subject it has in the document now, if any. */
interface CardWrite {
  card: CardToWrite;
  existing: NamedSubject | null;
}

export interface SolidDeckRepositoryDeps {
  fetch: typeof globalThis.fetch;
  /** The fetch of a deck's cards read as no one (listCards, readCardsSince `asNoOne`); `fetch` by default. */
  publicFetch?: typeof globalThis.fetch;
  now: () => Date;
  randomId: () => string;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
  /** The signed-in user's storages, for where a deck's document is (deckPlace.ts UserStorages); none by default. */
  userStorages?: UserStorages;
}

/**
 * How often an edit of the deck arrangement, a chapter's completion, or
 * the entry of a guest's deck added (addDeck) is made, in all, while the
 * catalog document keeps changing elsewhere (412). The edit is applied
 * again to the document as it is then, so a retry keeps what changed.
 */
const TREE_ATTEMPTS = 3;

/**
 * The arrangement the catalog states (toStoredLayout), or
 * catalogTooManyLinks past MAX_CATALOG_LINKS decks, as listDecks gives
 * (each deck's documents are read by whoever shows the tree), or past
 * MAX_DECK_GROUPS groups, each of which the deck list draws.
 */
function cappedLayout(dataset: Dataset, catalogUrl: string): StoredLayout {
  const layout = toStoredLayout(dataset, catalogUrl);
  withinCatalogLimit(layout.decks);
  if (layout.groups.length > MAX_DECK_GROUPS)
    throw new AppError("catalogTooManyLinks", { limit: MAX_DECK_GROUPS });
  return layout;
}

export function createSolidDeckRepository({
  fetch,
  publicFetch = fetch,
  now,
  randomId,
  checkWrite = noWriteCheck,
  userStorages,
}: SolidDeckRepositoryDeps): DeckRepository {
  const guard = createDeckDocumentGuard(fetch, userStorages);

  /** The catalog document as saveCatalog writes it, and the subjects it writes; nothing is sent. */
  async function catalogWrite(instanceUrl: string, catalog: Catalog) {
    const catalogUrl = catalogUrlOf(instanceUrl);
    const read = (await getSolidDatasetOrNull(catalogUrl, fetch)) ?? createSolidDataset();
    return {
      catalogUrl,
      dataset: withCatalog(read, catalogUrl, catalog),
      subjects: [`${catalogUrl}#catalog`, catalog.publisher.webId],
    };
  }

  /** Save a document once the subjects the write touched are checked. */
  async function save(
    url: string,
    dataset: Dataset,
    subjects: readonly string[],
    options?: { whole?: boolean },
  ): Promise<void> {
    await checkWrite(dataset, subjects, "pod");
    await saveDataset(url, dataset, fetch, options);
  }

  /**
   * Save a deck's cards document, saying whose it is, once the subjects
   * the write touched are checked: only one that is the deck's to change
   * (deckPlace.ts, guard.writable), else nothing is sent.
   */
  async function saveCardsDocument(
    deck: Deck,
    dataset: Dataset,
    subjects: readonly string[],
    options?: { whole?: boolean },
  ): Promise<void> {
    const written = await checkedCardsDocument(deck, dataset, subjects);
    await saveDataset(deck.cardsDocumentUrl, written, fetch, options);
  }

  /** The cards document saveCardsDocument sends, once checked as it checks it; nothing is sent. */
  async function checkedCardsDocument(
    deck: Deck,
    dataset: Dataset,
    subjects: readonly string[],
  ): Promise<Dataset> {
    assertDistractorsOwnedOnce(dataset, subjects);
    const written = await guard.writable(deck, deck.cardsDocumentUrl, dataset);
    await checkWrite(written, subjects, "pod");
    return written;
  }

  /**
   * The write applyCardChanges makes, read, refused and checked as it
   * is, but not sent: the function returned sends it (DeckRepository).
   */
  async function prepareCardChanges(
    deck: Deck,
    changes: CardChanges,
    { whole, version, carried, fromFile }: CardChangeOptions = {},
  ): Promise<() => Promise<void>> {
    const read = await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch);
    // Changes made from an earlier read go only to the document as it was then: a later edit is not undone.
    if (
      version !== undefined &&
      (read === null ? ABSENT_VERSION : (versionOf(read) ?? null)) !== version
    ) {
      throw new PreconditionFailedError(
        deck.cardsDocumentUrl,
        version === ABSENT_VERSION ? "absent" : "unchanged",
      );
    }
    // A card copied from another deck starts from what that deck's document says of it.
    const source =
      carried === undefined
        ? null
        : await getSolidDatasetOrNull(
            carried.deck.cardsDocumentUrl,
            carried.asNoOne === true ? publicFetch : fetch,
          );
    const changed = withCardChanges(
      read ?? createSolidDataset(),
      deck,
      changes,
      source === null
        ? undefined
        : (id) => {
            if (!Object.hasOwn(carried!.ids, id)) return null;
            return getThing(source, `${carried!.deck.cardsDocumentUrl}#${carried!.ids[id]}`);
          },
    );
    const written = await checkedCardsDocument(deck, changed.dataset, changed.subjects);
    // A deck file's cards in one document no later read would take in are not written.
    if (fromFile === true) await refuseUnreadableImport(deck.cardsDocumentUrl, written);
    // If-Match the read above: a document changed since is not written over.
    return () => saveDataset(deck.cardsDocumentUrl, written, fetch, { whole });
  }

  return {
    async listDecks(instanceUrl): Promise<Deck[]> {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      if (dataset === null) return [];
      // Each deck's documents are read by whoever lists them: no more decks than a catalog may have.
      return withinCatalogLimit(toDecks(dataset, catalogUrl));
    },

    async readCatalog(instanceUrl) {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      return dataset === null ? null : toCatalog(dataset, catalogUrl);
    },

    async saveCatalog(instanceUrl, catalog) {
      const { catalogUrl, dataset, subjects } = await catalogWrite(instanceUrl, catalog);
      await save(catalogUrl, dataset, subjects);
    },

    async checkCatalogSave(instanceUrl, catalog) {
      const { dataset, subjects } = await catalogWrite(instanceUrl, catalog);
      await checkWrite(dataset, subjects, "pod");
    },

    async upgradeDecks(instanceUrl, catalog) {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const read = await getSolidDatasetOrNull(catalogUrl, fetch);
      let dataset = read ?? createSolidDataset();
      // Each entry stored in an older format, as read and brought up to date in memory, written in this app's; one whose agents no write would take is left as it is, not keeping the others back.
      const written = decksWithAgentsWithinBound(
        dataset,
        toDecks(dataset, catalogUrl).filter(isDeckOutdated).map(upgradeDeck),
      );
      dataset = withDecks(dataset, written);
      const subjects = decksSubjects(dataset, written);
      // Only where there is none: one that does not fit its shape is invalid data, left as it is.
      if (catalog !== null && toCatalog(dataset, catalogUrl) === null) {
        dataset = withCatalog(dataset, catalogUrl, catalog);
        subjects.push(`${catalogUrl}#catalog`, catalog.publisher.webId);
      }
      if (subjects.length === 0) return false;
      // If-Match the read above (a creation, where there was no document): written only as it was read.
      await save(catalogUrl, dataset, subjects);
      return true;
    },

    createDeck(instanceUrl, title): Promise<Deck> {
      return registerDeck(newDeck(instanceUrl, title));
    },

    registerDeck,

    async importDeck(instanceUrl, content): Promise<Deck> {
      // What a copy keeps of the release, by address, never links to a guest's pod: a guest's copy would stay there (GHSA-hc3p-fpwj-fvjp).
      if (linksGuestPod([content.license, content.themes, content.cards]))
        throw new AppError("releaseLinksGuestPod", { url: content.url });
      const deck = newDeck(instanceUrl, content.title, content);
      // Each card names the release it is taken from: the series', which an upgrade may change.
      const written = withCards(createSolidDataset(), deck, content.cards, (_, card) => ({
        card: { ...card, fromRelease: content.url },
        existing: null,
      }));
      // Checked first: an entry that would be refused leaves no cards document behind.
      const entry = await catalogWithEntry(deck);
      await checkWrite(entry.dataset, entry.subjects, "pod");
      try {
        await saveCardsDocument(deck, written.dataset, written.subjects);
      } catch (error) {
        // A write refused was never made: nothing of the import's is there.
        if (unsent(error)) throw error;
        return finishImport(deck, error);
      }
      return registerDeck(deck).catch((error: unknown) => finishImport(deck, error));
    },

    async addDeck(deck): Promise<Deck> {
      const catalogUrl = documentUrlOf(deck.url);
      const written: Deck = { ...deck, formatVersion: DECK_FORMAT_VERSION };
      for (let attempt = 1; ; attempt++) {
        const dataset = (await getSolidDatasetOrNull(catalogUrl, fetch)) ?? createSolidDataset();
        if (getThing(dataset, deck.url) !== null)
          throw new PreconditionFailedError(deck.url, "absent");
        refuseFullDeckList(toDecks(dataset, catalogUrl));
        const updated = withOwnTerms(withDeck(dataset, written), deck);
        try {
          // If-Match the read above: the catalog changed elsewhere meanwhile is read and the entry added again.
          await save(catalogUrl, updated, deckSubjects(updated, written));
          return written;
        } catch (error) {
          if (!(error instanceof PreconditionFailedError) || attempt === TREE_ATTEMPTS) throw error;
        }
      }
    },

    renameDeck(deck, title): Promise<Deck> {
      return saveDeck({ ...deck, title });
    },

    saveDeck,

    saveDecks,

    removeDeck(deck) {
      return removeDecks([deck]);
    },

    removeDecks,

    async readDeckTree(instanceUrl) {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      return buildTree(cappedLayout(dataset ?? createSolidDataset(), catalogUrl));
    },

    async editDeckTree(instanceUrl, edit) {
      const catalogUrl = catalogUrlOf(instanceUrl);
      for (let attempt = 1; ; attempt++) {
        const dataset = (await getSolidDatasetOrNull(catalogUrl, fetch)) ?? createSolidDataset();
        const stored = cappedLayout(dataset, catalogUrl);
        const before = buildTree(stored);
        const after = applyDeckTreeEdit(before, edit);
        if (after === before) return after;
        // One group more than are read would leave the arrangement unread (cappedLayout).
        if (groupCount(after.children) > MAX_DECK_GROUPS)
          throw new AppError("catalogFull", { limit: MAX_DECK_GROUPS });
        const { dataset: updated, subjects } = withTreeChanges(
          dataset,
          catalogUrl,
          treeChanges(stored, after),
        );
        // Only the groups and the catalog are checked: a deck's position is
        // no shape's, and a deck set aside beside the moved one must not stop it.
        await checkWrite(updated, subjects, "pod");
        try {
          // A PATCH, If-Match the read above: where the pod has no strong ETag
          // to match, a whole PUT would undo what changed meanwhile.
          await saveDataset(catalogUrl, updated, fetch);
          return after;
        } catch (error) {
          if (!(error instanceof PreconditionFailedError) || attempt === TREE_ATTEMPTS) throw error;
        }
      }
    },

    async listCards(deck, { asNoOne = false, reads } = {}): Promise<Card[]> {
      // Checked here too, not only where the deck was listed: a deck out
      // of place is never read (docs/data-model.md).
      if (!isDeckInPlace(deck)) throw new AppError("deckGone", { deck: deck.title });
      const url = deck.cardsDocumentUrl;
      // A shared read is resolved against the address as a request sends it, whichever deck's spelling asked first.
      const at = asNoOne ? url : readAt(url, reads);
      const dataset = asNoOne
        ? await getSolidDatasetOrNull(url, publicFetch)
        : await guard.read(url, reads);
      if (dataset === null) return [];
      return cardsOf(dataset, at);
    },

    async readCardsSince(deck, version, { asNoOne = false } = {}) {
      const read = await readSince(deck.cardsDocumentUrl, version, asNoOne ? publicFetch : fetch);
      return mapSince(read, (dataset) =>
        dataset === null ? [] : cardsOf(dataset, deck.cardsDocumentUrl),
      );
    },

    async addCard(deck, content): Promise<Card> {
      const id = `card-${randomId()}`;
      const card: Card = {
        id,
        url: `${deck.cardsDocumentUrl}#${id}`,
        ...content,
        createdAt: now().toISOString(),
        formatVersion: CARD_FORMAT_VERSION,
      };
      const dataset =
        (await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch)) ?? createSolidDataset();
      const written = withCard(dataset, deck, card, null);
      await saveCardsDocument(deck, written.dataset, written.subjects);
      return card;
    },

    async updateCard(deck, card, content): Promise<Card> {
      const dataset = await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch);
      if (dataset === null) {
        throw new AppError("cardsDocumentGone", { deck: deck.title });
      }
      const thing = getThing(dataset, card.url);
      if (thing === null) {
        throw new AppError("cardGone", { card: card.url });
      }
      // An edit that does not state distractors (the card editor's, while its wrong options are
      // unchanged) keeps the card's,
      // and one that does not state a text format, or what the card is about, keeps the card's too.
      const distractors = content.distractors ?? card.distractors;
      const textFormat = content.textFormat ?? card.textFormat;
      const subjects = content.subjects ?? card.subjects;
      const updated: Card = {
        id: card.id,
        url: card.url,
        createdAt: card.createdAt,
        ...content,
        ...(distractors === undefined ? {} : { distractors }),
        ...(textFormat === undefined ? {} : { textFormat }),
        ...(subjects === undefined ? {} : { subjects }),
        formatVersion: CARD_FORMAT_VERSION,
        ...(card.retired === true ? { retired: true } : {}),
      };
      const written = withCard(dataset, deck, updated, thing);
      await saveCardsDocument(deck, written.dataset, written.subjects);
      return updated;
    },

    async upgradeCards(deck): Promise<boolean> {
      const dataset = await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch);
      if (dataset === null) return false;
      // Each card stored in an older format, as read and brought up to date in memory, written in this app's.
      const written = withCards(
        dataset,
        deck,
        toCards(dataset, deck.cardsDocumentUrl).filter(isOutdated),
        (edit, card) => ({
          card: upgradeCard(card),
          existing: edit.getThing(card.url),
        }),
      );
      if (written.subjects.length === 0) return false;
      // If-Match the read above; an edit too large for one PATCH is one PUT of the whole document (datasets.ts).
      await saveCardsDocument(deck, written.dataset, written.subjects);
      return true;
    },

    async stateCardLanguages(deck, cardIds, languages): Promise<number> {
      const dataset = await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch);
      if (dataset === null) return 0;
      const stated: string[] = [];
      const written = withCards(dataset, deck, cardIds, (edit, id) => {
        const thing = edit.getThing(`${deck.cardsDocumentUrl}#${id}`);
        const card = thing === null ? null : toCard(thing, dataset);
        const restated = card === null ? null : withStatedLanguages(card, languages);
        if (restated === null) return null;
        stated.push(restated.url);
        return { card: restated, existing: thing };
      });
      // One PUT of the whole document, If-Match the read above: a cards document changed
      // meanwhile is not overwritten, and no PATCH of text is cut short (saveDataset's `whole`).
      if (stated.length > 0)
        await saveCardsDocument(deck, written.dataset, stated, { whole: true });
      return stated.length;
    },

    async applyCardChanges(deck, changes, options): Promise<void> {
      await (await prepareCardChanges(deck, changes, options))();
    },

    prepareCardChanges,

    async addCardIfAbsent(deck, card): Promise<boolean> {
      const read = await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch);
      const dataset = read ?? createSolidDataset();
      const there = getThing(dataset, `${deck.cardsDocumentUrl}#${card.id}`);
      if (there !== null && toCard(there, dataset) !== null) return false;
      const changed = withCardChanges(dataset, deck, { save: [card], remove: [] });
      await saveCardsDocument(deck, changed.dataset, changed.subjects);
      return true;
    },

    readDeck,

    async upgradeDeckEntry(current, next): Promise<Deck> {
      const { catalogUrl, dataset, subjects, written } = await upgradedEntry(current, next);
      // The write carries If-Match of the read above: the entry changes as it was checked, or not at all.
      await save(catalogUrl, dataset, subjects);
      return written;
    },

    async checkDeckEntryUpgrade(current, next) {
      const { dataset, subjects } = await upgradedEntry(current, next);
      await checkWrite(dataset, subjects, "pod");
    },

    deleteDocument,

    completeChapter(deck, chapterUrl) {
      return editCompletedChapters(deck, (completed) =>
        // Completed in any release: a chapter keeps its fragment id from one release to the next.
        completed.some((url) => fragmentIdOf(url) === fragmentIdOf(chapterUrl))
          ? null
          : { add: [chapterUrl], remove: [] },
      );
    },

    setCompletedChapters(deck, edit) {
      return editCompletedChapters(
        deck,
        (completed) => {
          const kept = new Set(completedChaptersAfter(completed, edit));
          const remove = completed.filter((url) => !kept.has(url));
          return remove.length === 0 ? null : { add: [], remove };
        },
        // The Studio's edit: the deck's entry must be as its shape says, as for any other edit of it.
        true,
      );
    },

    setCardLanguage(deck, language) {
      return editEntry(deck, (stored) =>
        stored.cardLanguage === (language ?? undefined)
          ? null
          : {
              edit: (entry) => {
                const cleared = entry.removeAll(SM.deckCardLanguage);
                return language === null
                  ? cleared
                  : cleared.addStringNoLocale(SM.deckCardLanguage, language);
              },
              deck: withCardLanguage(stored, language),
            },
      );
    },

    setPictureHost(deck, host, shown) {
      return editEntry(deck, (stored) => {
        if ((stored.pictureHosts ?? []).includes(host) === shown) return null;
        const changed = withPictureHost(stored, host, shown);
        return {
          edit: (entry) =>
            entry
              .removeAll(SM.deckPictureHost)
              .setStringAll(SM.deckPictureHost, hostStrings(changed.pictureHosts)),
          deck: changed,
        };
      });
    },

    setPause(deck, pause) {
      return editEntry(deck, (stored) => {
        if (samePause(stored.pause, pause ?? undefined)) return null;
        const { pause: _old, ...rest } = stored;
        return {
          edit: (entry) => withPauseTerms(entry.removeAll(SM.deckPausedAt), pause ?? undefined),
          deck: pause === null ? rest : { ...rest, pause },
        };
      });
    },

    async removeCard(deck, card): Promise<void> {
      guard.assertUsable(deck);
      // Only a card of the deck's own cards document is removed, with the review states of its
      // fragment: another subject that shares its id is no card of the deck (ownSubjectsOf).
      if (!subjectOfDocument(deck.cardsDocumentUrl)(card.url))
        throw new AppError("cardGone", { card: card.url });
      const cardId = fragmentIdOf(card.url);
      const cards = await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch);
      const named = `${deck.cardsDocumentUrl}#${cardId}`;
      if (card.url !== named && cards !== null && getThing(cards, named) !== null)
        throw new AppError("cardGone", { card: card.url });
      const reviews = await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch);
      // Both documents are held to the guard before either is written.
      const cardsWritten =
        cards === null
          ? null
          : await guard.writable(deck, deck.cardsDocumentUrl, withoutCard(cards, card.url));
      const reviewsWritten =
        reviews === null
          ? null
          : await guard.writable(
              deck,
              deck.reviewsDocumentUrl,
              // Its states both ways, whether they name it (sm:reviewOf) or are named after it.
              withoutReviewStates(reviews, deck, [
                { cardId, direction: "front-to-back" },
                { cardId, direction: "back-to-front" },
              ]),
            );
      for (const [url, written] of [
        [deck.cardsDocumentUrl, cardsWritten],
        [deck.reviewsDocumentUrl, reviewsWritten],
      ] as const) {
        if (written !== null) await saveDataset(url, written, fetch);
      }
    },

    unclaimedDocuments(deck, budget, reads) {
      return guard.unclaimed(deck, budget, reads);
    },

    isUnclaimedAsRead(decks, url, budget, reads) {
      // A read that fails, or is not made in time, says nothing of a document the check has just found faulty.
      const read = () => guard.unclaimedAsRead(decks, url, false, reads);
      return budget === undefined ? read() : budget.spend(false, read);
    },

    claimDocuments(deck) {
      return guard.claim(deck);
    },
  };

  /**
   * Change the chapters a course's deck completed (sm:completedChapter):
   * what `change` adds and removes of them as the entry has them now
   * (editEntry), in time linear in them. No change (null) writes
   * nothing; a change writes those it keeps and those it adds after
   * them, at most MAX_COMPLETED_CHAPTERS (boundedCompletedChapters,
   * the deck's release and the chapters added counting as the course's):
   * past the bound, values of other documents go first, then the
   * oldest, so the entry never holds more than a read keeps (toDeck)
   * and other values never push out a real completion. sm:completedChapter is no shape's (like a
   * deck's sm:position): a learner's completion checks
   * nothing a shape owns, while an edit in the Studio (`checked`) has the
   * entry checked as any other edit of it is.
   */
  function editCompletedChapters(
    deck: Deck,
    change: (completed: readonly string[]) => { add: string[]; remove: string[] } | null,
    checked = false,
  ): Promise<Deck> {
    return editEntry(
      deck,
      (stored) => {
        const completed = stored.completedChapters ?? [];
        const changed = change(completed);
        if (changed === null) return null;
        const removed = new Set(changed.remove);
        const kept = completed.filter((url) => !removed.has(url));
        // Never more than a read keeps, the course's own kept before any other value.
        const after = boundedCompletedChapters(
          [...kept, ...changed.add],
          [stored.sourceUrl, ...changed.add],
        );
        const { completedChapters: _, ...rest } = stored;
        return {
          // One write of them all: a removal each would copy them all each time (GHSA-gq27-7968-wfcv).
          edit: (entry) => entry.setIriAll(SM.completedChapter, after),
          deck: after.length === 0 ? rest : { ...rest, completedChapters: after },
        };
      },
      checked,
    );
  }

  /**
   * Edit a deck's catalog entry as it is now, for a term no shape owns
   * and withDeck keeps as stored: `change` is given the deck the entry
   * says, and returns how to edit the entry and the deck it then says, or
   * null for no change, which writes nothing. ONE save made only if the
   * catalog document is as it was read (If-Match), else read and changed
   * again, TREE_ATTEMPTS times in all; `checked` has the entry checked
   * first. Throws deckGone when the deck has no entry.
   */
  async function editEntry(
    deck: Deck,
    change: (stored: Deck) => {
      edit: (entry: SubjectBuilder) => SubjectBuilder;
      deck: Deck;
    } | null,
    checked = false,
  ): Promise<Deck> {
    const catalogUrl = documentUrlOf(deck.url);
    for (let attempt = 1; ; attempt++) {
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      const stored =
        dataset === null
          ? undefined
          : toDecks(dataset, catalogUrl).find((candidate) => candidate.url === deck.url);
      if (stored === undefined) throw new AppError("deckGone", { deck: deck.title });
      const changed = change(stored);
      if (changed === null) return stored;
      // A class another app gave the entry that a shape asks something of goes, as recordThing drops it.
      const entry = changed.edit(
        buildThing(
          withoutForeignShapedClasses(unlessNewer(getThing(dataset!, deck.url)!), DECK_V6),
        ),
      );
      const updated = setThing(dataset!, entry.build());
      if (checked) await checkWrite(updated, [deck.url], "pod");
      try {
        // A PATCH of the triples changed, If-Match the read above.
        await saveDataset(catalogUrl, updated, fetch);
        return changed.deck;
      } catch (error) {
        if (!(error instanceof PreconditionFailedError) || attempt === TREE_ATTEMPTS) throw error;
      }
    }
  }

  /** Rewrite a deck's catalog entry in place (saveDecks). */
  async function saveDeck(deck: Deck): Promise<Deck> {
    return (await saveDecks([deck]))[0]!;
  }

  /**
   * Rewrite decks' catalog entries in place, in this app's format, one
   * save per catalog document: each entry's own predicates are replaced
   * from the deck, so unknown triples survive; its agents and
   * distribution are written beside it. Returns the decks as written.
   */
  async function saveDecks(decks: readonly Deck[]): Promise<Deck[]> {
    const written = decks.map((deck): Deck => ({ ...deck, formatVersion: DECK_FORMAT_VERSION }));
    for (const [catalogUrl, inDocument] of byDocument(written)) {
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      const gone = inDocument.find(
        (deck) => dataset === null || getThing(dataset, deck.url) === null,
      );
      if (gone !== undefined) throw new AppError("deckGone", { deck: gone.title });
      const updated = withDecks(dataset!, inDocument);
      await save(catalogUrl, updated, decksSubjects(updated, inDocument));
    }
    return written;
  }

  /**
   * Remove decks: their cards and reviews documents first, then their
   * entries, in one write of each catalog document. A document a deck
   * that stays uses too (another app may point two decks at one) is kept,
   * and so is every document that is not the leaving deck's to delete
   * (deckPlace.ts, guard.standing), whatever deck is handed in: of a deck
   * whose documents are unclaimed, or that cannot be used, only the entry
   * is removed. Of a document that also holds another app's data, only
   * the decks' cards and review states are removed (removeOwned), and
   * the document is kept, which the result names. A document in the
   * instance's folder that fails to be read stops the removal before the
   * entries are written, so they still name what is left and the removal
   * can be made again; a document already gone by then counts as removed.
   * An entry, a distribution or the catalog node a newer version of the
   * app wrote refuses the removal (writtenByNewerApp) before anything is
   * deleted: the catalog to write is made first.
   */
  async function removeDecks(decks: readonly Deck[]): Promise<KeptDocuments> {
    const keptDocuments: string[] = [];
    for (const [catalogUrl, inDocument] of byDocument(decks)) {
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      const leaving = new Set(inDocument.map((deck) => deck.url));
      // Compared as a server may read them (documentKeyOf): one document spelled two ways is one.
      // Keyed by pieces (TextMap): an address in that form may be longer than V8 hashes all of.
      const used = new TextMap<true>();
      for (const url of documentsInUse(
        dataset === null
          ? []
          : toDecks(dataset, catalogUrl).filter((other) => !leaving.has(other.url)),
      ))
        used.set(documentKeyOf(url), true);
      const usable = inDocument.filter(isDeckInPlace);
      const unused = [...documentsInUse(usable)].filter((url) => !used.has(documentKeyOf(url)));
      // Each document's decks found at once, and the entries told once, not per document.
      const decksAt = decksByDocument(usable);
      const entries = deckDocumentSubjects([...leaving]);
      // The catalog as it will be written, before any document goes: what it refuses (writtenByNewerApp) leaves them all.
      const catalog = dataset === null ? null : withoutDecks(dataset, inDocument);
      for (const url of unused) {
        const removal = await removeIfTheirs(url, decksAt.get(canonicalUrlOf(url)!)!, entries);
        if (removal === "kept") keptDocuments.push(url);
      }
      if (catalog === null) continue;
      await saveDataset(catalogUrl, catalog, fetch);
    }
    return { keptDocuments };
  }

  /**
   * Remove the decks' cards and review states from the document at
   * `url`, and the document when nothing else is left in it (removeOwned,
   * If-Match its read), when it is one of the decks' to remove from;
   * else keep it whole (null). One the pod serves that cannot be read as
   * RDF is kept whole too, and said to be ("kept"), and so is one outside
   * the instance's folder whose read fails (deckPlace.ts, readToRemove).
   * Any other failed read (refused, a server error, no answer, a body cut
   * off) throws: whether it is theirs is not known, so nothing may be
   * taken as settled. `owned` is what of it goes with the entries of the
   * decks removed (deckDocumentSubjects): the document's saying it is
   * theirs goes when it names no other.
   */
  async function removeIfTheirs(
    url: string,
    decks: readonly Deck[],
    owned: ReturnType<typeof deckDocumentSubjects>,
  ): Promise<Removal | null> {
    const existing = await guard.readOwnToRemove(decks, url);
    if (existing === TOO_LARGE) return deleteUnread(url);
    if (existing === UNREADABLE) return "kept";
    if (existing === null) return null;
    for (const deck of decks) {
      if ((await guard.standing(deck, url, existing)) !== "unclaimed")
        return removeOwned(url, owned, fetch, () => guard.readToRemove(decks[0]!, url));
    }
    return null;
  }

  /**
   * Delete a deck's own document that no read takes in (TOO_LARGE),
   * unread, so with no If-Match; one gone meanwhile is as good.
   */
  async function deleteUnread(url: string): Promise<Removal> {
    await deleteDataset(url, createSolidDataset(), fetch).catch((error: unknown) => {
      if (statusOf(error) !== 404) throw error;
    });
    return "deleted";
  }

  /**
   * A fresh deck's identity and document locations, before any write.
   * An import carries over the library release's provenance — its
   * authors, license, description, topics and keywords (per language,
   * an older release's untagged ones kept untagged), and which
   * release it is — and the direction it is meant to be studied in. The
   * format version is always this app's own: the copy is written in the
   * format this app writes.
   */
  function newDeck(
    instanceUrl: string,
    title: LangText,
    source?: {
      url: string;
      authors: string[];
      license?: string;
      description?: LangText;
      direction: DeckDirection;
      themes: string[];
      keywords: LangTexts;
      isCourse?: true;
    },
  ): Deck {
    const base = ensureTrailingSlash(instanceUrl);
    const id = `deck-${randomId()}`;
    return withBoundedMetadata({
      id,
      url: `${catalogUrlOf(base)}#${id}`,
      title,
      cardsDocumentUrl: `${cardsContainerOf(base)}${id}.ttl`,
      reviewsDocumentUrl: `${reviewsContainerOf(base)}${id}.ttl`,
      createdAt: now().toISOString(),
      formatVersion: DECK_FORMAT_VERSION,
      direction: source?.direction ?? DEFAULT_DECK_DIRECTION,
      authors: source?.authors ?? [],
      ...(source?.license === undefined ? {} : { license: source.license }),
      ...(source?.description === undefined ? {} : { description: source.description }),
      ...(source === undefined ? {} : { sourceUrl: source.url }),
      ...(source === undefined || source.themes.length === 0 ? {} : { themes: source.themes }),
      ...(source === undefined || noKeywords(source.keywords)
        ? {}
        : { keywords: copyKeywords(source.keywords) }),
      ...(source?.isCourse === true ? { course: true as const } : {}),
    });
  }

  /**
   * The cards document with cards written by fragment id, new or
   * existing (an existing card keeps its creation time and triples this
   * app does not know), and others removed, each with its distractors.
   * Returns the subjects written, for the write check.
   */
  function withCardChanges(
    dataset: Dataset,
    deck: Deck,
    {
      save: saved,
      remove,
    }: {
      save: (CardContent & { id: string; createdAt?: string; retired?: true })[];
      remove: string[];
    },
    carried: (id: string) => Subject | null = () => null,
  ): { dataset: Dataset; subjects: string[] } {
    const urlOf = (id: string) => `${deck.cardsDocumentUrl}#${id}`;
    const edit = editOf(dataset);
    // A card or a distractor the document does not hold starts from the subject it is a copy of,
    // without the release that one came from and the distractors it names, which are its deck's.
    for (const card of saved) {
      for (const { id } of [card, ...(card.distractors ?? [])]) {
        const from = edit.getThing(urlOf(id)) === null ? carried(id) : null;
        if (from !== null)
          edit.setThing(carriedTo(from, urlOf(id), [SM.fromRelease, SM.distractor]));
      }
    }
    // Distractors no card names any longer go once all are written: one moved to another card stays.
    const written = writeCards(edit, deck, saved, (_, card) => {
      const existing = edit.getThing(urlOf(card.id));
      const createdAt =
        existing === null ? undefined : readDatetime(existing, DCTERMS.created)?.toISOString();
      return { card: { ...card, ...(createdAt === undefined ? {} : { createdAt }) }, existing };
    });
    const updated = edit.done();
    const removed = remove.map(urlOf);
    const dropped = [
      ...written.dropped,
      ...removed.flatMap((url) => distractorsNamedBy(updated, url)),
    ];
    return {
      dataset: withoutUnnamedDistractors(withoutCardSubjects(updated, removed), dropped),
      subjects: written.subjects,
    };
  }

  /**
   * The cards document with the card written and its distractors
   * beside it (withCardWritten), those it named before and no longer
   * does removed, unless another card names them.
   */
  function withCard(
    dataset: Dataset,
    deck: Deck,
    card: CardToWrite,
    existing: NamedSubject | null,
  ): { dataset: Dataset; subjects: string[] } {
    return withCards(dataset, deck, [card], () => ({ card, existing }));
  }

  /**
   * The cards document with a card written for each of `items` that
   * `toWrite` gives one for (reading the document as written so far),
   * all at once (writeCards); then the distractors the cards named
   * before and no longer do are removed, unless another card names them.
   */
  function withCards<T>(
    dataset: Dataset,
    deck: Deck,
    items: Iterable<T>,
    toWrite: (edit: DatasetEdit<Dataset>, item: T) => CardWrite | null,
  ): { dataset: Dataset; subjects: string[] } {
    const edit = editOf(dataset);
    const written = writeCards(edit, deck, items, toWrite);
    return {
      dataset: withoutUnnamedDistractors(edit.done(), written.dropped),
      subjects: written.subjects,
    };
  }

  /**
   * Writes a card for each of `items` that `toWrite` gives one for
   * (withCardWritten), each read and written through one edit of the
   * document, which is made once (editOf): many cards take time that
   * grows with them and the document, not their product. A distractor
   * two of the cards name is written by the first only (`writers`, each
   * distractor URL by the card that wrote it): cards that state their
   * languages read it from one document, so each has the same, and any
   * other write that gives it to two cards is refused when saved
   * (assertDistractorsOwnedOnce), so a distractor named by many cards is
   * never written once for each. Returns the subjects written and the
   * distractors the cards dropped.
   */
  function writeCards<T>(
    edit: DatasetEdit<Dataset>,
    deck: Deck,
    items: Iterable<T>,
    toWrite: (edit: DatasetEdit<Dataset>, item: T) => CardWrite | null,
  ): { subjects: string[]; dropped: string[] } {
    const subjects: string[] = [];
    const dropped: string[] = [];
    const writers = new Map<string, string>();
    for (const item of items) {
      const write = toWrite(edit, item);
      if (write === null) continue;
      const written = withCardWritten(edit, deck, write.card, write.existing, writers);
      for (const subject of written.subjects) subjects.push(subject);
      for (const url of written.dropped) dropped.push(url);
    }
    return { subjects, dropped };
  }

  /**
   * Writes the card (cardThing) and its distractors beside it; a card
   * is never written onto a distractor, nor a distractor onto a card
   * (unlessTyped), and a distractor another card of the write wrote
   * (`writers`) is not written again. Returns the subjects written, the
   * card's, then its distractors', and the distractors it named before
   * and no longer does (`dropped`), still in the document: only those it
   * could read (toDistractor), so a link to any other subject leaves the
   * card and never takes its target with it.
   */
  function withCardWritten(
    edit: DatasetEdit<Dataset>,
    deck: Deck,
    card: CardToWrite,
    existing: NamedSubject | null,
    writers: Map<string, string>,
  ): { subjects: string[]; dropped: string[] } {
    const cardUrl = `${deck.cardsDocumentUrl}#${card.id}`;
    unlessTyped(edit, cardUrl, SM.Distractor);
    const named = existing === null ? [] : getUrlAll(existing, SM.distractor);
    const before = named.filter((url) => {
      const thing = edit.getThing(url);
      return thing !== null && toDistractor(thing) !== null;
    });
    const distractors = card.distractors ?? [];
    const thing = withSuggestedAnswers(
      cardThing(deck, card, existing),
      before,
      distractors.map((distractor) => `${deck.cardsDocumentUrl}#${distractor.id}`),
    );
    edit.setThing(thing);
    const written = writeDistractors(edit, deck.cardsDocumentUrl, distractors, before, (url) => {
      const writer = writers.get(url);
      if (writer !== undefined && writer !== cardUrl) return true;
      writers.set(url, cardUrl);
      return false;
    });
    return { subjects: [cardUrl, ...written.subjects], dropped: written.dropped };
  }

  /**
   * Add a deck's catalog entry, with the chapters of a course it
   * completed and its card language; refused (alreadyExists) when the catalog has one of its URL,
   * and (catalogFull) when it has MAX_CATALOG_LINKS decks already.
   */
  async function registerDeck(deck: Deck): Promise<Deck> {
    const entry = await catalogWithEntry(deck);
    await save(entry.catalogUrl, entry.dataset, entry.subjects);
    return deck;
  }

  /**
   * The catalog as it is now with the deck's entry added, and the subjects
   * that adds, for the write check; refused (alreadyExists) when it has one of its URL,
   * and (catalogFull) when it has MAX_CATALOG_LINKS decks already.
   */
  async function catalogWithEntry(deck: Deck) {
    const catalogUrl = documentUrlOf(deck.url);
    const read = (await getSolidDatasetOrNull(catalogUrl, fetch)) ?? createSolidDataset();
    if (getThing(read, deck.url) !== null) throw new AppError("alreadyExists", { url: deck.url });
    refuseFullDeckList(toDecks(read, catalogUrl));
    const dataset = withOwnTerms(withDeck(read, deck), deck);
    return { catalogUrl, dataset, subjects: deckSubjects(dataset, deck) };
  }

  /** An import cut off after its entry was checked, whose only document is its cards. */
  function finishImport(deck: Deck, failure: unknown): Promise<Deck> {
    return finishCutOffImport({ readDeck, deleteDocument }, deck, [deck.cardsDocumentUrl], failure);
  }

  async function readDeck(deckUrl: string): Promise<Deck | null> {
    const catalogUrl = documentUrlOf(deckUrl);
    const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
    return dataset === null
      ? null
      : (toDecks(dataset, catalogUrl).find((deck) => deck.url === deckUrl) ?? null);
  }

  async function deleteDocument(deck: Deck, url: string): Promise<void> {
    await removeIfTheirs(url, [deck], deckDocumentSubjects([deck.url]));
    // removeIfTheirs leaves a document it cannot read: only a read says it is gone.
    if ((await getSolidDatasetOrNull(url, fetch)) !== null)
      throw new Error(`The document ${url} is still there.`);
  }

  /**
   * The catalog as it is now with the deck's entry upgraded, and the
   * subjects that touches, for the write check; refused
   * (deckChangedDuringUpgrade) unless the entry still says what `current` does.
   */
  async function upgradedEntry(current: Deck, next: Deck) {
    const catalogUrl = documentUrlOf(current.url);
    const read = await getSolidDatasetOrNull(catalogUrl, fetch);
    const stored =
      read === null
        ? undefined
        : toDecks(read, catalogUrl).find((deck) => deck.url === current.url);
    if (read === null || stored === undefined || !sameDeckState(stored, current)) {
      throw new AppError("deckChangedDuringUpgrade", { url: current.url });
    }
    // No more metadata than a deck keeps, whatever the newer release brings (withBoundedMetadata).
    const written: Deck = withBoundedMetadata({
      ...withDeckChanges(stored, current, next),
      formatVersion: DECK_FORMAT_VERSION,
    });
    const dataset = withDeck(read, written);
    return { catalogUrl, dataset, subjects: deckSubjects(dataset, written), written };
  }

  /**
   * A new entry with what the deck says of the terms no shape owns, which
   * withDeck keeps as stored: a course's type (schema:Course, as its
   * release is typed), the chapters it completed (sm:completedChapter,
   * as completeChapter adds one, bounded as a read bounds them), the card language
   * (sm:deckCardLanguage, as setCardLanguage sets it) and the hosts whose
   * pictures it shows (sm:deckPictureHost, as setPictureHost adds them,
   * bounded as a read bounds them), and its pause (sm:deckPausedAt and
   * sm:deckResumesOn, as setPause sets them).
   */
  function withOwnTerms(dataset: Dataset, deck: Deck): Dataset {
    const entry = getThing(dataset, deck.url)!;
    let builder = buildThing(entry);
    if (deck.course === true) builder = builder.addIri(RDF.type, SCHEMA.Course);
    if (deck.completedChapters !== undefined) {
      // Never more than a read keeps (toDeck), as it keeps them: the release's first.
      const completed = boundedCompletedChapters(
        [...getUrlAll(entry, SM.completedChapter), ...deck.completedChapters],
        [deck.sourceUrl],
      );
      builder = builder.setIriAll(SM.completedChapter, completed);
    }
    if (deck.cardLanguage !== undefined)
      builder = builder.addStringNoLocale(SM.deckCardLanguage, deck.cardLanguage);
    // The whole list in one call (setStringAll), never more than a read keeps.
    if (deck.pictureHosts !== undefined)
      builder = builder.setStringAll(SM.deckPictureHost, hostStrings(deck.pictureHosts));
    builder = withPauseTerms(builder, deck.pause);
    return setThing(dataset, builder.build());
  }

  /**
   * The RDF subject of a card in the deck's cards document, written in
   * this app's format onto the existing subject when there is one: the
   * card's own predicates are replaced (empty text and a missing picture
   * remove theirs), anything else on the subject survives, the release
   * it was taken from (`sm:fromRelease`) too, unless the card names
   * another; one the subject states already stays as it is. A new card
   * is stamped with the time of writing.
   */
  function cardThing(deck: Deck, card: CardToWrite, existing: NamedSubject | null): NamedSubject {
    const thing = recordThing(
      `${deck.cardsDocumentUrl}#${card.id}`,
      CARD_V7,
      cardToRecord(card, card.createdAt ?? now().toISOString(), deck.cardsDocumentUrl),
      existing,
    );
    const stored = getUrlAll(thing, SM.fromRelease);
    return card.fromRelease === undefined || (stored.length === 1 && stored[0] === card.fromRelease)
      ? thing
      : buildThing(thing).setIri(SM.fromRelease, card.fromRelease).build();
  }
}

/**
 * A deck's picture hosts as setStringAll writes them, plain strings, no
 * more than a read keeps (storedPictureHosts).
 */
function hostStrings(hosts: readonly string[] = []): { value: string; language: string }[] {
  return storedPictureHosts(hosts).map((value) => ({ value, language: "" }));
}

/**
 * The cards document without the card (withoutCardSubject) and the
 * distractors it names, but those another card names.
 */
function withoutCard(dataset: Dataset, cardUrl: string): Dataset {
  const distractors = distractorsNamedBy(dataset, cardUrl);
  return withoutUnnamedDistractors(withoutCardSubjects(dataset, [cardUrl]), distractors);
}

/** The distractors the card at `cardUrl` names, none when there is no card. */
function distractorsNamedBy(dataset: Dataset, cardUrl: string): string[] {
  const card = getThing(dataset, cardUrl);
  return card === null ? [] : getUrlAll(card, SM.distractor);
}

/**
 * The decks of each of their cards and reviews documents, by the
 * document's address as a request sends it (canonicalUrlOf), each deck
 * once per document. The decks are in place (isDeckInPlace), so each
 * address is a URL.
 */
function decksByDocument(decks: readonly Deck[]): Map<string, Deck[]> {
  const result = new Map<string, Deck[]>();
  for (const deck of decks) {
    const urls = [deck.cardsDocumentUrl, deck.reviewsDocumentUrl].map(
      (url) => canonicalUrlOf(url)!,
    );
    for (const url of new Set(urls)) {
      const held = result.get(url);
      if (held === undefined) result.set(url, [deck]);
      else held.push(deck);
    }
  }
  return result;
}

/** Decks by the catalog document their entries are in, in the order first met. */
function byDocument<T extends Deck>(decks: readonly T[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const deck of decks) {
    const url = documentUrlOf(deck.url);
    const held = result.get(url);
    if (held === undefined) result.set(url, [deck]);
    else held.push(deck);
  }
  return result;
}

/** The cards read of each cards document, by its dataset and URL: see cardsOf. */
const readCards = new WeakMap<Dataset, Map<string, Card[]>>();

/**
 * The cards of a cards document as read (toCards), mapped once per read
 * and frozen: the decks that name one document share one array, which
 * what is derived of a deck's cards then works on once (derivedOnce,
 * domain/frozen.ts), not once per deck. A dataset never changes (each
 * write makes a new one), so its cards stay true; a new read is a new
 * dataset, mapped afresh.
 */
function cardsOf(dataset: Dataset, documentUrl: string): Card[] {
  let byUrl = readCards.get(dataset);
  if (byUrl === undefined) readCards.set(dataset, (byUrl = new Map()));
  let cards = byUrl.get(documentUrl);
  if (cards === undefined) {
    cards = Object.freeze(toCards(dataset, documentUrl)) as Card[];
    byUrl.set(documentUrl, cards);
  }
  return cards;
}

/** Whether two pauses are the same: the same start, and the same resume day or none. */
function samePause(a: DeckPause | undefined, b: DeckPause | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return Date.parse(a.pausedAt) === Date.parse(b.pausedAt) && a.resumesOn === b.resumesOn;
}

/**
 * The entry with the pause's terms in place of its resume day: the
 * start as an xsd:dateTime, the resume day as a plain string, as a
 * review state's due day is. The caller removes the start, if any.
 */
function withPauseTerms(entry: SubjectBuilder, pause: DeckPause | undefined): SubjectBuilder {
  const cleared = entry.removeAll(SM.deckResumesOn);
  if (pause === undefined) return cleared;
  const started = cleared.addLiteral(SM.deckPausedAt, datetimeLiteral(pause.pausedAt));
  return pause.resumesOn === undefined
    ? started
    : started.addStringNoLocale(SM.deckResumesOn, pause.resumesOn);
}
