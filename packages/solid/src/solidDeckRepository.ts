import {
  createSolidDataset,
  getDatetime,
  getThing,
  getThingAll,
  removeThing,
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
import { catalogUrlOf, documentsInUse, ensureTrailingSlash } from "@solid-memo/domain/instanceLayout";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { CARD_V5 } from "@solid-memo/vocab/descriptors.generated";
import { applyDeckTreeEdit, buildTree, treeChanges } from "@solid-memo/domain/deckTree";
import { deleteDataset, getSolidDatasetOrNull, PreconditionFailedError, saveDataset } from "./datasets";
import { DCTERMS } from "./vocab";
import {
  deckSubjects,
  toCard,
  toCatalog,
  toDecks,
  withCatalog,
  withDeck,
  withoutDeck,
} from "./mappers/deckMapper";
import { toStoredLayout, withTreeChanges } from "./mappers/deckTreeMapper";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { reviewSubjectUrl } from "./mappers/reviewStateMapper";
import { recordThing } from "./records";
import { mapSince, readSince } from "./readSince";
import { AppError } from "@solid-memo/domain/appError";
import { sameDeckState, withDeckChanges } from "@solid-memo/domain/deckUpgrade";
import { loadEngine as defaultLoadEngine, movedDataset, type LoadEngine } from "./movedDataset";

export interface SolidDeckRepositoryDeps {
  fetch: typeof globalThis.fetch;
  now: () => Date;
  randomId: () => string;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
  /** The IRI mapper an upgrade's new cards document is moved with; injected for tests. */
  loadEngine?: LoadEngine;
}

/**
 * How often an edit of the deck arrangement is made, in all, while the
 * catalog document keeps changing elsewhere (412). The edit is applied
 * again to the document as it is then, so a retry keeps what changed.
 */
const TREE_ATTEMPTS = 3;

export function createSolidDeckRepository({
  fetch,
  now,
  randomId,
  checkWrite = noWriteCheck,
  loadEngine = defaultLoadEngine,
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

    createDeck(instanceUrl, title): Promise<Deck> {
      return registerDeck(newDeck(instanceUrl, title));
    },

    async importDeck(instanceUrl, content): Promise<Deck> {
      const deck = newDeck(instanceUrl, content.title, content);
      let cards = createSolidDataset();
      for (const card of content.cards) {
        cards = setThing(cards, cardThing(deck, card, null));
      }
      await save(
        deck.cardsDocumentUrl,
        cards,
        content.cards.map((card) => `${deck.cardsDocumentUrl}#${card.id}`),
      );
      return registerDeck(deck);
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
      return getThingAll(dataset)
        .map(toCard)
        .filter((card): card is Card => card !== null);
    },

    async readCardsSince(deck, version) {
      return mapSince(await readSince(deck.cardsDocumentUrl, version, fetch), (dataset) =>
        dataset === null ? [] : getThingAll(dataset).map(toCard).filter((card): card is Card => card !== null),
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
      const updated = setThing(dataset, cardThing(deck, card, null));
      await save(deck.cardsDocumentUrl, updated, [card.url]);
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
      const updated: Card = {
        id: card.id,
        url: card.url,
        createdAt: card.createdAt,
        ...content,
        formatVersion: CARD_FORMAT_VERSION,
        ...(card.retired === true ? { retired: true } : {}),
      };
      await save(
        deck.cardsDocumentUrl,
        setThing(dataset, cardThing(deck, updated, thing)),
        [updated.url],
      );
      return updated;
    },

    async saveCards(deck, cards): Promise<void> {
      const dataset = await getSolidDatasetOrNull(
        deck.cardsDocumentUrl,
        fetch,
      );
      if (dataset === null) return;
      const updated = cards.reduce((current, card) => {
        const thing = getThing(current, card.url);
        return thing === null
          ? current
          : setThing(current, cardThing(deck, card, thing));
      }, dataset);
      await save(deck.cardsDocumentUrl, updated, cards.map((card) => card.url));
    },

    async stateCardLanguages(deck, cardIds, languages): Promise<number> {
      const dataset = await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch);
      if (dataset === null) return 0;
      let updated = dataset;
      const stated: string[] = [];
      for (const id of cardIds) {
        const thing = getThing(updated, `${deck.cardsDocumentUrl}#${id}`);
        const card = thing === null ? null : toCard(thing);
        const restated = card === null ? null : withStatedLanguages(card, languages);
        if (restated === null) continue;
        updated = setThing(updated, cardThing(deck, restated, thing));
        stated.push(restated.url);
      }
      // One PUT of the whole document, If-Match the read above: a cards document changed
      // meanwhile is not overwritten, and no PATCH of text is cut short (saveDataset's `whole`).
      if (stated.length > 0) await save(deck.cardsDocumentUrl, updated, stated, { whole: true });
      return stated.length;
    },

    async applyCardChanges(deck, changes): Promise<void> {
      const dataset =
        (await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch)) ?? createSolidDataset();
      await save(
        deck.cardsDocumentUrl,
        withCardChanges(dataset, deck, changes),
        changes.save.map((card) => `${deck.cardsDocumentUrl}#${card.id}`),
      );
    },

    async readDeck(deckUrl) {
      const dataset = await getSolidDatasetOrNull(documentUrlOf(deckUrl), fetch);
      return dataset === null ? null : (toDecks(dataset).find((deck) => deck.url === deckUrl) ?? null);
    },

    async stageCardChanges(deck, stagedUrl, changes): Promise<void> {
      const original =
        (await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch)) ?? createSolidDataset();
      const staged = { ...deck, cardsDocumentUrl: stagedUrl };
      await save(
        stagedUrl,
        withCardChanges(await movedDataset(original, deck.cardsDocumentUrl, stagedUrl, loadEngine), staged, changes),
        changes.save.map((card) => `${stagedUrl}#${card.id}`),
      );
    },

    async switchDeck(current, next): Promise<Deck> {
      const catalogUrl = documentUrlOf(current.url);
      const dataset = await getSolidDatasetOrNull(catalogUrl, fetch);
      const stored = dataset === null ? undefined : toDecks(dataset).find((deck) => deck.url === current.url);
      if (dataset === null || stored === undefined || !sameDeckState(stored, current)) {
        throw new AppError("deckChangedDuringUpgrade", { url: current.url });
      }
      const written: Deck = { ...withDeckChanges(stored, current, next), formatVersion: DECK_FORMAT_VERSION };
      // The write carries If-Match of the read above: the entry is moved as it was checked, or not at all.
      await save(catalogUrl, withDeck(dataset, written), deckSubjects(written));
      return written;
    },

    deleteDocument(url) {
      return deleteDocumentIfPresent(url, fetch);
    },

    async removeCard(deck, card): Promise<void> {
      const dataset = await getSolidDatasetOrNull(
        deck.cardsDocumentUrl,
        fetch,
      );
      if (dataset !== null) {
        await saveDataset(deck.cardsDocumentUrl, removeThing(dataset, card.url), fetch);
      }
      const reviews = await getSolidDatasetOrNull(
        deck.reviewsDocumentUrl,
        fetch,
      );
      if (reviews !== null) {
        let updated = reviews;
        for (const direction of ["front-to-back", "back-to-front"] as const) {
          updated = removeThing(
            updated,
            reviewSubjectUrl(deck.reviewsDocumentUrl, {
              cardId: card.id,
              direction,
            }),
          );
        }
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
      cardsDocumentUrl: `${base}decks/${id}.ttl`,
      reviewsDocumentUrl: `${base}reviews/${id}.ttl`,
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
   * app does not know), and others removed.
   */
  function withCardChanges(
    dataset: SolidDataset,
    deck: Deck,
    { save: saved, remove }: { save: (CardContent & { id: string; retired?: true })[]; remove: string[] },
  ): SolidDataset {
    const urlOf = (id: string) => `${deck.cardsDocumentUrl}#${id}`;
    let updated = dataset;
    for (const card of saved) {
      const existing = getThing(updated, urlOf(card.id));
      const createdAt = existing === null ? undefined : getDatetime(existing, DCTERMS.created)?.toISOString();
      updated = setThing(
        updated,
        cardThing(deck, { ...card, ...(createdAt === undefined ? {} : { createdAt }) }, existing),
      );
    }
    for (const id of remove) updated = removeThing(updated, urlOf(id));
    return updated;
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
      cardToRecord(card, card.createdAt ?? now().toISOString()),
      existing,
    );
  }
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
