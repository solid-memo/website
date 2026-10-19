// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import {
  instanceGraphOf,
  isInstanceDocumentUrl,
  LDP_CONTAINS,
  type GraphDocument,
  type GraphNode,
  type InstanceGraph,
} from "./instanceGraph";
import type { DraftTriple } from "./release/releaseDraft";
import type { ReleaseTerm } from "./release/releaseModel";
import { growth } from "./testing/growth";

const STORAGE = "https://pod.example/";
const INSTANCE = `${STORAGE}solid-memo/main/`;
const CATALOG = `${INSTANCE}catalog.ttl`;
const CARDS = `${INSTANCE}decks/capitals.ttl`;
const REVIEWS = `${INSTANCE}reviews/capitals.ttl`;
const MONTH = `${INSTANCE}history/2026-10.ttl`;
const WEBID = `${STORAGE}profile/card#me`;
const TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const TITLE = "http://purl.org/dc/terms/title";
const PUBLISHER = "http://purl.org/dc/terms/publisher";
const LICENSE = "http://purl.org/dc/terms/license";
const NAME = "http://xmlns.com/foaf/0.1/name";
const XSD_INT = "http://www.w3.org/2001/XMLSchema#integer";
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";

const iri = (value: string): ReleaseTerm => ({ kind: "iri", value });
const text = (value: string, language = "", datatype = "http://www.w3.org/2001/XMLSchema#string") =>
  ({ kind: "literal", value, language, datatype }) as const;
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

function graph(documents: GraphDocument[], storages = [STORAGE]): InstanceGraph {
  return instanceGraphOf({ instanceUrl: INSTANCE, storages, documents });
}
function node(of: InstanceGraph, id: string): GraphNode | undefined {
  return of.nodes.find((each) => each.id === id);
}
function kinds(of: InstanceGraph): Record<string, string> {
  return Object.fromEntries(of.nodes.map((each) => [each.id, each.kind]));
}

describe("instanceGraphOf", () => {
  it("contains each document read in its folders, from the instance's own down", () => {
    const of = graph([
      found(CARDS, []),
      found(MONTH, []),
      { url: REVIEWS, found: false, triples: [] },
    ]);
    expect(kinds(of)).toEqual({
      [INSTANCE]: "container",
      [`${INSTANCE}decks/`]: "container",
      [CARDS]: "document",
      [`${INSTANCE}history/`]: "container",
      [MONTH]: "document",
      [`${INSTANCE}reviews/`]: "container",
      [REVIEWS]: "document",
    });
    expect(node(of, REVIEWS)).toEqual({
      id: REVIEWS,
      kind: "document",
      document: REVIEWS,
      found: false,
      types: [],
      literals: [],
    });
    expect(of.edges).toEqual([
      { from: INSTANCE, to: `${INSTANCE}decks/`, predicate: LDP_CONTAINS, kind: "containment" },
      { from: `${INSTANCE}decks/`, to: CARDS, predicate: LDP_CONTAINS, kind: "containment" },
      { from: INSTANCE, to: `${INSTANCE}history/`, predicate: LDP_CONTAINS, kind: "containment" },
      { from: `${INSTANCE}history/`, to: MONTH, predicate: LDP_CONTAINS, kind: "containment" },
      { from: INSTANCE, to: `${INSTANCE}reviews/`, predicate: LDP_CONTAINS, kind: "containment" },
      { from: `${INSTANCE}reviews/`, to: REVIEWS, predicate: LDP_CONTAINS, kind: "containment" },
    ]);
  });

  it("contains a draft's documents in its version's folder, each folder once", () => {
    const version = `${INSTANCE}drafts/capitals/v2/`;
    const of = graph([found(`${version}release.ttl`, []), found(`${version}cards.ttl`, [])]);
    expect(of.nodes.map((each) => [each.id, each.kind])).toEqual([
      [INSTANCE, "container"],
      [`${INSTANCE}drafts/`, "container"],
      [`${INSTANCE}drafts/capitals/`, "container"],
      [version, "container"],
      [`${version}release.ttl`, "document"],
      [`${version}cards.ttl`, "document"],
    ]);
    expect(of.edges.filter((each) => each.from === version).map((each) => each.to)).toEqual([
      `${version}release.ttl`,
      `${version}cards.ttl`,
    ]);
  });

  it("makes each subject a node of the document defining it, its classes and literals with it", () => {
    const of = graph([
      found(CATALOG, [
        triple(`${CATALOG}#deck-1`, TYPE, iri(SM.Deck)),
        triple(`${CATALOG}#deck-1`, TITLE, text("Capitals", "en", "rdf:langString")),
        triple(`${CATALOG}#deck-1`, SM.cardsDocument, iri(CARDS)),
        triple(`${CATALOG}#deck-1`, `${SM.Deck}Count`, text("3", "", XSD_INT)),
      ]),
      found(CARDS, [triple(CARDS, "http://purl.org/dc/terms/isPartOf", iri(`${CATALOG}#deck-1`))]),
    ]);
    expect(node(of, `${CATALOG}#deck-1`)).toEqual({
      id: `${CATALOG}#deck-1`,
      kind: "resource",
      document: CATALOG,
      types: [SM.Deck],
      literals: [
        {
          predicate: TITLE,
          value: "Capitals",
          language: "en",
          datatype: "rdf:langString",
          document: CATALOG,
        },
        { predicate: `${SM.Deck}Count`, value: "3", datatype: XSD_INT, document: CATALOG },
      ],
    });
    expect(of.edges).toEqual(
      expect.arrayContaining([
        { from: CATALOG, to: `${CATALOG}#deck-1`, predicate: "", kind: "containment" },
        { from: `${CATALOG}#deck-1`, to: SM.Deck, predicate: TYPE, kind: "vocabulary" },
        { from: `${CATALOG}#deck-1`, to: CARDS, predicate: SM.cardsDocument, kind: "link" },
        {
          from: CARDS,
          to: `${CATALOG}#deck-1`,
          predicate: "http://purl.org/dc/terms/isPartOf",
          kind: "link",
        },
      ]),
    );
    expect(node(of, SM.Deck)?.kind).toBe("vocabularyLeaf");
    // The document's own statements are the document node's, not a resource's.
    expect(of.nodes.filter((each) => each.id === CARDS)).toHaveLength(1);
  });

  it("names a blank node by its document, two documents' labels apart", () => {
    const of = graph([
      found(CATALOG, [
        triple(`${CATALOG}#catalog`, "http://example.org/part", { kind: "blank", value: "b0" }),
        triple("_:b0", TITLE, text("Inner")),
      ]),
      found(CARDS, [triple("_:b0", TITLE, text("Other"))]),
      found(REVIEWS, [
        triple(`${REVIEWS}#s`, "http://example.org/x", { kind: "blank", value: "e" }),
      ]),
    ]);
    expect(node(of, `_:b0@${CATALOG}`)).toMatchObject({
      kind: "resource",
      document: CATALOG,
      blank: true,
      literals: [{ value: "Inner" }],
    });
    expect(node(of, `_:b0@${CARDS}`)).toMatchObject({
      document: CARDS,
      literals: [{ value: "Other" }],
    });
    // Named only as an object, it is still its document's.
    expect(node(of, `_:e@${REVIEWS}`)).toMatchObject({ kind: "resource", document: REVIEWS });
  });

  it("makes what is said elsewhere of a leaf the leaf's, said by that document", () => {
    const of = graph([
      found(CATALOG, [
        triple(`${CATALOG}#catalog`, PUBLISHER, iri(WEBID)),
        triple(`${CATALOG}#catalog`, LICENSE, iri(CC0)),
        triple(WEBID, TYPE, iri("http://xmlns.com/foaf/0.1/Agent")),
        triple(WEBID, NAME, text("Alice")),
        triple(CC0, TYPE, iri("http://purl.org/dc/terms/LicenseDocument")),
      ]),
    ]);
    expect(node(of, WEBID)).toEqual({
      id: WEBID,
      kind: "podLeaf",
      types: ["http://xmlns.com/foaf/0.1/Agent"],
      literals: [{ predicate: NAME, value: "Alice", document: CATALOG }],
    });
    expect(node(of, CC0)).toMatchObject({ kind: "vocabularyLeaf", types: [expect.any(String)] });
    expect(of.edges).toContainEqual({
      from: `${CATALOG}#catalog`,
      to: CC0,
      predicate: LICENSE,
      kind: "vocabulary",
    });
    expect(of.edges).not.toContainEqual(
      expect.objectContaining({ to: WEBID, kind: "containment" }),
    );
  });

  it("tells missing, pod, vocabulary and outside leaves apart", () => {
    const answer = `${MONTH}#answer-1`;
    const links = {
      missing: `${CARDS}#gone`,
      pod: `${STORAGE}elsewhere/releases/capitals/v1.ttl`,
      solidMemo: `${SM.Deck}`,
      library: "https://solid-memo.com/decks/capitals/v1.ttl",
      iana: "https://www.iana.org/assignments/media-types/text/turtle",
      eu: "http://publications.europa.eu/resource/authority/data-theme/EDUC",
      schema: "http://schema.org/Answer",
      license: "https://www.gnu.org/licenses/fdl-1.3.html",
      mail: "mailto:alice@example.org",
      image: "https://images.example/sweden.png",
      unknownClass: "https://other.example/ns#Thing",
    };
    const of = graph([
      found(MONTH, [
        ...Object.entries(links).map(([name, value]) =>
          triple(answer, `http://example.org/${name}`, iri(value)),
        ),
        triple(answer, TYPE, iri(links.unknownClass)),
      ]),
    ]);
    expect(
      Object.fromEntries(Object.entries(links).map(([name, id]) => [name, node(of, id)?.kind])),
    ).toEqual({
      missing: "missing",
      pod: "podLeaf",
      solidMemo: "vocabularyLeaf",
      library: "outsideLeaf",
      iana: "vocabularyLeaf",
      eu: "vocabularyLeaf",
      schema: "vocabularyLeaf",
      license: "vocabularyLeaf",
      mail: "outsideLeaf",
      image: "outsideLeaf",
      unknownClass: "vocabularyLeaf",
    });
    // Without storages, the user's pod is as any other.
    const podless = graph([found(MONTH, [triple(answer, "x:p", iri(links.pod))])], []);
    expect(node(podless, links.pod)?.kind).toBe("outsideLeaf");
  });

  it("counts as vocabulary a license the documents name or type as one, and no page of the W3C's that is no term", () => {
    const deck = `${CATALOG}#deck-1`;
    const links = {
      typed: "https://creativecommons.org/licenses/by-sa/2.0/kr/",
      named: "https://www.kogl.or.kr/info/licenseType1.do",
      webId: "http://www.w3.org/People/Berners-Lee/card#i",
      activityStreams: "https://www.w3.org/ns/activitystreams#Note",
      skos: "http://www.w3.org/2004/02/skos/core#Concept",
    };
    const of = graph([
      found(CATALOG, [
        triple(links.typed, TYPE, iri("http://purl.org/dc/terms/LicenseDocument")),
        triple(deck, LICENSE, iri(links.named)),
        triple(deck, PUBLISHER, iri(links.webId)),
        triple(deck, "http://example.org/kind", iri(links.activityStreams)),
        triple(deck, "http://example.org/concept", iri(links.skos)),
        triple(deck, "http://example.org/named", {
          kind: "literal",
          value: "x",
          language: "",
          datatype: LICENSE,
        }),
      ]),
    ]);
    expect(
      Object.fromEntries(Object.entries(links).map(([name, id]) => [name, node(of, id)?.kind])),
    ).toEqual({
      typed: "vocabularyLeaf",
      named: "vocabularyLeaf",
      webId: "outsideLeaf",
      activityStreams: "vocabularyLeaf",
      skos: "vocabularyLeaf",
    });
  });

  it("takes a storage named without its trailing slash as one with it", () => {
    const answer = `${MONTH}#answer-1`;
    const alice = "https://pod.example/alice";
    const of = graph(
      [
        found(MONTH, [
          triple(answer, "x:mine", iri(`${alice}/profile/card#me`)),
          triple(answer, "x:theirs", iri(`${alice}2/profile/card#me`)),
        ]),
      ],
      [alice],
    );
    expect(node(of, `${alice}/profile/card#me`)?.kind).toBe("podLeaf");
    expect(node(of, `${alice}2/profile/card#me`)?.kind).toBe("outsideLeaf");
  });

  it("marks a document that could not be read", () => {
    const of = graph([{ url: CARDS, found: false, unreadable: true, triples: [] }]);
    expect(node(of, CARDS)).toMatchObject({ kind: "document", found: false, unreadable: true });
  });

  it("puts a subject of the instance whose document was not read in the document stating it", () => {
    const foreign = `${INSTANCE}other.ttl#list`;
    const of = graph([
      found(CATALOG, [
        triple(`${CATALOG}#catalog`, "http://www.w3.org/ns/dcat#dataset", iri(foreign)),
        triple(foreign, TITLE, text("Another app's")),
      ]),
      found(CARDS, [triple(foreign, TITLE, text("Said here too"))]),
    ]);
    expect(node(of, foreign)).toMatchObject({
      kind: "resource",
      document: CATALOG,
      literals: [{ document: CATALOG }, { document: CARDS }],
    });
    expect(of.edges).toContainEqual({
      from: CATALOG,
      to: foreign,
      predicate: "",
      kind: "containment",
    });
  });

  it("joins a statement of a folder to the folder", () => {
    const of = graph([
      found(CATALOG, [triple(`${INSTANCE}decks/`, TITLE, text("Cards"))]),
      found(CARDS, []),
    ]);
    expect(node(of, `${INSTANCE}decks/`)).toMatchObject({
      kind: "container",
      literals: [{ value: "Cards" }],
    });
  });

  it("draws a statement made twice once, and its class once", () => {
    const deck = `${CATALOG}#deck-1`;
    const of = graph([
      found(CATALOG, [triple(deck, TYPE, iri(SM.Deck)), triple(deck, TYPE, iri(SM.Deck))]),
      found(CARDS, [triple(deck, TYPE, iri(SM.Deck))]),
    ]);
    expect(node(of, deck)?.types).toEqual([SM.Deck]);
    expect(of.edges.filter((each) => each.predicate === TYPE)).toHaveLength(1);
  });

  it("leaves out a document outside the instance", () => {
    const outside = `${STORAGE}elsewhere/release.ttl`;
    const of = graph([found(outside, [triple(`${outside}#deck`, TITLE, text("Not ours"))])]);
    expect(of).toEqual({
      nodes: [{ id: INSTANCE, kind: "container", types: [], literals: [] }],
      edges: [],
    });
  });

  it("leaves out a folder, a part of a document and an address that climbs out of the instance", () => {
    const of = graph([
      found(`${INSTANCE}decks/`, [triple(`${INSTANCE}decks/`, TITLE, text("A folder"))]),
      found(INSTANCE, []),
      found(`${CATALOG}#catalog`, []),
      found(`${INSTANCE}decks/../../../private/cards.ttl`, [triple("_:s", TITLE, text("secret"))]),
      found(`${INSTANCE}%2e%2e/%2E%2E/private/enc.ttl`, []),
      found(`${INSTANCE}.%2e/x.ttl`, []),
      found(CARDS, []),
    ]);
    expect(kinds(of)).toEqual({
      [INSTANCE]: "container",
      [`${INSTANCE}decks/`]: "container",
      [CARDS]: "document",
    });
    expect(of.edges.every((each) => each.from !== each.to)).toBe(true);
  });

  it("tells a document of the instance by its address as a request resolves it", () => {
    expect(isInstanceDocumentUrl(CATALOG, INSTANCE)).toBe(true);
    expect(isInstanceDocumentUrl(`${INSTANCE}decks/./capitals.ttl`, INSTANCE)).toBe(false);
    expect(isInstanceDocumentUrl(`${STORAGE}other/catalog.ttl`, INSTANCE)).toBe(false);
    expect(isInstanceDocumentUrl("not an address", INSTANCE)).toBe(false);
  });

  it("takes the instance's address without its trailing slash", () => {
    const of = instanceGraphOf({
      instanceUrl: INSTANCE.slice(0, -1),
      storages: [],
      documents: [found(CATALOG, [])],
    });
    expect(of.nodes.map((each) => each.id)).toEqual([INSTANCE, CATALOG]);
  });

  it("builds the graph in one pass, however many cards and answers there are", {
    timeout: 30_000,
  }, () => {
    const documents = (count: number): GraphDocument[] => {
      const cards: DraftTriple[] = [];
      const answers: DraftTriple[] = [];
      for (let n = 0; n < count; n++) {
        const card = `${CARDS}#card-${n}`;
        cards.push(
          triple(card, TYPE, iri(SM.Card)),
          triple(card, SM.front, text(`Front ${n}`, "en")),
          triple(card, SM.distractor, iri(`${card}-d1`)),
          triple(`${card}-d1`, TYPE, iri(SM.Distractor)),
        );
        answers.push(
          triple(`${MONTH}#answer-${n}`, TYPE, iri(SM.Answer)),
          triple(`${MONTH}#answer-${n}`, SM.answeredCard, iri(card)),
          triple(`${MONTH}#answer-${n}`, SM.answeredCard, iri(`${CARDS}#gone-${n}`)),
        );
      }
      return [found(CARDS, cards), found(MONTH, answers)];
    };
    expect(graph(documents(10)).nodes).toHaveLength(5 + 30 + 10 + 3);
    // Eight times the cards take about as long as an eighth of them eight
    // times over; work per statement that grew with the statements would
    // take eight times as long.
    const ratio = growth(
      (count) => {
        const some = documents(count);
        return () => graph(some);
      },
      500,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
