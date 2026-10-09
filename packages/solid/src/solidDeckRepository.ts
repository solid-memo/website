import {
  buildThing,
  createSolidDataset,
  createThing,
  getDatetime,
  getThing,
  getUrlAll,
  setThing,
  type SolidDataset,
  type ThingPersisted,
} from "@inrupt/solid-client";
import type { LangText } from "@solid-memo/domain/langText";
import { copyKeywords, noKeywords, type LangTexts } from "@solid-memo/domain/keywords";
import type { DeckRepository } from "@solid-memo/application/ports";
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
import { withStatedLanguages } from "@solid-memo/domain/deckLanguages";
import {
  cardsContainerOf,
  catalogUrlOf,
  documentsInUse,
  ensureTrailingSlash,
  reviewsContainerOf,
} from "@solid-memo/domain/instanceLayout";
import { documentUrlOf, fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { CARD_V5 } from "@solid-memo/vocab/descriptors.generated";
import { applyDeckTreeEdit, buildTree, treeChanges } from "@solid-memo/domain/deckTree";
import { deleteDataset, getSolidDatasetOrNull, PreconditionFailedError, saveDataset } from "./datasets";
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
  /** Save a document once the subjects the write touched are checked. */
  async function save(
    url: string,
    dataset: SolidDataset,
    subjects: readonly string[],
    options?: { whole?: boolean },
  ): Promise<void> {
    await checkWrite(dataset, subjects);
    await saveDataset(url, dataset, fetch, options);
  }

  /** Save a deck's cards document, saying whose it is (partOfDeck), once the subjects the write touched are checked. */
  function saveCardsDocument(
    deck: Deck,
    dataset: SolidDataset,
    subjects: readonly string[],
    options?: { whole?: boolean },
  ): Promise<void> {
    return save(deck.cardsDocumentUrl, partOfDeck(dataset, deck), subjects, options);
  }

  return {
    async listDecks(instanceUrl): Promise<Deck[]> {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      if (dataset === null) return [];
      return toDecks(dataset);
    },

    async readCatalog(instanceUrl) {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      return dataset === null ? null : toCatalog(dataset, catalogUrl);
    },

    async saveCatalog(instanceUrl, catalog) {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const dataset =
        (await getSolidDatasetOrNull(catalogUrl, fetch)) ?? createSolidDataset();
      await save(catalogUrl, withCatalog(dataset, catalogUrl, catalog), [
        `${catalogUrl}#catalog`,
        catalog.publisher.webId,
      ]);
    },

    async saveDecks(instanceUrl, decks, catalog) {
      const catalogUrl = catalogUrlOf(instanceUrl);
      const read = await getSolidDatasetOrNull(catalogUrl, fetch);
      let dataset = read ?? createSolidDataset();
      const subjects: string[] = [];
      for (const deck of decks) {
        if (getThing(dataset, deck.url) === null) continue;
        const written: Deck = { ...deck, formatVersion: DECK_FORMAT_VERSION };
        dataset = withDeck(dataset, written);
        subjects.push(...deckSubjects(written));
      }
      if (catalog !== null) {
        dataset = withCatalog(dataset, catalogUrl, catalog);
        subjects.push(`${catalogUrl}#catalog`, catalog.publisher.webId);
      }
      if (subjects.length === 0) return false;
      await save(catalogUrl, dataset, subjects);
      return true;
    },

    createDeck(instanceUrl, title): Promise<Deck> {
      return registerDeck(newDeck(instanceUrl, title));
    },

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
        if (getThing(dataset, deck.url) !== null) throw new PreconditionFailedError(deck.url, "absent");
        // sm:completedChapter is no shape's: added beside the entry, as completeChapter adds it.
        let updated = withDeck(dataset, written);
        const entry = buildThing(getThing(updated, deck.url)!);
        for (const chapter of deck.completedChapters ?? []) entry.addIri(SM.completedChapter, chapter);
        updated = setThing(updated, entry.build());
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

    async removeDeck(deck): Promise<void> {
      const catalogUrl = documentUrlOf(deck.url);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      // A document another deck uses too (another app may point two decks at one) is kept.
      const used = documentsInUse(dataset === null ? [] : toDecks(dataset).filter((other) => other.url !== deck.url));
      for (const url of [deck.cardsDocumentUrl, deck.reviewsDocumentUrl]) {
        if (!used.has(url)) await deleteDocumentIfPresent(url, fetch);
      }
      if (dataset === null) return;
      await saveDataset(catalogUrl, withoutDeck(dataset, deck), fetch);
    },

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
        const { dataset: updated, subjects } = withTreeChanges(dataset, catalogUrl, treeChanges(stored, after));
        // Only the groups and the catalogue are checked: a deck's position is
        // no shape's, and a deck set aside beside the moved one must not stop it.
        await checkWrite(updated, subjects);
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
      const dataset = await getSolidDatasetOrNull(
        deck.cardsDocumentUrl,
        fetch,
      );
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
        (await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch)) ??
        createSolidDataset();
      const written = withCard(dataset, deck, card, null);
      await saveCardsDocument(deck, written.dataset, written.subjects);
      return card;
    },

    async updateCard(deck, card, content): Promise<Card> {
      const dataset = await getSolidDatasetOrNull(
        deck.cardsDocumentUrl,
        fetch,
      );
      if (dataset === null) {
        throw new AppError("cardsDocumentGone", { deck: deck.title });
      }
      const thing = getThing(dataset, card.url);
      if (thing === null) {
        throw new AppError("cardGone", { card: card.url });
      }
      // An edit that does not state distractors (the card editor has none) keeps the card's,
      // and one that does not state a text format keeps the card's too.
      const distractors = content.distractors ?? card.distractors;
      const textFormat = content.textFormat ?? card.textFormat;
      const updated: Card = {
        id: card.id,
        url: card.url,
        createdAt: card.createdAt,
        ...content,
        ...(distractors === undefined ? {} : { distractors }),
        ...(textFormat === undefined ? {} : { textFormat }),
        formatVersion: CARD_FORMAT_VERSION,
        ...(card.retired === true ? { retired: true } : {}),
      };
      const written = withCard(dataset, deck, updated, thing);
      await saveCardsDocument(deck, written.dataset, written.subjects);
      return updated;
    },

    async saveCards(deck, cards): Promise<void> {
      const dataset = await getSolidDatasetOrNull(
        deck.cardsDocumentUrl,
        fetch,
      );
      if (dataset === null) return;
      let updated: SolidDataset = dataset;
      const subjects: string[] = [];
      for (const card of cards) {
        const thing = getThing(updated, card.url);
        if (thing === null) continue;
        const written = withCard(updated, deck, card, thing);
        updated = written.dataset;
        subjects.push(...written.subjects);
      }
      await saveCardsDocument(deck, updated, subjects);
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

    async applyCardChanges(deck, changes, options): Promise<void> {
      const dataset =
        (await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch)) ?? createSolidDataset();
      const changed = withCardChanges(dataset, deck, changes);
      await saveCardsDocument(deck, changed.dataset, changed.subjects, options);
    },

    async readDeck(deckUrl) {
      const dataset = await getSolidDatasetOrNull(documentUrlOf(deckUrl), fetch);
      return dataset === null ? null : (toDecks(dataset).find((deck) => deck.url === deckUrl) ?? null);
    },

    async upgradeDeckEntry(current, next): Promise<Deck> {
      const catalogUrl = documentUrlOf(current.url);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      const stored = dataset === null ? undefined : toDecks(dataset).find((deck) => deck.url === current.url);
      if (dataset === null || stored === undefined || !sameDeckState(stored, current)) {
        throw new AppError("deckChangedDuringUpgrade", { url: current.url });
      }
      const written: Deck = { ...withDeckChanges(stored, current, next), formatVersion: DECK_FORMAT_VERSION };
      // The write carries If-Match of the read above: the entry changes as it was checked, or not at all.
      await save(catalogUrl, withDeck(dataset, written), deckSubjects(written));
      return written;
    },

    deleteDocument(url) {
      return deleteDocumentIfPresent(url, fetch);
    },

    async completeChapter(deck, chapterUrl) {
      const catalogUrl = documentUrlOf(deck.url);
      for (let attempt = 1; ; attempt++) {
        const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
        const stored = dataset === null ? undefined : toDecks(dataset).find((candidate) => candidate.url === deck.url);
        if (stored === undefined) throw new AppError("deckGone", { deck: deck.title });
        // Completed in any release: a chapter keeps its fragment id from one release to the next.
        if (stored.completedChapters?.some((url) => fragmentIdOf(url) === fragmentIdOf(chapterUrl)) === true) return stored;
        // sm:completedChapter is no shape's (like a deck's sm:position): nothing a shape owns changes, so nothing is checked.
        const thing = buildThing(unlessNewer(getThing(dataset!, deck.url)!)).addIri(SM.completedChapter, chapterUrl).build();
        const updated = setThing(dataset!, thing);
        try {
          // A PATCH adding the one triple, If-Match the read above.
          await saveDataset(catalogUrl, updated, fetch);
          return { ...stored, completedChapters: [...(stored.completedChapters ?? []), chapterUrl] };
        } catch (error) {
          if (!(error instanceof PreconditionFailedError) || attempt === TREE_ATTEMPTS) throw error;
        }
      }
    },

    async removeCard(deck, card): Promise<void> {
      const dataset = await getSolidDatasetOrNull(
        deck.cardsDocumentUrl,
        fetch,
      );
      if (dataset !== null) {
        await saveDataset(deck.cardsDocumentUrl, partOfDeck(withoutCard(dataset, card.url), deck), fetch);
      }
      const reviews = await getSolidDatasetOrNull(
        deck.reviewsDocumentUrl,
        fetch,
      );
      if (reviews !== null) {
        // Its states both ways, whether they name it (sm:reviewOf) or are named after it.
        const updated = withoutReviewStates(reviews, deck, [
          { cardId: card.id, direction: "front-to-back" },
          { cardId: card.id, direction: "back-to-front" },
        ]);
        await saveDataset(deck.reviewsDocumentUrl, updated, fetch);
      }
    },
  };

  /**
   * Rewrite a deck's catalog entry in place, in this app's format: the
   * entry's own predicates are replaced from the deck, so unknown
   * triples survive; its agents and distribution are written beside it.
   * Returns the deck as written.
   */
  async function saveDeck(deck: Deck): Promise<Deck> {
    const catalogUrl = documentUrlOf(deck.url);
    const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
    const thing = dataset === null ? null : getThing(dataset, deck.url);
    if (dataset === null || thing === null) {
      throw new AppError("deckGone", { deck: deck.title });
    }
    const written: Deck = { ...deck, formatVersion: DECK_FORMAT_VERSION };
    await save(catalogUrl, withDeck(dataset, written), deckSubjects(written));
    return written;
  }

  /**
   * A fresh deck's identity and document locations, before any write.
   * An import carries over the library release's provenance — its
   * authors, licence, description, topics and keywords (per language,
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
      ...(source?.description === undefined
        ? {}
        : { description: source.description }),
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
    { save: saved, remove }: { save: (CardContent & { id: string; retired?: true })[]; remove: string[] },
  ): { dataset: SolidDataset; subjects: string[] } {
    const urlOf = (id: string) => `${deck.cardsDocumentUrl}#${id}`;
    let updated = dataset;
    const subjects: string[] = [];
    for (const card of saved) {
      const existing = getThing(updated, urlOf(card.id));
      const createdAt = existing === null ? undefined : getDatetime(existing, DCTERMS.created)?.toISOString();
      const written = withCard(updated, deck, { ...card, ...(createdAt === undefined ? {} : { createdAt }) }, existing);
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
    const written = withDistractors(setThing(dataset, thing), deck.cardsDocumentUrl, distractors, before);
    return { dataset: written.dataset, subjects: [`${deck.cardsDocumentUrl}#${card.id}`, ...written.subjects] };
  }

  /** Add a deck's catalog entry. */
  async function registerDeck(deck: Deck): Promise<Deck> {
    const catalogUrl = documentUrlOf(deck.url);
    const dataset =
      (await getSolidDatasetOrNull(catalogUrl, fetch)) ??
      createSolidDataset();
    await save(catalogUrl, withDeck(dataset, deck), deckSubjects(deck));
    return deck;
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
      CARD_V5,
      cardToRecord(card, card.createdAt ?? now().toISOString(), deck.cardsDocumentUrl),
      existing,
    );
  }
}

/**
 * The cards document saying whose it is: the document itself (`<>`)
 * dcterms:isPartOf the deck's catalog entry, added once, so another app
 * finds the deck from its cards. Any other dcterms:isPartOf stays (another
 * app may point two decks at one document).
 */
function partOfDeck(dataset: SolidDataset, deck: Pick<Deck, "url" | "cardsDocumentUrl">): SolidDataset {
  const document = getThing(dataset, deck.cardsDocumentUrl) ?? createThing({ url: deck.cardsDocumentUrl });
  if (getUrlAll(document, DCTERMS.isPartOf).includes(deck.url)) return dataset;
  return setThing(dataset, buildThing(document).addUrl(DCTERMS.isPartOf, deck.url).build());
}

/** The cards document without the card and the distractors it names. */
function withoutCard(dataset: SolidDataset, cardUrl: string): SolidDataset {
  const card = getThing(dataset, cardUrl);
  const distractors = card === null ? [] : getUrlAll(card, SM.distractor);
  return [cardUrl, ...distractors].reduce((current, url) => removeUnlessNewer(current, url), dataset);
}

async function deleteDocumentIfPresent(
  url: string,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  const existing = await getSolidDatasetOrNull(url, fetch);
  if (existing !== null) {
    await deleteDataset(url, existing, fetch);
  }
}
