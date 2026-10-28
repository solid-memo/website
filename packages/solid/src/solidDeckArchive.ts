// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { parseQuads, solidDatasetAsTurtle } from "./client/resources";
import {
  type Dataset,
  type Subject,
  asUrl,
  datasetFromQuads,
  getThing,
  getThingAll,
  getUrlAll,
  toRdfJsDataset,
} from "./client/rdf";
import type { Quad } from "@rdfjs/types";
import type { DeckArchive } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";
import { distributionUrlOf } from "@solid-memo/domain/dcat";
import { CARD_FORMAT_VERSION, DECK_FORMAT_VERSION, type Card } from "@solid-memo/domain/deck";
import type { DeckFileFormat, FormatUpgrade } from "@solid-memo/domain/deckFile";
import {
  REVIEW_STATE_FORMAT_VERSION,
  type FsrsState,
  type ReviewState,
} from "@solid-memo/domain/review";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { LATEST_VERSION, type ShapeName } from "@solid-memo/vocab/types.generated";
import { getSolidDatasetOrNull } from "./datasets";
import { jsonLdOf, refuseRemoteContexts } from "./jsonLd";
import { refuseUnwritable, unwritableTermOf } from "./writableTerms";
import { agentNamesOf, toCard, toDeck } from "./mappers/deckMapper";
import { toFsrsState, toReviewState } from "./mappers/reviewStateMapper";
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

/**
 * The kinds of subject a deck file holds, by class (and, for an FSRS-6
 * state, the scheduler it names), with the shape their versions are of.
 */
const KINDS: readonly { type: string; scheduler?: string; shape: ShapeName }[] = [
  { type: SM.Deck, shape: "deck" },
  { type: SM.Card, shape: "card" },
  { type: SM.ReviewState, shape: "reviewState" },
  { type: SM.ReviewState, scheduler: SM.fsrs6, shape: "fsrsReviewState" },
];

/**
 * The DeckArchive over the pod (domain/deckFile.ts). An export copies
 * triples as they are, so what another app said of the deck, its cards
 * or their states goes with them; only the deck's place among its
 * groups (sm:position) is left behind, and a course's progress unless
 * asked for. Turtle is written and read as pod documents
 * are (solidDatasetAsTurtle, parseQuads), JSON-LD read so too and
 * written here (jsonLd.ts).
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
      refuseUnwritable(quads);
      if (format === "jsonld") return jsonLdOf(quads, DECK_FILE_PREFIXES);
      return solidDatasetAsTurtle(datasetFromQuads(quads), { prefixes: { ...DECK_FILE_PREFIXES } });
    },

    async readDeckFile(text, format, baseUrl) {
      // A triple with a term Turtle cannot write as it is (JSON-LD can hold one) is left out: saved, it would say more than was read (GHSA-x937-hx25-qfp4).
      const dataset = datasetFromQuads(
        (await parseDeckFile(text, format, baseUrl)).filter(
          (quad) => unwritableTermOf(quad) === undefined,
        ),
      );
      const things = getThingAll(dataset);
      for (const thing of things) refuseNewer(thing);
      const typed = (type: string) =>
        things.filter((thing) => getUrlAll(thing, RDF.type).includes(type));
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
        const card =
          documentUrlOf(asUrl(thing)) === deck.cardsDocumentUrl ? toCard(thing, dataset) : null;
        if (card === null) {
          dropped.push(asUrl(thing));
          continue;
        }
        cards.push(card);
        upgrade("card", card.url, card.formatVersion, CARD_FORMAT_VERSION);
      }
      const ids = new Set(cards.map((card) => card.id));
      const reviews: ReviewState[] = [];
      const fsrsReviews: FsrsState[] = [];
      for (const thing of typed(SM.ReviewState)) {
        const own = documentUrlOf(asUrl(thing)) === deck.reviewsDocumentUrl;
        const state = own ? toReviewState(thing, deck) : null;
        // An FSRS-6 state is this app's own too: it comes with the progress.
        const fsrs = own && state === null ? toFsrsState(thing, deck) : null;
        const of = state ?? fsrs;
        if (of === null || !ids.has(of.cardId)) {
          dropped.push(asUrl(thing));
          continue;
        }
        if (state === null) fsrsReviews.push(fsrs!);
        else {
          reviews.push(state);
          upgrade("reviewState", asUrl(thing), state.formatVersion, REVIEW_STATE_FORMAT_VERSION);
        }
      }
      return {
        deck,
        cards,
        upgraded,
        dropped,
        ...(reviews.length === 0 ? {} : { reviews }),
        ...(fsrsReviews.length === 0 ? {} : { fsrsReviews }),
      };
    },
  };
}

/** The triples of a document read; none of one there is none of. */
function quadsOf(dataset: Dataset | null): Quad[] {
  return dataset === null ? [] : ([...toRdfJsDataset(dataset)] as Quad[]);
}

/** Refuse a subject of a deck's kinds in a newer format than this app reads, as the pod's own are read only by a newer app. */
function refuseNewer(thing: Subject): void {
  const types = getUrlAll(thing, RDF.type);
  const schedulers = getUrlAll(thing, SM.scheduler);
  for (const { type, scheduler, shape } of KINDS) {
    const version = storedVersionOf(thing);
    const ofKind =
      types.includes(type) && (scheduler === undefined || schedulers.includes(scheduler));
    if (ofKind && version > LATEST_VERSION[shape]) {
      throw new AppError("deckFileTooNew", {
        subject: asUrl(thing),
        version,
        reads: LATEST_VERSION[shape],
      });
    }
  }
}

/**
 * The file's triples, its relative IRIs resolved against `baseUrl`;
 * deckFileUnreadable when it does not parse. A deck file is triples:
 * statements in a named graph (JSON-LD can say them, Turtle cannot) are
 * not the file's and are left out (GHSA-m4hj-7c28-fq4h).
 */
export function parseDeckFile(
  text: string,
  format: DeckFileFormat,
  baseUrl: string,
): Promise<Quad[]> {
  const checked = format === "jsonld" ? refuseRemoteContexts(text) : text;
  return parseQuads(checked, format, baseUrl).then(
    (quads) => quads.filter((quad) => quad.graph.termType === "DefaultGraph"),
    (error: unknown) => {
      throw new AppError("deckFileUnreadable", { reason: String(error) });
    },
  );
}
