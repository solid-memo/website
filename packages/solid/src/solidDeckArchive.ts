// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { ReadLimitError, type ReadLimits } from "./client/interface";
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
import { linksGuestPod } from "@solid-memo/domain/guest";
import {
  CARD_FORMAT_VERSION,
  DECK_FORMAT_VERSION,
  type Card,
  type Deck,
} from "@solid-memo/domain/deck";
import type { DeckFileFormat, FormatUpgrade } from "@solid-memo/domain/deckFile";
import {
  REVIEW_STATE_FORMAT_VERSION,
  type FsrsState,
  type ReviewState,
} from "@solid-memo/domain/review";
import { documentUrlOf, fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { LATEST_VERSION, type ShapeName } from "@solid-memo/vocab/types.generated";
import { getSolidDatasetOrNull } from "./datasets";
import { jsonLdOf, refuseRemoteContexts } from "./jsonLd";
import { refuseUnwritable, unwritableTermOf } from "./writableTerms";
import { agentNamesOf, toCard, toDeck } from "./mappers/deckMapper";
import { reviewedCardIdOf, toFsrsState, toReviewState } from "./mappers/reviewStateMapper";
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
 * the deck's own subjects as they are (ownSubjectsOf), so what another
 * app said of the deck, its cards or their states goes with them; only
 * the deck's place among its groups (sm:position) is left behind, and a
 * course's progress unless asked for. Nothing else of its documents goes:
 * a deck may name a document it shares with other data. Turtle is
 * written and read as pod documents are (solidDatasetAsTurtle,
 * parseQuads), JSON-LD read so too and written here (jsonLd.ts). A
 * document exportDeck is asked to read as no one is read with
 * `publicFetch`.
 */
export function createSolidDeckArchive({
  fetch,
  publicFetch,
}: {
  fetch: typeof globalThis.fetch;
  publicFetch: typeof globalThis.fetch;
}): DeckArchive {
  const as = (noOne: boolean) => (noOne ? publicFetch : fetch);
  return {
    async exportDeck(deck, { format, withProgress }, { asNoOne }) {
      const [catalog, cards, reviews] = await Promise.all([
        getSolidDatasetOrNull(documentUrlOf(deck.url), fetch),
        getSolidDatasetOrNull(deck.cardsDocumentUrl, as(asNoOne.cards)),
        withProgress ? getSolidDatasetOrNull(deck.reviewsDocumentUrl, as(asNoOne.reviews)) : null,
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
        ...ownSubjectsOf(deck, cards, reviews),
      ];
      refuseUnwritable(quads);
      if (format === "jsonld") return jsonLdOf(quads, DECK_FILE_PREFIXES);
      return solidDatasetAsTurtle(datasetFromQuads(quads), { prefixes: { ...DECK_FILE_PREFIXES } });
    },

    async readDeckFile(text, format, baseUrl) {
      // A triple with a term Turtle cannot write as it is (JSON-LD can hold one) is left out: saved, it would say more than was read (GHSA-x937-hx25-qfp4).
      const quads = (await parseDeckFile(text, format, baseUrl)).filter(
        (quad) => unwritableTermOf(quad) === undefined,
      );
      const dataset = datasetFromQuads(quads);
      const things = getThingAll(dataset);
      for (const thing of things) refuseNewer(thing);
      const typed = (type: string) =>
        things.filter((thing) => getUrlAll(thing, RDF.type).includes(type));
      // A file of more than one deck is refused before any is read (GHSA-hcrw-cr33-jg78).
      const deckThings = typed(SM.Deck);
      if (deckThings.length !== 1) throw new AppError("notADeckFile");
      // A value of the deck that is an IRI but no URL fails the write of its entry, which comes after its cards and reviews documents: such a file is refused before anything is written.
      if (hasNonUrlValue(quads, asUrl(deckThings[0]!))) throw new AppError("notADeckFile");
      const deck = toDeck(deckThings[0]!, agentNamesOf(dataset));
      if (deck === null) throw new AppError("notADeckFile");

      const report = new ReadReport();
      report.upgrade("deck", deck.url, deck.formatVersion, DECK_FORMAT_VERSION);
      const cards = readCards(typed(SM.Card), dataset, deck, report);
      const ids = new Set(cards.map((card) => card.id));
      const { reviews, fsrsReviews } = readReviewStates(typed(SM.ReviewState), deck, ids, report);
      // An address the import keeps as it is, such as a card's picture or subject, never links to a guest's pod: a guest's copy would stay there (GHSA-hc3p-fpwj-fvjp).
      if (linksGuestPod([deck, cards, reviews, fsrsReviews]))
        throw new AppError("deckFileLinksGuestPod");
      return {
        deck,
        cards,
        upgraded: report.upgraded,
        dropped: report.dropped,
        ...(reviews.length === 0 ? {} : { reviews }),
        ...(fsrsReviews.length === 0 ? {} : { fsrsReviews }),
      };
    },
  };
}

/** What reading a deck file notes beside what it reads: the subjects upgraded from an older format, and those left out. */
class ReadReport {
  readonly upgraded: FormatUpgrade[] = [];
  readonly dropped: string[] = [];

  /** Note a subject read in an older format than this app writes. */
  upgrade(kind: FormatUpgrade["kind"], subject: string, from: number, to: number): void {
    if (from < to) this.upgraded.push({ kind, subject, from, to });
  }

  /** Note a subject left out. */
  drop(subject: string): void {
    this.dropped.push(subject);
  }
}

/** The deck's own cards of a deck file; a card in another document, or not one, is dropped. */
function readCards(things: Subject[], dataset: Dataset, deck: Deck, report: ReadReport): Card[] {
  const cards: Card[] = [];
  for (const thing of things) {
    const card =
      documentUrlOf(asUrl(thing)) === deck.cardsDocumentUrl ? toCard(thing, dataset) : null;
    if (card === null) {
      report.drop(asUrl(thing));
      continue;
    }
    cards.push(card);
    report.upgrade("card", card.url, card.formatVersion, CARD_FORMAT_VERSION);
  }
  return cards;
}

/** The deck's own review states of a deck file, SM-2 and FSRS-6 apart; one in another document, or of no card read, is dropped. */
function readReviewStates(
  things: Subject[],
  deck: Deck,
  ids: ReadonlySet<string>,
  report: ReadReport,
): { reviews: ReviewState[]; fsrsReviews: FsrsState[] } {
  const reviews: ReviewState[] = [];
  const fsrsReviews: FsrsState[] = [];
  for (const thing of things) {
    const own = documentUrlOf(asUrl(thing)) === deck.reviewsDocumentUrl;
    const state = own ? toReviewState(thing, deck) : null;
    // An FSRS-6 state is this app's own too: it comes with the progress.
    const fsrs = own && state === null ? toFsrsState(thing, deck) : null;
    const of = state ?? fsrs;
    if (of === null || !ids.has(of.cardId)) {
      report.drop(asUrl(thing));
      continue;
    }
    if (state === null) fsrsReviews.push(fsrs!);
    else {
      reviews.push(state);
      report.upgrade("reviewState", asUrl(thing), state.formatVersion, REVIEW_STATE_FORMAT_VERSION);
    }
  }
  return { reviews, fsrsReviews };
}

/**
 * Whether the deck subject has a value that is an IRI no URL parser takes
 * (`<http://a:99999/x>`): its catalog entry could not be written. Told
 * from the triples, not the deck read from them, which may leave such a
 * value out.
 */
function hasNonUrlValue(quads: readonly Quad[], deckUrl: string): boolean {
  return quads.some(
    ({ subject, object }) =>
      subject.value === deckUrl && object.termType === "NamedNode" && !URL.canParse(object.value),
  );
}

/**
 * The triples of the deck's own subjects in its two documents, read as
 * readDeckFile reads them back: each of its cards (an sm:Card of its
 * cards document) with the distractors it names there, and each review
 * state of one of those cards in its reviews document; with the blank
 * nodes they lead to (quadsAbout). Anything else either document holds
 * is not the deck's and is left out.
 */
function ownSubjectsOf(deck: Deck, cards: Dataset | null, reviews: Dataset | null): Quad[] {
  const cardThings = subjectsIn(cards, deck.cardsDocumentUrl).filter((thing) =>
    getUrlAll(thing, RDF.type).includes(SM.Card),
  );
  const ids = new Set(cardThings.map((thing) => fragmentIdOf(asUrl(thing))));
  const cardSubjects = new Set(
    cardThings.flatMap((thing) => [asUrl(thing), ...getUrlAll(thing, SM.distractor)]),
  );
  const stateSubjects = new Set(
    subjectsIn(reviews, deck.reviewsDocumentUrl)
      .filter((thing) => ids.has(reviewedCardIdOf(thing, deck) ?? ""))
      .map(asUrl),
  );
  return [
    ...quadsAbout(quadsOf(cards), cardSubjects),
    ...quadsAbout(quadsOf(reviews), stateSubjects),
  ];
}

/** The subjects the document read has at its own IRIs; none of one there is none of. */
function subjectsIn(dataset: Dataset | null, documentUrl: string): Subject[] {
  if (dataset === null) return [];
  return getThingAll(dataset).filter((thing) => documentUrlOf(asUrl(thing)) === documentUrl);
}

/** The triples of `subjects`, and of every blank node they lead to, in the document's order. */
function quadsAbout(quads: readonly Quad[], subjects: ReadonlySet<string>): Quad[] {
  const keyOf = (term: Quad["subject"] | Quad["object"]) =>
    term.termType === "BlankNode" ? `_:${term.value}` : term.value;
  const bySubject = new Map<string, Quad[]>();
  for (const quad of quads) {
    const key = keyOf(quad.subject);
    const about = bySubject.get(key);
    if (about === undefined) bySubject.set(key, [quad]);
    else about.push(quad);
  }
  const kept = new Set(subjects);
  const next = [...subjects];
  for (let key = next.pop(); key !== undefined; key = next.pop()) {
    for (const { object } of bySubject.get(key) ?? []) {
      const blank = keyOf(object);
      if (object.termType !== "BlankNode" || kept.has(blank)) continue;
      kept.add(blank);
      next.push(blank);
    }
  }
  return quads.filter((quad) => kept.has(keyOf(quad.subject)));
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
 * The most an import reads of a deck file: a wide margin over a deck of
 * tens of thousands of cards with their progress, as the app exports it
 * from a pod, which has no limit of its own. A file is the user's to
 * choose; one with no end would hold the tab until it ran out of memory.
 */
const DECK_FILE_LIMITS: ReadLimits = {
  bytes: 64 * 1024 * 1024,
  quads: 1_000_000,
  characters: 256 * 1024 * 1024,
};

/**
 * The file's triples, its relative IRIs resolved against `baseUrl`;
 * deckFileUnreadable when it does not parse, deckFileTooLarge when it
 * is larger than `limits` allow (its characters, which are no more than
 * its bytes, then its triples and their terms: quadTally); no limits for
 * a text from the user's own pod, which is then unreadable when its base
 * or prefix declarations are past what any read takes in, or it nests
 * too deep (writeTurtle). A deck file is triples: statements in
 * a named graph (JSON-LD can say them, Turtle cannot) are not the file's
 * and are left out (GHSA-m4hj-7c28-fq4h).
 */
export function parseDeckFile(
  text: string,
  format: DeckFileFormat,
  baseUrl: string,
  limits: ReadLimits | null = DECK_FILE_LIMITS,
): Promise<Quad[]> {
  const tooLarge = () => new AppError("deckFileTooLarge", { ...limits });
  if (limits !== null && text.length > limits.bytes) throw tooLarge();
  // The depth is checked, in refuseRemoteContexts, before anything recurses into the document.
  const checked = format === "jsonld" ? refuseRemoteContexts(text, baseUrl) : text;
  return parseQuads(checked, format, baseUrl, limits ?? undefined).then(
    (parsed) => parsed.filter((quad) => quad.graph.termType === "DefaultGraph"),
    (error: unknown) => {
      // With no limits, a text is refused only for its declarations, IRIs and nesting (writeTurtle), not its size.
      if (error instanceof ReadLimitError && limits !== null) throw tooLarge();
      throw new AppError("deckFileUnreadable", { reason: String(error) });
    },
  );
}
