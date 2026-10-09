import {
  asUrl,
  createSolidDataset,
  getJsonLdParser,
  getThing,
  getThingAll,
  getTurtleParser,
  getUrlAll,
  solidDatasetAsTurtle,
  toRdfJsDataset,
  type SolidDataset,
  type Thing,
  type WithServerResourceInfo,
} from "@inrupt/solid-client";
import type { Quad } from "@rdfjs/types";
import type { DeckArchive } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";
import { distributionUrlOf } from "@solid-memo/domain/dcat";
import { CARD_FORMAT_VERSION, DECK_FORMAT_VERSION, type Card } from "@solid-memo/domain/deck";
import { DECK_FILE_TYPES, type DeckFileContent, type DeckFileFormat, type FormatUpgrade } from "@solid-memo/domain/deckFile";
import { REVIEW_STATE_FORMAT_VERSION, type ReviewState } from "@solid-memo/domain/review";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { LATEST_VERSION, type ShapeName } from "@solid-memo/vocab/types.generated";
import { getSolidDatasetOrNull } from "./datasets";
import { jsonLdOf, refuseRemoteContexts } from "./jsonLd";
import { graphsOf } from "./linearDataset";
import { agentNamesOf, toCard, toDeck } from "./mappers/deckMapper";
import { toReviewState } from "./mappers/reviewStateMapper";
import { storedVersionOf } from "./records";
import { DCTERMS, RDF, SM, SM_NS } from "./vocab";

/** The prefixes a deck file is written with, in Turtle and in JSON-LD alike. */
export const DECK_FILE_PREFIXES: Readonly<Record<string, string>> = {
  sm: SM_NS,
  dcat: "http://www.w3.org/ns/dcat#",
  dcterms: "http://purl.org/dc/terms/",
  foaf: "http://xmlns.com/foaf/0.1/",
  owl: "http://www.w3.org/2002/07/owl#",
  prov: "http://www.w3.org/ns/prov#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  schema: "https://schema.org/",
  skos: "http://www.w3.org/2004/02/skos/core#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

/** The kinds of subject a deck file holds, by class, with the shape their versions are of. */
const KINDS: readonly { type: string; shape: ShapeName }[] = [
  { type: SM.Deck, shape: "deck" },
  { type: SM.Card, shape: "card" },
  { type: SM.ReviewState, shape: "reviewState" },
];

/**
 * The DeckArchive over the pod (domain/deckFile.ts). An export copies
 * triples as they are, so what another app said of the deck, its cards
 * or their states goes with them; only the deck's place among its
 * groups (sm:position) is left behind, and a course's progress unless
 * asked for. Turtle is written by @inrupt/solid-client
 * (solidDatasetAsTurtle) and read by it (getTurtleParser), JSON-LD read
 * by it too (getJsonLdParser) and written here (jsonLd.ts).
 */
export function createSolidDeckArchive({ fetch }: { fetch: typeof globalThis.fetch }): DeckArchive {
  return {
    async exportDeck(deck, { format, withProgress }) {
      const [catalog, cards, reviews] = await Promise.all([
        getSolidDatasetOrNull(documentUrlOf(deck.url), fetch),
        getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch),
        withProgress ? getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch) : null,
      ]);
      const entry = catalog === null ? null : getThing(catalog, deck.url);
      if (entry === null) throw new AppError("deckGone", { deck: deck.title });
      const beside = new Set([distributionUrlOf(deck.url), ...getUrlAll(entry, DCTERMS.creator)]);
      const left = new Set<string>([SM.position, ...(withProgress ? [] : [SM.completedChapter])]);
      const quads = [
        ...quadsOf(catalog).filter(
          ({ subject, predicate }) =>
            (subject.value === deck.url && !left.has(predicate.value)) || beside.has(subject.value),
        ),
        ...quadsOf(cards),
        ...quadsOf(reviews),
      ];
      if (format === "jsonld") return jsonLdOf(quads, DECK_FILE_PREFIXES);
      return solidDatasetAsTurtle(datasetOf(quads), { prefixes: { ...DECK_FILE_PREFIXES } });
    },

    async readDeckFile(text, format, baseUrl) {
      const dataset = datasetOf(await parse(text, format, baseUrl));
      const things = getThingAll(dataset);
      for (const thing of things) refuseNewer(thing);
      const typed = (type: string) => things.filter((thing) => getUrlAll(thing, RDF.type).includes(type));
      const names = agentNamesOf(dataset);
      const decks = typed(SM.Deck).map((thing) => toDeck(thing, names));
      if (decks.length !== 1 || decks[0] === null) throw new AppError("notADeckFile");
      const deck = decks[0]!;

      const upgraded: FormatUpgrade[] = [];
      const dropped: string[] = [];
      const upgrade = (kind: FormatUpgrade["kind"], subject: string, from: number, to: number) => {
        if (from < to) upgraded.push({ kind, subject, from, to });
      };
      upgrade("deck", deck.url, deck.formatVersion, DECK_FORMAT_VERSION);

      const cards: Card[] = [];
      for (const thing of typed(SM.Card)) {
        const card = documentUrlOf(asUrl(thing)) === deck.cardsDocumentUrl ? toCard(thing, dataset) : null;
        if (card === null) {
          dropped.push(asUrl(thing));
          continue;
        }
        cards.push(card);
        upgrade("card", card.url, card.formatVersion, CARD_FORMAT_VERSION);
      }
      const ids = new Set(cards.map((card) => card.id));
      const reviews: ReviewState[] = [];
      for (const thing of typed(SM.ReviewState)) {
        const state = documentUrlOf(asUrl(thing)) === deck.reviewsDocumentUrl ? toReviewState(thing, deck) : null;
        if (state === null || !ids.has(state.cardId)) {
          dropped.push(asUrl(thing));
          continue;
        }
        reviews.push(state);
        upgrade("reviewState", asUrl(thing), state.formatVersion, REVIEW_STATE_FORMAT_VERSION);
      }
      const content: DeckFileContent = { deck, cards, upgraded, dropped };
      return reviews.length === 0 ? content : { ...content, reviews };
    },
  };
}

/** The triples of a document read; none of one there is none of. */
function quadsOf(dataset: SolidDataset | null): Quad[] {
  return dataset === null ? [] : ([...toRdfJsDataset(dataset)] as Quad[]);
}

/** Triples as a dataset, built in one pass (linearDataset.ts). */
function datasetOf(quads: readonly Quad[]): SolidDataset {
  return Object.freeze({ ...createSolidDataset(), graphs: graphsOf(quads) });
}

/** Refuse a subject of a deck's kinds in a newer format than this app reads, as the pod's own are read only by a newer app. */
function refuseNewer(thing: Thing): void {
  const types = getUrlAll(thing, RDF.type);
  for (const { type, shape } of KINDS) {
    const version = storedVersionOf(thing);
    if (types.includes(type) && version > LATEST_VERSION[shape]) {
      throw new AppError("deckFileTooNew", { subject: asUrl(thing), version, reads: LATEST_VERSION[shape] });
    }
  }
}

/** The file's triples, its relative IRIs resolved against `baseUrl`; deckFileUnreadable when it does not parse. */
function parse(text: string, format: DeckFileFormat, baseUrl: string): Promise<Quad[]> {
  if (format === "jsonld") refuseRemoteContexts(text);
  const parser = format === "turtle" ? getTurtleParser() : getJsonLdParser();
  return new Promise((resolve, reject) => {
    const quads: Quad[] = [];
    parser.onQuad((quad) => quads.push(quad));
    parser.onError((error) => reject(new AppError("deckFileUnreadable", { reason: String(error) })));
    parser.onComplete(() => resolve(quads));
    parser.parse(text, {
      internal_resourceInfo: { sourceIri: baseUrl, isRawData: false, contentType: DECK_FILE_TYPES[format].mediaType },
    } as WithServerResourceInfo);
  });
}
