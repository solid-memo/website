// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Instance graphs for the graph screen's tests, built as the app builds
 * them (instanceGraphOf) from a few documents of instance A: a node of
 * every kind, edges of every kind, a literal in a language and one with
 * a datatype; a large one, of as many cards as asked; and one whose
 * card, and the wrong option it links to, have as many classes and
 * values as asked.
 */

import {
  instanceGraphOf,
  type GraphDocument,
  type InstanceGraph,
} from "@solid-memo/domain/instanceGraph";
import type { DraftTriple } from "@solid-memo/domain/release/releaseDraft";
import type { ReleaseTerm } from "@solid-memo/domain/release/releaseModel";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { instanceA } from "./fixtures";

const STORAGE = "https://pod.example/";
const INSTANCE = instanceA.url;
export const CATALOG = `${INSTANCE}catalog.ttl`;
export const DECK = `${CATALOG}#deck-capitals`;
export const CARDS = `${INSTANCE}decks/capitals.ttl`;
export const CARD = `${CARDS}#sweden`;
export const DISTRACTOR = `${CARDS}#sweden-d1`;
const REVIEWS = `${INSTANCE}reviews/capitals.ttl`;
export const REVIEW = `${REVIEWS}#sweden`;
const MONTH = `${INSTANCE}history/2026-10.ttl`;
export const ANSWER = `${MONTH}#answer-1`;
export const PREFERENCES = `${INSTANCE}preferences.ttl`;
export const GONE = `${CARDS}#norway`;
export const WEBID = `${STORAGE}profile/card#me`;
export const RELEASE = "https://solid-memo.com/decks/capitals/v1.ttl";
export const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const DCT = "http://purl.org/dc/terms/";
const XSD = "http://www.w3.org/2001/XMLSchema#";

const iri = (value: string): ReleaseTerm => ({ kind: "iri", value });
const text = (value: string, language = "", datatype = `${XSD}string`): ReleaseTerm => ({
  kind: "literal",
  value,
  language,
  datatype,
});
const triple = (subject: string, predicate: string, object: ReleaseTerm): DraftTriple => ({
  subject,
  predicate,
  object,
});
const found = (url: string, triples: DraftTriple[]): GraphDocument => ({
  url,
  found: true,
  triples,
});

/** A small instance: a deck of one card in use and one removed, its review state, an answer, and a preferences document there is none of. */
export function smallGraph(): InstanceGraph {
  return instanceGraphOf({
    instanceUrl: INSTANCE,
    storages: [STORAGE],
    documents: [
      found(CATALOG, [
        triple(DECK, TYPE, iri(SM.Deck)),
        triple(DECK, `${DCT}title`, text("Capitals", "en")),
        triple(DECK, `${DCT}publisher`, iri(WEBID)),
        triple(DECK, `${DCT}license`, iri(CC0)),
        triple(DECK, "http://www.w3.org/ns/prov#wasDerivedFrom", iri(RELEASE)),
        triple(DECK, SM.cardsDocument, iri(CARDS)),
        triple(DECK, SM.reviewsDocument, iri(REVIEWS)),
        triple(DECK, `${DCT}created`, text("2026-10-01", "", `${XSD}date`)),
        triple(WEBID, "http://xmlns.com/foaf/0.1/name", text("Alice")),
        triple("_:b0", `${DCT}title`, text("A blank node")),
        triple(DECK, `${DCT}relation`, { kind: "blank", value: "b0" }),
      ]),
      found(CARDS, [
        triple(CARD, TYPE, iri(SM.Card)),
        triple(CARD, SM.front, text("Sweden", "en")),
        triple(CARD, SM.back, text("Stockholm", "sv")),
        triple(CARD, SM.distractor, iri(DISTRACTOR)),
        triple(DISTRACTOR, TYPE, iri(SM.Distractor)),
      ]),
      found(REVIEWS, [
        triple(REVIEW, TYPE, iri(SM.ReviewState)),
        triple(REVIEW, SM.reviewOf, iri(CARD)),
      ]),
      found(MONTH, [
        triple(ANSWER, TYPE, iri(SM.Answer)),
        triple(ANSWER, SM.answeredCard, iri(GONE)),
        triple(ANSWER, SM.answeredDeck, iri(DECK)),
      ]),
      { url: PREFERENCES, found: false, triples: [] },
    ],
  });
}

/** An instance of one deck of `cards` cards, each with a wrong option and a review state. */
export function largeGraph(cards: number): InstanceGraph {
  const card = (n: number) => `${CARDS}#card-${n}`;
  const range = Array.from({ length: cards }, (_, n) => n);
  return instanceGraphOf({
    instanceUrl: INSTANCE,
    storages: [STORAGE],
    documents: [
      found(CATALOG, [
        triple(DECK, TYPE, iri(SM.Deck)),
        triple(DECK, SM.cardsDocument, iri(CARDS)),
      ]),
      found(
        CARDS,
        range.flatMap((n) => [
          triple(card(n), TYPE, iri(SM.Card)),
          triple(card(n), SM.distractor, iri(`${card(n)}-d1`)),
          triple(`${card(n)}-d1`, TYPE, iri(SM.Distractor)),
        ]),
      ),
      found(
        REVIEWS,
        range.map((n) => triple(`${REVIEWS}#card-${n}`, SM.reviewOf, iri(card(n)))),
      ),
    ],
  });
}

/** An instance of one card and its wrong option, each of `count` classes and `count` values, each value in English. */
export function crowdedGraph(count: number): InstanceGraph {
  const range = Array.from({ length: count }, (_, n) => n);
  return instanceGraphOf({
    instanceUrl: INSTANCE,
    storages: [STORAGE],
    documents: [
      found(CARDS, [
        triple(CARD, SM.distractor, iri(DISTRACTOR)),
        ...[CARD, DISTRACTOR].flatMap((subject) =>
          range.flatMap((n) => [
            triple(subject, TYPE, iri(`https://vocab.example/ns#Class${n}`)),
            triple(subject, "https://vocab.example/ns#value", text(`value ${n}`, "en")),
          ]),
        ),
      ]),
    ],
  });
}
