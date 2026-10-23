// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  buildThing,
  createSolidDataset,
  getDatetime,
  getThing,
  getUrlAll,
  setThing,
  type SolidDataset,
  type ThingBuilder,
  type ThingPersisted,
} from "@inrupt/solid-client";
import type { LangText } from "@solid-memo/domain/langText";
import { copyKeywords, noKeywords, type LangTexts } from "@solid-memo/domain/keywords";
import type { DeckRepository } from "@solid-memo/application/ports";
import type { KeptDocuments } from "@solid-memo/domain/instance";
import {
  CARD_FORMAT_VERSION,
  DECK_FORMAT_VERSION,
  DEFAULT_DECK_DIRECTION,
  type Card,
  type CardContent,
  type Deck,
  type DeckDirection,
} from "@solid-memo/domain/deck";
import { cardToRecord } from "@solid-memo/domain/deckRecord";
import { editCompletedChapters as completedChaptersAfter } from "@solid-memo/domain/course";
import { withStatedLanguages } from "@solid-memo/domain/deckLanguages";
import { withCardLanguage } from "@solid-memo/domain/deckCardLanguage";
import {
  cardsContainerOf,
  catalogUrlOf,
  documentsInUse,
  ensureTrailingSlash,
  canonicalUrlOf,
  isDeckInPlace,
  isSameUrl,
  reviewsContainerOf,
} from "@solid-memo/domain/instanceLayout";
import { documentUrlOf, fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { isDeckOutdated, isOutdated, upgradeCard, upgradeDeck } from "@solid-memo/domain/migration";
import { ABSENT_VERSION } from "@solid-memo/domain/studyDigest";
import { CARD_V7 } from "@solid-memo/vocab/descriptors.generated";
import { applyDeckTreeEdit, buildTree, treeChanges } from "@solid-memo/domain/deckTree";
import {
  getSolidDatasetOrNull,
  PreconditionFailedError,
  removeOwned,
  saveDataset,
  versionOf,
  type Removal,
} from "./datasets";
import { deckDocumentSubjects } from "./ownership";
import { DCTERMS, SM } from "./vocab";
import {
  deckSubjects,
  toCard,
  toCards,
  toCatalog,
  toDecks,
  withCatalog,
  withDeck,
  withDistractors,
  withoutDeck,
  withSuggestedAnswers,
} from "./mappers/deckMapper";
import { toStoredLayout, withTreeChanges } from "./mappers/deckTreeMapper";
import { createDeckDocumentGuard } from "./deckPlace";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { withoutReviewStates } from "./mappers/reviewStateMapper";
import { recordThing, removeUnlessNewer, unlessNewer } from "./records";
import { mapSince, readSince } from "./readSince";
import { AppError } from "@solid-memo/domain/appError";
import { sameDeckState, withDeckChanges } from "@solid-memo/domain/deckUpgrade";

export interface SolidDeckRepositoryDeps {
  fetch: typeof globalThis.fetch;
  now: () => Date;
  randomId: () => string;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
}

/**
 * How often an edit of the deck arrangement, a chapter's completion, or
 * the entry of a guest's deck added (addDeck) is made, in all, while the
 * catalog document keeps changing elsewhere (412). The edit is applied
 * again to the document as it is then, so a retry keeps what changed.
 */
const TREE_ATTEMPTS = 3;

export function createSolidDeckRepository({
  fetch,
  now,
  randomId,
  checkWrite = noWriteCheck,
}: SolidDeckRepositoryDeps): DeckRepository {
  const guard = createDeckDocumentGuard(fetch);

  /** Save a document once the subjects the write touched are checked. */
  async function save(
    url: string,
    dataset: SolidDataset,
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
    dataset: SolidDataset,
    subjects: readonly string[],
    options?: { whole?: boolean },
  ): Promise<void> {
    const written = await guard.writable(deck, deck.cardsDocumentUrl, dataset);
    await save(deck.cardsDocumentUrl, written, subjects, options);
  }

  return {
    async listDecks(instanceUrl): Promise<Deck[]> {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      if (dataset === null) return [];
      return toDecks(dataset, catalogUrl);
    },

    async readCatalog(instanceUrl) {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      return dataset === null ? null : toCatalog(dataset, catalogUrl);
    },

    async saveCatalog(instanceUrl, catalog) {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const dataset = (await getSolidDatasetOrNull(catalogUrl, fetch)) ?? createSolidDataset();
      await save(catalogUrl, withCatalog(dataset, catalogUrl, catalog), [
        `${catalogUrl}#catalog`,
        catalog.publisher.webId,
      ]);
    },

    async upgradeDecks(instanceUrl, catalog) {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const read = await getSolidDatasetOrNull(catalogUrl, fetch);
      let dataset = read ?? createSolidDataset();
      const subjects: string[] = [];
      // Each entry stored in an older format, as read and brought up to date in memory, written in this app's.
      for (const deck of toDecks(dataset, catalogUrl).filter(isDeckOutdated)) {
        const written = upgradeDeck(deck);
        dataset = withDeck(dataset, written);
        subjects.push(...deckSubjects(written));
      }
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
      const deck = newDeck(instanceUrl, content.title, content);
      let cards = createSolidDataset();
      const subjects: string[] = [];
      for (const card of content.cards) {
        const written = withCard(cards, deck, card, null);
        cards = written.dataset;
        subjects.push(...written.subjects);
      }
      await saveCardsDocument(deck, cards, subjects);
      return registerDeck(deck);
    },

    async addDeck(deck): Promise<Deck> {
      const catalogUrl = documentUrlOf(deck.url);
      const written: Deck = { ...deck, formatVersion: DECK_FORMAT_VERSION };
      for (let attempt = 1; ; attempt++) {
        const dataset = (await getSolidDatasetOrNull(catalogUrl, fetch)) ?? createSolidDataset();
        if (getThing(dataset, deck.url) !== null)
          throw new PreconditionFailedError(deck.url, "absent");
        const updated = withOwnTerms(withDeck(dataset, written), deck);
        try {
          // If-Match the read above: the catalog changed elsewhere meanwhile is read and the entry added again.
          await save(catalogUrl, updated, deckSubjects(written));
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
      return buildTree(toStoredLayout(dataset ?? createSolidDataset(), catalogUrl));
    },

    async editDeckTree(instanceUrl, edit) {
      const catalogUrl = catalogUrlOf(instanceUrl);
      for (let attempt = 1; ; attempt++) {
        const dataset = (await getSolidDatasetOrNull(catalogUrl, fetch)) ?? createSolidDataset();
        const stored = toStoredLayout(dataset, catalogUrl);
        const before = buildTree(stored);
        const after = applyDeckTreeEdit(before, edit);
        if (after === before) return after;
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

    async listCards(deck): Promise<Card[]> {
      const dataset = await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch);
      if (dataset === null) return [];
      return toCards(dataset);
    },

    async readCardsSince(deck, version) {
      return mapSince(await readSince(deck.cardsDocumentUrl, version, fetch), (dataset) =>
        dataset === null ? [] : toCards(dataset),
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
      let updated: SolidDataset = dataset;
      const subjects: string[] = [];
      // Each card stored in an older format, as read and brought up to date in memory, written in this app's.
      for (const card of toCards(dataset).filter(isOutdated)) {
        const written = withCard(updated, deck, upgradeCard(card), getThing(updated, card.url));
        updated = written.dataset;
        subjects.push(...written.subjects);
      }
      if (subjects.length === 0) return false;
      // If-Match the read above; an edit too large for one PATCH is one PUT of the whole document (datasets.ts).
      await saveCardsDocument(deck, updated, subjects);
      return true;
    },

    async stateCardLanguages(deck, cardIds, languages): Promise<number> {
      const dataset = await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch);
      if (dataset === null) return 0;
      let updated: SolidDataset = dataset;
      const stated: string[] = [];
      for (const id of cardIds) {
        const thing = getThing(updated, `${deck.cardsDocumentUrl}#${id}`);
        const card = thing === null ? null : toCard(thing, updated);
        const restated = card === null ? null : withStatedLanguages(card, languages);
        if (restated === null) continue;
        updated = withCard(updated, deck, restated, thing).dataset;
        stated.push(restated.url);
      }
      // One PUT of the whole document, If-Match the read above: a cards document changed
      // meanwhile is not overwritten, and no PATCH of text is cut short (saveDataset's `whole`).
      if (stated.length > 0) await saveCardsDocument(deck, updated, stated, { whole: true });
      return stated.length;
    },

    async applyCardChanges(deck, changes, { whole, version } = {}): Promise<void> {
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
      const changed = withCardChanges(read ?? createSolidDataset(), deck, changes);
      await saveCardsDocument(deck, changed.dataset, changed.subjects, { whole });
    },

    async readDeck(deckUrl) {
      const catalogUrl = documentUrlOf(deckUrl);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      return dataset === null
        ? null
        : (toDecks(dataset, catalogUrl).find((deck) => deck.url === deckUrl) ?? null);
    },

    async upgradeDeckEntry(current, next): Promise<Deck> {
      const catalogUrl = documentUrlOf(current.url);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      const stored =
        dataset === null
          ? undefined
          : toDecks(dataset, catalogUrl).find((deck) => deck.url === current.url);
      if (dataset === null || stored === undefined || !sameDeckState(stored, current)) {
        throw new AppError("deckChangedDuringUpgrade", { url: current.url });
      }
      const written: Deck = {
        ...withDeckChanges(stored, current, next),
        formatVersion: DECK_FORMAT_VERSION,
      };
      // The write carries If-Match of the read above: the entry changes as it was checked, or not at all.
      await save(catalogUrl, withDeck(dataset, written), deckSubjects(written));
      return written;
    },

    async deleteDocument(deck, url) {
      await removeIfTheirs(url, [deck], [deck.url]);
    },

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

    async removeCard(deck, card): Promise<void> {
      guard.assertUsable(deck);
      const cards = await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch);
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
                { cardId: card.id, direction: "front-to-back" },
                { cardId: card.id, direction: "back-to-front" },
              ]),
            );
      for (const [url, written] of [
        [deck.cardsDocumentUrl, cardsWritten],
        [deck.reviewsDocumentUrl, reviewsWritten],
      ] as const) {
        if (written !== null) await saveDataset(url, written, fetch);
      }
    },

    unclaimedDocuments(deck) {
      return guard.unclaimed(deck);
    },

    claimDocuments(deck) {
      return guard.claim(deck);
    },
  };

  /**
   * Change the chapters a course's deck completed (sm:completedChapter):
   * what `change` adds and removes of them as the entry has them now
   * (editEntry). No change (null) writes nothing. sm:completedChapter is
   * no shape's (like a deck's sm:position): a learner's completion checks
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
        const after = [...completed.filter((url) => !changed.remove.includes(url)), ...changed.add];
        const { completedChapters: _, ...rest } = stored;
        return {
          edit: (entry) => {
            let builder = entry;
            for (const url of changed.remove) builder = builder.removeUrl(SM.completedChapter, url);
            for (const url of changed.add) builder = builder.addIri(SM.completedChapter, url);
            return builder;
          },
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
      edit: (entry: ThingBuilder<ThingPersisted>) => ThingBuilder<ThingPersisted>;
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
      const entry = changed.edit(buildThing(unlessNewer(getThing(dataset!, deck.url)!)));
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
      await save(
        catalogUrl,
        inDocument.reduce(withDeck, dataset!),
        inDocument.flatMap(deckSubjects),
      );
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
   * the document is kept, which the result names.
   */
  async function removeDecks(decks: readonly Deck[]): Promise<KeptDocuments> {
    const keptDocuments: string[] = [];
    for (const [catalogUrl, inDocument] of byDocument(decks)) {
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      const leaving = new Set(inDocument.map((deck) => deck.url));
      // Compared as a request sends them: one document spelled two ways is one.
      const used = new Set(
        [
          ...documentsInUse(
            dataset === null
              ? []
              : toDecks(dataset, catalogUrl).filter((other) => !leaving.has(other.url)),
          ),
        ].map(canonicalUrlOf),
      );
      const usable = inDocument.filter(isDeckInPlace);
      const unused = [...documentsInUse(usable)].filter((url) => !used.has(canonicalUrlOf(url)));
      for (const url of unused) {
        const removal = await removeIfTheirs(
          url,
          usable.filter((deck) =>
            [deck.cardsDocumentUrl, deck.reviewsDocumentUrl].some((one) => isSameUrl(one, url)),
          ),
          [...leaving],
        );
        if (removal === "kept") keptDocuments.push(url);
      }
      if (dataset === null) continue;
      await saveDataset(catalogUrl, inDocument.reduce(withoutDeck, dataset), fetch);
    }
    return { keptDocuments };
  }

  /**
   * Remove the decks' cards and review states from the document at
   * `url`, and the document when nothing else is left in it (removeOwned,
   * If-Match its read), when it is one of the decks' to remove from;
   * else, and when it cannot be read as RDF, keep it whole (null).
   * `leaving` are the entries of the decks removed: the document's
   * saying it is theirs goes when it names no other.
   */
  async function removeIfTheirs(
    url: string,
    decks: readonly Deck[],
    leaving: readonly string[],
  ): Promise<Removal | null> {
    const existing = await getSolidDatasetOrNull(url, fetch).catch(() => null);
    if (existing === null) return null;
    for (const deck of decks) {
      if ((await guard.standing(deck, url, existing)) !== "unclaimed")
        return removeOwned(url, deckDocumentSubjects(leaving), fetch);
    }
    return null;
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
    },
  ): Deck {
    const base = ensureTrailingSlash(instanceUrl);
    const id = `deck-${randomId()}`;
    return {
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
    };
  }

  /**
   * The cards document with cards written by fragment id, new or
   * existing (an existing card keeps its creation time and triples this
   * app does not know), and others removed, each with its distractors.
   * Returns the subjects written, for the write check.
   */
  function withCardChanges(
    dataset: SolidDataset,
    deck: Deck,
    {
      save: saved,
      remove,
    }: {
      save: (CardContent & { id: string; createdAt?: string; retired?: true })[];
      remove: string[];
    },
  ): { dataset: SolidDataset; subjects: string[] } {
    const urlOf = (id: string) => `${deck.cardsDocumentUrl}#${id}`;
    let updated = dataset;
    const subjects: string[] = [];
    for (const card of saved) {
      const existing = getThing(updated, urlOf(card.id));
      const createdAt =
        existing === null ? undefined : getDatetime(existing, DCTERMS.created)?.toISOString();
      const written = withCard(
        updated,
        deck,
        { ...card, ...(createdAt === undefined ? {} : { createdAt }) },
        existing,
      );
      updated = written.dataset;
      subjects.push(...written.subjects);
    }
    for (const id of remove) updated = withoutCard(updated, urlOf(id));
    return { dataset: updated, subjects };
  }

  /**
   * The cards document with the card written (cardThing) and its
   * distractors beside it, those it named before and no longer does
   * removed. Returns the subjects written: the card's, then its
   * distractors'.
   */
  function withCard(
    dataset: SolidDataset,
    deck: Deck,
    card: CardContent & { id: string; createdAt?: string; retired?: true },
    existing: ThingPersisted | null,
  ): { dataset: SolidDataset; subjects: string[] } {
    const before = existing === null ? [] : getUrlAll(existing, SM.distractor);
    const distractors = card.distractors ?? [];
    const thing = withSuggestedAnswers(
      cardThing(deck, card, existing),
      before,
      distractors.map((distractor) => `${deck.cardsDocumentUrl}#${distractor.id}`),
    );
    const written = withDistractors(
      setThing(dataset, thing),
      deck.cardsDocumentUrl,
      distractors,
      before,
    );
    return {
      dataset: written.dataset,
      subjects: [`${deck.cardsDocumentUrl}#${card.id}`, ...written.subjects],
    };
  }

  /**
   * Add a deck's catalog entry, with the chapters of a course it
   * completed and its card language; refused (alreadyExists) when the catalog has one of its URL.
   */
  async function registerDeck(deck: Deck): Promise<Deck> {
    const catalogUrl = documentUrlOf(deck.url);
    const dataset = (await getSolidDatasetOrNull(catalogUrl, fetch)) ?? createSolidDataset();
    if (getThing(dataset, deck.url) !== null)
      throw new AppError("alreadyExists", { url: deck.url });
    await save(catalogUrl, withOwnTerms(withDeck(dataset, deck), deck), deckSubjects(deck));
    return deck;
  }

  /**
   * A new entry with what the deck says of the terms no shape owns, which
   * withDeck keeps as stored: the chapters a course completed
   * (sm:completedChapter, as completeChapter adds one) and the card
   * language (sm:deckCardLanguage, as setCardLanguage sets it).
   */
  function withOwnTerms(dataset: SolidDataset, deck: Deck): SolidDataset {
    let builder = buildThing(getThing(dataset, deck.url)!);
    for (const url of deck.completedChapters ?? [])
      builder = builder.addIri(SM.completedChapter, url);
    if (deck.cardLanguage !== undefined)
      builder = builder.addStringNoLocale(SM.deckCardLanguage, deck.cardLanguage);
    return setThing(dataset, builder.build());
  }

  /**
   * The RDF subject of a card in the deck's cards document, written in
   * this app's format onto the existing subject when there is one: the
   * card's own predicates are replaced (empty text and a missing picture
   * remove theirs), anything else on the subject survives. A new card is
   * stamped with the time of writing.
   */
  function cardThing(
    deck: Deck,
    card: CardContent & { id: string; createdAt?: string; retired?: true },
    existing: ThingPersisted | null,
  ): ThingPersisted {
    return recordThing(
      `${deck.cardsDocumentUrl}#${card.id}`,
      CARD_V7,
      cardToRecord(card, card.createdAt ?? now().toISOString(), deck.cardsDocumentUrl),
      existing,
    );
  }
}

/** The cards document without the card and the distractors it names. */
function withoutCard(dataset: SolidDataset, cardUrl: string): SolidDataset {
  const card = getThing(dataset, cardUrl);
  const distractors = card === null ? [] : getUrlAll(card, SM.distractor);
  return [cardUrl, ...distractors].reduce(
    (current, url) => removeUnlessNewer(current, url),
    dataset,
  );
}

/** Decks by the catalog document their entries are in, in the order first met. */
function byDocument<T extends Deck>(decks: readonly T[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const deck of decks) {
    const url = documentUrlOf(deck.url);
    result.set(url, [...(result.get(url) ?? []), deck]);
  }
  return result;
}
