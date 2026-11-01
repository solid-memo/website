// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Quad } from "@rdfjs/types";
import {
  asUrl,
  buildThing,
  changesOf,
  createThing,
  type Dataset,
  getBoolean,
  getInteger,
  getPropertyAll,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrlAll,
  type NamedSubject,
  removeThings,
  setThing,
  setThings,
  type SubjectBuilder,
  toRdfJsDataset,
  withQuads,
} from "../client/rdf";
import { foreignSubjects } from "../ownership";
import { recordThing } from "../records";
import { type Catalog, catalogToRecord, publisherToRecord } from "@solid-memo/domain/catalog";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { AGENT_V1, CATALOG_V1 } from "@solid-memo/vocab/descriptors.generated";
import { datasetFrom } from "../testing/datasets";
import { growth } from "@solid-memo/domain/testing/growth";
import {
  deckSubjects,
  toCard,
  toCards,
  toCatalog,
  toDeck,
  toDecks,
  toDistractor,
  withCatalog,
  withDeck,
  withDecks,
  writeDistractors,
  withoutUnnamedDistractors,
  withoutDeck,
} from "./deckMapper";
import type { Deck, Distractor } from "@solid-memo/domain/deck";
import { editOf } from "../datasetEdit";
import { DCAT, DCTERMS, RDF, SCHEMA, SM } from "../vocab";

const OWL_DEPRECATED = "http://www.w3.org/2002/07/owl#deprecated";

const CATALOG = "https://pod.example/solid-memo/a/catalog.ttl";
const CARDS_DOC = "https://pod.example/solid-memo/a/decks/deck-1.ttl";
const REVIEWS_DOC = "https://pod.example/solid-memo/a/reviews/deck-1.ttl";
const FLAG = "https://flagcdn.com/h80/af.png";
const MAP = "https://img.example/af-map.png";

describe("toDeck", () => {
  function deckThing(build: (t: SubjectBuilder) => SubjectBuilder) {
    return build(buildThing(createThing({ url: `${CATALOG}#deck-1` }))).build();
  }

  it("maps a well-formed deck subject", () => {
    const thing = deckThing((t) =>
      t
        .addIri(RDF.type, SM.Deck)
        .addStringNoLocale(DCTERMS.title, "Kanji N5")
        .addDatetime(DCTERMS.created, new Date("2026-09-21T10:00:00.000Z"))
        .addIri(SM.cardsDocument, CARDS_DOC)
        .addIri(SM.reviewsDocument, REVIEWS_DOC),
    );
    expect(toDeck(thing)).toEqual({
      id: "deck-1",
      url: `${CATALOG}#deck-1`,
      title: { en: "Kanji N5" },
      cardsDocumentUrl: CARDS_DOC,
      reviewsDocumentUrl: REVIEWS_DOC,
      direction: "front-to-back",
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
      description: { en: "Flashcards: Kanji N5.", sv: "Kortlek: Kanji N5." },
    });
  });

  it("reads the course chapters a deck completed, and the deck keeps them when it is written again", () => {
    const chapters = [
      "https://solid-memo.com/decks/solid/v1.ttl#ch-1",
      "https://solid-memo.com/decks/solid/v1.ttl#ch-2",
    ];
    const thing = deckThing((t) =>
      t
        .addIri(RDF.type, SM.Deck)
        .addStringNoLocale(DCTERMS.title, "Solid")
        .addIri(SM.cardsDocument, CARDS_DOC)
        .addIri(SM.reviewsDocument, REVIEWS_DOC)
        .addIri(SM.completedChapter, chapters[0]!)
        .addIri(SM.completedChapter, chapters[1]!),
    );
    const deck = toDeck(thing)!;
    expect(deck.completedChapters).toEqual(chapters);
    const rewritten = withDeck(setThing(datasetFrom(CATALOG), thing), {
      ...deck,
      title: { en: "Solid, renamed" },
    });
    expect(getUrlAll(getThing(rewritten, deck.url)!, SM.completedChapter)).toEqual(chapters);
    expect(toDecks(rewritten, CATALOG)[0]).toMatchObject({
      title: { en: "Solid, renamed" },
      completedChapters: chapters,
    });
  });

  it("reads a course's deck by its schema:Course type, which a write of the deck keeps whatever the deck says", () => {
    const thing = deckThing((t) =>
      t
        .addIri(RDF.type, SM.Deck)
        .addIri(RDF.type, SCHEMA.Course)
        .addStringNoLocale(DCTERMS.title, "Solid")
        .addIri(SM.cardsDocument, CARDS_DOC)
        .addIri(SM.reviewsDocument, REVIEWS_DOC),
    );
    const deck = toDeck(thing)!;
    expect(deck.course).toBe(true);
    const { course: _, ...stale } = deck;
    const rewritten = withDeck(setThing(datasetFrom(CATALOG), thing), stale);
    expect(getUrlAll(getThing(rewritten, deck.url)!, RDF.type)).toContain(SCHEMA.Course);
    expect(toDecks(rewritten, CATALOG)[0]?.course).toBe(true);
  });

  describe("the deck's card language", () => {
    const withLanguage = (value: string, lang?: string) =>
      deckThing((t) => {
        const entry = t
          .addIri(RDF.type, SM.Deck)
          .addStringNoLocale(DCTERMS.title, "Words")
          .addIri(SM.cardsDocument, CARDS_DOC)
          .addIri(SM.reviewsDocument, REVIEWS_DOC)
          .addStringNoLocale("https://other.example/ns#note", "kept");
        return lang === undefined
          ? entry.addStringNoLocale(SM.deckCardLanguage, value)
          : entry.addStringWithLocale(SM.deckCardLanguage, value, lang);
      });

    it("reads one that names a language, in lower case", () => {
      expect(toDeck(withLanguage("sv"))?.cardLanguage).toBe("sv");
      expect(toDeck(withLanguage("PT-br"))?.cardLanguage).toBe("pt-br");
    });

    it("drops one that names no language, text in no language, or a language-tagged string", () => {
      expect(toDeck(withLanguage("Swedish"))).not.toHaveProperty("cardLanguage");
      expect(toDeck(withLanguage("zxx"))).not.toHaveProperty("cardLanguage");
      expect(toDeck(withLanguage("sv", "en"))).not.toHaveProperty("cardLanguage");
    });

    it("is kept as stored by a write of the deck, whatever the deck says, as the triples it does not know", () => {
      const thing = withLanguage("sv");
      const deck = toDeck(thing)!;
      const stored = setThing(datasetFrom(CATALOG), thing);
      const read = (dataset: Dataset) => getThing(dataset, deck.url)!;

      const { cardLanguage: _, ...stale } = deck;
      for (const written of [stale, { ...deck, cardLanguage: "ko" }]) {
        const updated = withDeck(stored, written);
        expect(getStringNoLocale(read(updated), SM.deckCardLanguage)).toBe("sv");
        expect(getStringNoLocale(read(updated), "https://other.example/ns#note")).toBe("kept");
        expect(toDecks(updated, CATALOG)[0]?.cardLanguage).toBe("sv");
      }
    });
  });

  it("keeps the provenance of an imported deck", () => {
    const thing = deckThing((t) =>
      t
        .addIri(RDF.type, SM.Deck)
        .addStringNoLocale(DCTERMS.title, "Capitals")
        .addIri(SM.cardsDocument, CARDS_DOC)
        .addIri(SM.reviewsDocument, REVIEWS_DOC)
        .addInteger(SM.formatVersion, 1)
        .addStringNoLocale(DCTERMS.creator, "Anton Wiklund")
        .addStringNoLocale(DCTERMS.creator, "A friend")
        .addIri(DCTERMS.license, "https://creativecommons.org/publicdomain/zero/1.0/")
        .addStringNoLocale(DCTERMS.description, "Capitals, from Wikipedia.")
        .addIri(DCTERMS.source, "https://solid-memo.com/decks/capitals/v1.ttl"),
    );
    expect(toDeck(thing)).toMatchObject({
      formatVersion: 1,
      authors: ["Anton Wiklund", "A friend"],
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      description: { en: "Capitals, from Wikipedia." },
      sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
    });
  });

  it("names a format-3 deck's creators from the agents beside it, or by IRI when there is none", () => {
    const deck = deckThing((t) =>
      t
        .addIri(RDF.type, SM.Deck)
        .addStringNoLocale(DCTERMS.title, "Capitals")
        .addStringNoLocale(DCTERMS.description, "Capitals.")
        .addIri(SM.studyDirection, SM.backToFront)
        .addIri(DCTERMS.creator, `${CATALOG}#agent-anton`)
        .addIri(DCTERMS.creator, `${CATALOG}#agent-gone`)
        .addIri(
          "http://www.w3.org/ns/dcat#theme",
          "https://solid-memo.com/ns/vocab/topics.ttl#geography",
        )
        .addStringNoLocale("http://www.w3.org/ns/dcat#keyword", "capitals")
        .addIri(SM.cardsDocument, CARDS_DOC)
        .addIri(SM.reviewsDocument, REVIEWS_DOC)
        .addInteger(SM.formatVersion, 3),
    );
    const agent = buildThing(createThing({ url: `${CATALOG}#agent-anton` }))
      .addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent")
      .addStringNoLocale("http://xmlns.com/foaf/0.1/name", "Anton")
      .addIri("http://xmlns.com/foaf/0.1/mbox", "mailto:anton@example.com")
      .build();
    const catalog = setThing(setThing(datasetFrom(CATALOG), deck), agent);
    expect(toDecks(catalog, CATALOG)).toEqual([
      expect.objectContaining({
        direction: "back-to-front",
        authors: ["Anton <anton@example.com>", `${CATALOG}#agent-gone`],
        themes: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"],
        keywords: { "": ["capitals"] },
        formatVersion: 3,
      }),
    ]);
  });

  it("reads a creator at an agent IRI written before names were hashed, and a rewrite leaves no stray agent", () => {
    const deck = deckThing((t) =>
      t
        .addIri(RDF.type, SM.Deck)
        .addStringNoLocale(DCTERMS.title, "Korean")
        .addStringNoLocale(DCTERMS.description, "Korean.")
        .addIri(SM.studyDirection, SM.frontToBack)
        .addIri(DCTERMS.creator, `${CATALOG}#agent-unnamed`)
        .addIri(SM.cardsDocument, CARDS_DOC)
        .addIri(SM.reviewsDocument, REVIEWS_DOC)
        .addInteger(SM.formatVersion, 3),
    );
    const agent = buildThing(createThing({ url: `${CATALOG}#agent-unnamed` }))
      .addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent")
      .addStringNoLocale("http://xmlns.com/foaf/0.1/name", "김민수")
      .build();
    const [read] = toDecks(setThing(setThing(datasetFrom(CATALOG), deck), agent), CATALOG);
    expect(read!.authors).toEqual(["김민수"]);
    const rewritten = withDeck(setThing(setThing(datasetFrom(CATALOG), deck), agent), {
      ...read!,
      authors: ["김민수", "이지은"],
    });
    expect(getThing(rewritten, `${CATALOG}#agent-unnamed`)).toBeNull();
    expect(toDecks(rewritten, CATALOG)[0]!.authors).toEqual(["김민수", "이지은"]);
  });

  it("lists the decks of this catalog whose documents are at an address a deck's may be, wherever it is", () => {
    const B = "https://pod.example/solid-memo/b/";
    const entry = (url: string, cards: string, reviews: string) =>
      buildThing(createThing({ url }))
        .addIri(RDF.type, SM.Deck)
        .addStringNoLocale(DCTERMS.title, url)
        .addIri(SM.cardsDocument, cards)
        .addIri(SM.reviewsDocument, reviews)
        .build();
    const catalog = [
      entry(`${CATALOG}#deck-1`, CARDS_DOC, REVIEWS_DOC),
      // Another folder of the pod, and each kind in the other's folder: read wherever they are.
      entry(`${CATALOG}#deck-2`, "https://pod.example/profile/card", REVIEWS_DOC),
      entry(`${CATALOG}#deck-4`, REVIEWS_DOC, CARDS_DOC),
      // A dot segment, another resource's access control, one of the instance's own documents.
      entry(
        `${CATALOG}#deck-3`,
        CARDS_DOC,
        "https://pod.example/solid-memo/a/reviews/../../../private/diary.ttl",
      ),
      entry(`${CATALOG}#deck-6`, `${CARDS_DOC}.acl`, REVIEWS_DOC),
      entry(`${CATALOG}#deck-7`, CARDS_DOC, "https://pod.example/solid-memo/a/meta.ttl"),
      // An entry the catalog states of another instance's catalog.
      entry(`${B}catalog.ttl#deck-5`, `${B}decks/deck-5.ttl`, `${B}reviews/deck-5.ttl`),
    ].reduce(setThing, datasetFrom(CATALOG));
    expect(toDecks(catalog, CATALOG).map((deck) => deck.url)).toEqual([
      `${CATALOG}#deck-1`,
      `${CATALOG}#deck-2`,
      `${CATALOG}#deck-4`,
    ]);
  });

  it("reads a newer format version with the latest shape it knows, keeping the stored version", () => {
    const thing = deckThing((t) =>
      t
        .addIri(RDF.type, SM.Deck)
        .addStringWithLocale(DCTERMS.title, "Future", "en")
        .addStringWithLocale(DCTERMS.description, "From the future.", "en")
        .addIri(SM.studyDirection, SM.backToFront)
        .addIri(SM.cardsDocument, CARDS_DOC)
        .addIri(SM.reviewsDocument, REVIEWS_DOC)
        .addInteger(SM.formatVersion, 7),
    );
    expect(toDeck(thing)).toMatchObject({ formatVersion: 7, direction: "back-to-front" });
  });

  it("reads a format-2 deck's direction, and a missing created date as empty", () => {
    const thing = deckThing((t) =>
      t
        .addIri(RDF.type, SM.Deck)
        .addStringNoLocale(DCTERMS.title, "Both ways")
        .addStringNoLocale(SM.direction, "bidirectional")
        .addIri(SM.cardsDocument, CARDS_DOC)
        .addIri(SM.reviewsDocument, REVIEWS_DOC)
        .addInteger(SM.formatVersion, 2),
    );
    expect(toDeck(thing)).toMatchObject({
      direction: "bidirectional",
      createdAt: "",
      formatVersion: 2,
    });
  });

  it("keeps a format-2 deck's co-authors whose names fold to the same slug apart", () => {
    const thing = deckThing((t) =>
      t
        .addIri(RDF.type, SM.Deck)
        .addStringNoLocale(DCTERMS.title, "Korean")
        .addStringNoLocale(SM.direction, "bidirectional")
        .addStringNoLocale(DCTERMS.creator, "김민수")
        .addStringNoLocale(DCTERMS.creator, "이지은")
        .addIri(SM.cardsDocument, CARDS_DOC)
        .addIri(SM.reviewsDocument, REVIEWS_DOC)
        .addInteger(SM.formatVersion, 2),
    );
    expect([...toDeck(thing)!.authors].sort()).toEqual(["김민수", "이지은"].sort());
  });

  it("rejects a deck without a title, and a format-2 deck without a direction", () => {
    expect(
      toDeck(
        deckThing((t) =>
          t
            .addIri(RDF.type, SM.Deck)
            .addIri(SM.cardsDocument, CARDS_DOC)
            .addIri(SM.reviewsDocument, REVIEWS_DOC),
        ),
      ),
    ).toBeNull();
    expect(
      toDeck(
        deckThing((t) =>
          t
            .addIri(RDF.type, SM.Deck)
            .addStringNoLocale(DCTERMS.title, "No direction")
            .addIri(SM.cardsDocument, CARDS_DOC)
            .addIri(SM.reviewsDocument, REVIEWS_DOC)
            .addInteger(SM.formatVersion, 2),
        ),
      ),
    ).toBeNull();
  });

  it("rejects subjects that are not sm:Deck", () => {
    expect(toDeck(deckThing((t) => t.addIri(RDF.type, SM.Card)))).toBeNull();
  });

  it("rejects decks without document links", () => {
    expect(
      toDeck(
        deckThing((t) =>
          t
            .addIri(RDF.type, SM.Deck)
            .addStringNoLocale(DCTERMS.title, "A")
            .addIri(SM.cardsDocument, CARDS_DOC),
        ),
      ),
    ).toBeNull();
    expect(
      toDeck(
        deckThing((t) =>
          t
            .addIri(RDF.type, SM.Deck)
            .addStringNoLocale(DCTERMS.title, "A")
            .addIri(SM.reviewsDocument, REVIEWS_DOC),
        ),
      ),
    ).toBeNull();
  });
});

describe("toDecks over many decks and agents", () => {
  // Thousands of decks, mapped many times over: seconds on a laptop, and many
  // times that in CI, coverage on and every package's tests run at once. What
  // is held to is the ratio, of CPU time; the clock only stops a test that never ends.
  it("takes time that grows with them, not their product (GHSA-hcrw-cr33-jg78)", {
    timeout: 180_000,
  }, () => {
    const ratio = growth(
      (count) => {
        const subjects = Array.from({ length: count }, (_, i) => [
          buildThing(createThing({ url: `${CATALOG}#deck-${i}` }))
            .addIri(RDF.type, SM.Deck)
            .addStringNoLocale(DCTERMS.title, "t")
            .addIri(SM.cardsDocument, CARDS_DOC)
            .addIri(SM.reviewsDocument, REVIEWS_DOC)
            .build(),
          buildThing(createThing({ url: `${CATALOG}#agent-${i}` }))
            .addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent")
            .addStringNoLocale("http://xmlns.com/foaf/0.1/name", `n${i}`)
            .build(),
        ]).flat();
        const catalog = setThings(datasetFrom(CATALOG), subjects);
        return () => toDecks(catalog, CATALOG);
      },
      1000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("toCard", () => {
  /** The card a subject is, alone in its document. */
  const cardOf = (thing: NamedSubject) => toCard(thing, datasetFrom(CARDS_DOC));

  function cardThing(build: (t: SubjectBuilder) => SubjectBuilder) {
    return build(buildThing(createThing({ url: `${CARDS_DOC}#card-1` }))).build();
  }

  it("maps a well-formed card subject", () => {
    const thing = cardThing((t) =>
      t
        .addIri(RDF.type, SM.Card)
        .addStringNoLocale(SM.front, "水")
        .addStringNoLocale(SM.back, "water (mizu)")
        .addDatetime(DCTERMS.created, new Date("2026-09-21T10:00:00.000Z")),
    );
    expect(cardOf(thing)).toEqual({
      id: "card-1",
      url: `${CARDS_DOC}#card-1`,
      front: { "": "水" },
      back: { "": "water (mizu)" },
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
    });
  });

  it("tolerates a missing created date; a missing version is the first", () => {
    const thing = cardThing((t) =>
      t.addIri(RDF.type, SM.Card).addStringNoLocale(SM.front, "f").addStringNoLocale(SM.back, "b"),
    );
    expect(cardOf(thing)!.createdAt).toBe("");
    expect(cardOf(thing)!.formatVersion).toBe(1);
  });

  it("reads a stored format version", () => {
    const thing = cardThing((t) =>
      t
        .addIri(RDF.type, SM.Card)
        .addStringNoLocale(SM.front, "f")
        .addStringNoLocale(SM.back, "b")
        .addInteger(SM.formatVersion, 2),
    );
    expect(cardOf(thing)!.formatVersion).toBe(2);
  });

  it("reads what a card is about, sorted, whatever format it states", () => {
    const about = (version: number) =>
      cardOf(
        cardThing((t) =>
          t
            .addIri(RDF.type, SM.Card)
            .addStringNoLocale(SM.front, "Sweden")
            .addStringNoLocale(SM.back, "Stockholm")
            .addUrl(DCTERMS.subject, "http://www.wikidata.org/entity/Q34")
            .addUrl(DCTERMS.subject, "http://www.wikidata.org/entity/Q1754")
            .addInteger(SM.formatVersion, version),
        ),
      )!.subjects;
    const subjects = ["http://www.wikidata.org/entity/Q1754", "http://www.wikidata.org/entity/Q34"];
    expect(about(6)).toEqual(subjects);
    expect(about(7)).toEqual(subjects);
  });

  it("reads pictures on either side, with or without text", () => {
    const thing = cardThing((t) =>
      t
        .addIri(RDF.type, SM.Card)
        .addIri(SM.frontImage, FLAG)
        .addStringNoLocale(SM.back, "Afghanistan")
        .addIri(SM.backImage, MAP)
        .addInteger(SM.formatVersion, 2),
    );
    expect(cardOf(thing)).toMatchObject({
      front: {},
      back: { "": "Afghanistan" },
      frontImageUrl: FLAG,
      backImageUrl: MAP,
      formatVersion: 2,
    });
  });

  it("ignores a picture given as a string literal instead of an IRI", () => {
    expect(
      cardOf(
        cardThing((t) =>
          t
            .addIri(RDF.type, SM.Card)
            .addStringNoLocale(SM.frontImage, FLAG)
            .addStringNoLocale(SM.back, "Afghanistan"),
        ),
      ),
    ).toBeNull();
    expect(
      cardOf(
        cardThing((t) =>
          t
            .addIri(RDF.type, SM.Card)
            .addStringNoLocale(SM.front, "f")
            .addStringNoLocale(SM.back, "b")
            .addStringNoLocale(SM.backImage, MAP),
        ),
      ),
    ).not.toHaveProperty("backImageUrl");
  });

  it("rejects subjects that are not sm:Card", () => {
    expect(cardOf(cardThing((t) => t.addIri(RDF.type, SM.Deck)))).toBeNull();
  });

  it("rejects cards with a side that has neither text nor a picture", () => {
    expect(
      cardOf(cardThing((t) => t.addIri(RDF.type, SM.Card).addStringNoLocale(SM.front, "f"))),
    ).toBeNull();
    expect(
      cardOf(cardThing((t) => t.addIri(RDF.type, SM.Card).addStringNoLocale(SM.back, "b"))),
    ).toBeNull();
    expect(
      cardOf(
        cardThing((t) =>
          t.addIri(RDF.type, SM.Card).addStringNoLocale(SM.front, "").addIri(SM.backImage, MAP),
        ),
      ),
    ).toBeNull();
  });

  it("reads the distractors a card names from its document, by id, leaving out one that is missing or does not fit, and marking a retired one", () => {
    const distractor = (id: string, build: (t: SubjectBuilder) => SubjectBuilder) =>
      build(
        buildThing(createThing({ url: `${CARDS_DOC}#${id}` })).addIri(RDF.type, SM.Distractor),
      ).build();
    const card = cardThing((t) =>
      t
        .addIri(RDF.type, SM.Card)
        .addInteger(SM.formatVersion, 5)
        .addStringWithLocale(SM.front, "What can an IRI name?", "en")
        .addStringWithLocale(SM.back, "Anything", "en")
        .addIri(SM.distractor, `${CARDS_DOC}#d2`)
        .addIri(SM.distractor, `${CARDS_DOC}#d1`)
        .addIri(SM.distractor, `${CARDS_DOC}#gone`)
        .addIri(SM.distractor, `${CARDS_DOC}#empty`)
        .addIri(SM.distractor, `${CARDS_DOC}#retired`),
    );
    const dataset = [
      card,
      distractor("d1", (t) =>
        t
          .addStringWithLocale(SM.distractorText, "Only web pages", "en")
          .addStringWithLocale(SM.distractorNote, "A URL is one kind of IRI.", "en"),
      ),
      distractor("d2", (t) => t.addStringNoLocale(SM.distractorText, "404")),
      distractor("empty", (t) => t),
      distractor("retired", (t) =>
        t.addStringNoLocale(SM.distractorText, "500").addBoolean(OWL_DEPRECATED, true),
      ),
    ].reduce((current, thing) => setThing(current, thing), datasetFrom(CARDS_DOC));
    expect(toCard(card, dataset)!.distractors).toEqual([
      { id: "d1", text: { en: "Only web pages" }, note: { en: "A URL is one kind of IRI." } },
      { id: "d2", text: { "": "404" } },
      { id: "retired", text: { "": "500" }, retired: true },
    ]);
    expect(toCards(dataset)).toHaveLength(1);
    expect(toDistractor(card)).toBeNull();
  });
});

/** The document with a card's distractors written (writeDistractors), with what that gives. */
function withDistractors(
  dataset: Dataset,
  documentUrl: string,
  distractors: readonly Distractor[],
  before: readonly string[],
) {
  const edit = editOf(dataset);
  const written = writeDistractors(edit, documentUrl, distractors, before);
  return { ...written, dataset: edit.done() };
}

describe("writeDistractors", () => {
  it("writes a card's distractors beside it and names those it named before and no longer does", () => {
    const before = [`${CARDS_DOC}#d1`, `${CARDS_DOC}#old`];
    const first = withDistractors(
      datasetFrom(CARDS_DOC),
      CARDS_DOC,
      [
        { id: "d1", text: { en: "One" } },
        { id: "old", text: { en: "Old" } },
      ],
      [],
    );
    expect(first.subjects).toEqual(before);
    const kept = setThing(
      first.dataset,
      buildThing(getThing(first.dataset, before[0])!)
        .addStringNoLocale("https://example.org/other", "kept")
        .build(),
    );
    const second = withDistractors(
      kept,
      CARDS_DOC,
      [{ id: "d1", text: { en: "One, again" }, note: { sv: "Fel." } }],
      before,
    );
    expect(second.subjects).toEqual([before[0]]);
    expect(second.dropped).toEqual([before[1]]);
    expect(getThing(second.dataset, before[1])).not.toBeNull();
    expect(
      getThing(withoutUnnamedDistractors(second.dataset, second.dropped), before[1]),
    ).toBeNull();
    const d1 = getThing(second.dataset, before[0])!;
    expect(toDistractor(d1)).toEqual({
      id: "d1",
      text: { en: "One, again" },
      note: { sv: "Fel." },
    });
    expect(getInteger(d1, SM.formatVersion)).toBe(1);
    expect(getUrlAll(d1, RDF.type)).toEqual([SM.Distractor, "https://schema.org/Answer"]);
    expect(getStringNoLocale(d1, "https://example.org/other")).toBe("kept");
  });

  it("removes a dropped distractor only when no card names it", () => {
    const url = `${CARDS_DOC}#d1`;
    const written = withDistractors(
      datasetFrom(CARDS_DOC),
      CARDS_DOC,
      [{ id: "d1", text: { en: "One" } }],
      [],
    );
    const named = setThing(
      written.dataset,
      buildThing(createThing({ url: `${CARDS_DOC}#other` }))
        .addUrl(SM.distractor, url)
        .build(),
    );
    expect(withoutUnnamedDistractors(named, [])).toBe(named);
    expect(getThing(withoutUnnamedDistractors(named, [url]), url)).not.toBeNull();
  });

  it("removes only a distractor, never a card or another app's subject, that no card names", () => {
    const typed = (id: string, ...types: string[]) =>
      types
        .reduce(
          (thing, type) => thing.addUrl(RDF.type, type),
          buildThing(createThing({ url: `${CARDS_DOC}#${id}` })),
        )
        .addStringNoLocale(SM.front, id)
        .build();
    const urls = ["card", "mixed", "other"].map((id) => `${CARDS_DOC}#${id}`);
    const dataset = [
      typed("card", SM.Card),
      typed("mixed", SM.Card, SM.Distractor),
      typed("other", "https://example.org/Thing"),
    ].reduce((current, thing) => setThing(current, thing), datasetFrom(CARDS_DOC));
    const after = withoutUnnamedDistractors(dataset, [...urls, `${CARDS_DOC}#missing`]);
    for (const url of urls) expect(getThing(after, url)).not.toBeNull();
  });

  it("retires a distractor, and restores it, keeping it named", () => {
    const url = `${CARDS_DOC}#d1`;
    const retired = withDistractors(
      datasetFrom(CARDS_DOC),
      CARDS_DOC,
      [{ id: "d1", text: { en: "One" }, retired: true }],
      [],
    );
    expect(getBoolean(getThing(retired.dataset, url)!, OWL_DEPRECATED)).toBe(true);
    expect(toDistractor(getThing(retired.dataset, url)!)).toEqual({
      id: "d1",
      text: { en: "One" },
      retired: true,
    });
    const restored = withDistractors(
      retired.dataset,
      CARDS_DOC,
      [{ id: "d1", text: { en: "One" } }],
      [url],
    );
    expect(getBoolean(getThing(restored.dataset, url)!, OWL_DEPRECATED)).toBeNull();
    expect(toDistractor(getThing(restored.dataset, url)!)).toEqual({
      id: "d1",
      text: { en: "One" },
    });
  });
});

describe("the catalog node", () => {
  const catalog = {
    title: "Main",
    description: "My decks.",
    publisher: { webId: "https://alice.example/profile/card#me", name: "Alice" },
  };
  const deck: Deck = {
    id: "deck-1",
    url: `${CATALOG}#deck-1`,
    title: { en: "Capitals" },
    cardsDocumentUrl: CARDS_DOC,
    reviewsDocumentUrl: REVIEWS_DOC,
    createdAt: "",
    formatVersion: 3,
    direction: "front-to-back",
    authors: [],
  };
  const DATASET = "http://www.w3.org/ns/dcat#dataset";

  it("is written with the document's decks as datasets and its publisher described beside it, and read back", () => {
    const written = withCatalog(withDeck(datasetFrom(CATALOG), deck), CATALOG, catalog);
    const node = getThing(written, `${CATALOG}#catalog`)!;
    expect(getUrlAll(node, DATASET)).toEqual([deck.url]);
    expect(
      getStringNoLocale(
        getThing(written, catalog.publisher.webId)!,
        "http://xmlns.com/foaf/0.1/name",
      ),
    ).toBe("Alice");
    expect(toCatalog(written, CATALOG)).toEqual(catalog);
  });

  it("keeps listing exactly the decks as they are added and removed", () => {
    let dataset = withCatalog(datasetFrom(CATALOG), CATALOG, catalog);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DATASET)).toEqual([]);
    const other = { ...deck, id: "deck-2", url: `${CATALOG}#deck-2` };
    dataset = withDeck(withDeck(dataset, deck), other);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DATASET)).toEqual([
      deck.url,
      other.url,
    ]);
    dataset = withoutDeck(dataset, deck);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DATASET)).toEqual([other.url]);
  });

  it("writes many decks at once as one at a time, each listed once", () => {
    const dataset = withCatalog(datasetFrom(CATALOG), CATALOG, catalog);
    const other = { ...deck, id: "deck-2", url: `${CATALOG}#deck-2` };
    const once = withDecks(dataset, [deck, other, deck]);
    expect(getUrlAll(getThing(once, `${CATALOG}#catalog`)!, DATASET)).toEqual([
      deck.url,
      other.url,
    ]);
    expect(toDecks(once, CATALOG)).toEqual(
      toDecks(withDeck(withDeck(dataset, deck), other), CATALOG),
    );
  });

  it("keeps the datasets another app listed through every deck save, removal and catalog write", () => {
    const FOREIGN = "https://pod.example/recipes/index.ttl#cookbook";
    const LOCAL = `${CATALOG}#their-dataset`;
    let dataset = withCatalog(datasetFrom(CATALOG), CATALOG, catalog);
    dataset = setThing(
      dataset,
      buildThing(getThing(dataset, `${CATALOG}#catalog`)!)
        .addIri(DATASET, FOREIGN)
        .addIri(DATASET, LOCAL)
        .build(),
    );
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: LOCAL }))
        .addIri(RDF.type, DCAT.Dataset)
        .build(),
    );
    const listed = () => [...getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DATASET)].sort();

    dataset = withDeck(dataset, deck);
    expect(listed()).toEqual([FOREIGN, LOCAL, deck.url].sort());
    dataset = withDeck(dataset, { ...deck, title: { en: "Renamed" } });
    expect(listed()).toEqual([FOREIGN, LOCAL, deck.url].sort());
    dataset = withCatalog(dataset, CATALOG, { ...catalog, title: "Renamed" });
    expect(listed()).toEqual([FOREIGN, LOCAL, deck.url].sort());
    dataset = withoutDeck(dataset, deck);
    expect(listed()).toEqual([FOREIGN, LOCAL].sort());
  });

  it("drops, when written whole, only a link to a subject of its own document that is no dataset, never one another app described there", () => {
    let dataset = withCatalog(withDeck(datasetFrom(CATALOG), deck), CATALOG, catalog);
    dataset = setThing(
      dataset,
      buildThing(getThing(dataset, `${CATALOG}#catalog`)!)
        .addIri(DATASET, `${CATALOG}#deck-gone`)
        .addIri(DATASET, `${CATALOG}#recipes`)
        .build(),
    );
    // Another app's dataset, described beside the decks with a class of its own.
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${CATALOG}#recipes` }))
        .addIri(RDF.type, "https://schema.org/Dataset")
        .build(),
    );
    // A deck save leaves it…
    dataset = withDeck(dataset, deck);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DATASET)).toContain(
      `${CATALOG}#deck-gone`,
    );
    // …the catalog, written whole and checked, cannot keep it.
    dataset = withCatalog(dataset, CATALOG, catalog);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DATASET)).toEqual([
      deck.url,
      `${CATALOG}#recipes`,
    ]);
  });

  it("names its publisher by the WebID when no agent node describes them", () => {
    const written = withCatalog(datasetFrom(CATALOG), CATALOG, catalog);
    const withoutAgent = setThing(
      written,
      buildThing(getThing(written, catalog.publisher.webId)!).removeAll(RDF.type).build(),
    );
    expect(toCatalog(withoutAgent, CATALOG)?.publisher.name).toBe(catalog.publisher.webId);
  });

  it("types its license a license document, as DCAT-AP asks, and lets go of one it no longer states", () => {
    const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
    const BY = "https://creativecommons.org/licenses/by/4.0/";
    const typeOf = (dataset: Dataset, url: string) => {
      const node = getThing(dataset, url);
      return node === null ? null : getUrlAll(node, RDF.type);
    };
    let dataset = withCatalog(datasetFrom(CATALOG), CATALOG, { ...catalog, license: CC0 });
    expect(typeOf(dataset, CC0)).toEqual([DCTERMS.LicenseDocument]);
    expect(toCatalog(dataset, CATALOG)).toEqual({ ...catalog, license: CC0 });
    // Written again, it is typed once.
    dataset = withCatalog(dataset, CATALOG, { ...catalog, license: CC0 });
    expect(typeOf(dataset, CC0)).toEqual([DCTERMS.LicenseDocument]);

    // Another license: the old one goes, having nothing else said of it.
    dataset = withCatalog(dataset, CATALOG, { ...catalog, license: BY });
    expect(typeOf(dataset, CC0)).toBeNull();
    expect(typeOf(dataset, BY)).toEqual([DCTERMS.LicenseDocument]);

    // One another app says more of, or that a deck names, keeps that.
    dataset = setThing(
      dataset,
      buildThing(getThing(dataset, BY)!).addStringNoLocale(DCTERMS.title, "CC BY").build(),
    );
    dataset = withCatalog(dataset, CATALOG, catalog);
    expect(typeOf(dataset, BY)).toEqual([]);
    expect(getStringNoLocale(getThing(dataset, BY)!, DCTERMS.title)).toBe("CC BY");
    dataset = withCatalog(withDeck(dataset, { ...deck, license: CC0 }), CATALOG, {
      ...catalog,
      license: CC0,
    });
    dataset = withCatalog(dataset, CATALOG, catalog);
    expect(typeOf(dataset, CC0)).toEqual([DCTERMS.LicenseDocument]);

    // One another app stated without describing it: nothing to let go of.
    dataset = removeThings(withCatalog(dataset, CATALOG, { ...catalog, license: BY }), [BY]);
    dataset = withCatalog(dataset, CATALOG, catalog);
    expect(typeOf(dataset, BY)).toBeNull();
    expect(toCatalog(dataset, CATALOG)).toEqual(catalog);
  });

  describe("over many old licenses", () => {
    const LICENSE = "https://creativecommons.org/licenses/by/4.0/";
    // A document whose catalog states `count` licenses besides its own,
    // each typed a license document, every other one with more said of
    // it, as another app's write could leave it.
    const planted = (count: number) => {
      const licenses = Array.from({ length: count }, (_, i) => `${CATALOG}#license-${i}`);
      const written = withCatalog(datasetFrom(CATALOG), CATALOG, { ...catalog, license: LICENSE });
      const node = licenses.reduce(
        (builder, license) => builder.addIri(DCTERMS.license, license),
        buildThing(getThing(written, `${CATALOG}#catalog`)!),
      );
      return setThings(written, [
        node.build(),
        ...licenses.map((license, i) => {
          const typed = buildThing(createThing({ url: license })).addIri(
            RDF.type,
            DCTERMS.LicenseDocument,
          );
          return (i % 2 === 0 ? typed : typed.addStringNoLocale(DCTERMS.title, `L${i}`)).build();
        }),
      ]);
    };

    // withCatalog as it was before GHSA-qcxj-gv75-c7wv, word for word:
    // one edit of the whole document per license it no longer states.
    function withCatalogOneLicenseAtATime(
      dataset: Dataset,
      documentUrl: string,
      catalog: Catalog,
    ): Dataset {
      const url = `${documentUrl}#catalog`;
      const existing = getThing(dataset, url);
      const before = existing === null ? [] : getUrlAll(existing, DCTERMS.license);
      const foreign = foreignSubjects(dataset);
      const isTyped = (link: string, type: string) => {
        const thing = getThing(dataset, link);
        return thing !== null && getUrlAll(thing, RDF.type).includes(type);
      };
      const deckUrls = getThingAll(dataset)
        .filter((thing) => getUrlAll(thing, RDF.type).includes(SM.Deck))
        .map(asUrl);
      const kept = (existing === null ? [] : getUrlAll(existing, DCAT.dataset)).filter(
        (link) =>
          documentUrlOf(link) !== documentUrl || isTyped(link, DCAT.Dataset) || foreign.has(link),
      );
      const datasets = [...new Set([...kept, ...deckUrls])];
      let updated = setThing(
        dataset,
        recordThing(url, CATALOG_V1, catalogToRecord(catalog, datasets), existing),
      );
      const publisher = catalog.publisher.webId;
      updated = setThing(
        updated,
        recordThing(publisher, AGENT_V1, publisherToRecord(catalog), getThing(updated, publisher)),
      );
      const named = new Set(
        getThingAll(updated).flatMap((thing) => getUrlAll(thing, DCTERMS.license)),
      );
      for (const license of before.filter(
        (license) => license !== catalog.license && !named.has(license),
      )) {
        const node = getThing(updated, license);
        if (node === null) continue;
        const untyped = buildThing(node).removeUrl(RDF.type, DCTERMS.LicenseDocument).build();
        updated =
          getPropertyAll(untyped).length === 0
            ? removeThings(updated, [license])
            : setThing(updated, untyped);
      }
      if (catalog.license !== undefined) {
        const node = getThing(updated, catalog.license) ?? createThing({ url: catalog.license });
        if (!getUrlAll(node, RDF.type).includes(DCTERMS.LicenseDocument)) {
          updated = setThing(
            updated,
            buildThing(node).addIri(RDF.type, DCTERMS.LicenseDocument).build(),
          );
        }
      }
      return updated;
    }

    // A dataset's statements and the changes a save sends, as sorted lines.
    const stateOf = (dataset: Dataset) => {
      const lines = (quads: Iterable<Quad>) =>
        [...quads]
          .map(
            (quad) =>
              `${quad.subject.value} ${quad.predicate.value} ${quad.object.termType} ${quad.object.value}`,
          )
          .sort();
      const changes = changesOf(dataset);
      return {
        quads: lines(toRdfJsDataset(dataset)),
        additions: lines(changes?.additions ?? []),
        deletions: lines(changes?.deletions ?? []),
      };
    };

    it("lets go of each as it let go of one at a time, and saves the same changes", () => {
      const dataset = planted(4);
      // A license a deck names stays one; one without a subject is passed over.
      const kept = withDeck(dataset, { ...deck, license: `${CATALOG}#license-0` });
      const written = setThing(
        kept,
        buildThing(getThing(kept, `${CATALOG}#catalog`)!)
          .addIri(DCTERMS.license, `${CATALOG}#nowhere`)
          .build(),
      );
      // Read back as the pod gives it, so the changes are the save's own.
      const before = withQuads(datasetFrom(CATALOG), toRdfJsDataset(written));
      const after = withCatalog(before, CATALOG, catalog);
      const reference = withCatalogOneLicenseAtATime(before, CATALOG, catalog);
      expect(stateOf(after)).toEqual(stateOf(reference));
      expect(stateOf(after).deletions).not.toEqual([]);
      expect(getThing(after, LICENSE)).toBeNull();
      expect(getThing(after, `${CATALOG}#license-2`)).toBeNull();
      expect(getUrlAll(getThing(after, `${CATALOG}#license-0`)!, RDF.type)).toEqual([
        DCTERMS.LicenseDocument,
      ]);
      expect(getUrlAll(getThing(after, `${CATALOG}#license-1`)!, RDF.type)).toEqual([]);
      expect(getStringNoLocale(getThing(after, `${CATALOG}#license-3`)!, DCTERMS.title)).toBe("L3");
      expect(toCatalog(after, CATALOG)).toEqual(catalog);
    });

    it("lets go of them in time that grows with them, not their square (GHSA-qcxj-gv75-c7wv)", () => {
      // Eight times the licenses must take less than four times as long
      // as an eighth of them done eight times over (testing.md): an edit
      // of the whole document per license would take about eight times.
      const ratio = growth(
        (count) => {
          const dataset = planted(count);
          return () => withCatalog(dataset, CATALOG, catalog);
        },
        500,
        8,
      );
      expect(ratio).toBeLessThan(4);
    });
  });

  it("is absent from a document without one, or with one that does not fit its shape", () => {
    expect(toCatalog(datasetFrom(CATALOG), CATALOG)).toBeNull();
    const broken = setThing(
      datasetFrom(CATALOG),
      buildThing(createThing({ url: `${CATALOG}#catalog` }))
        .addIri(RDF.type, "http://www.w3.org/ns/dcat#Catalog")
        .build(),
    );
    expect(toCatalog(broken, CATALOG)).toBeNull();
  });
});

describe("the arrangement's triples (deck groups)", () => {
  const catalog = {
    title: "Main",
    description: "My decks.",
    publisher: { webId: "https://alice.example/profile/card#me", name: "Alice" },
  };
  const deck: Deck = {
    id: "deck-1",
    url: `${CATALOG}#deck-1`,
    title: { en: "Capitals" },
    cardsDocumentUrl: CARDS_DOC,
    reviewsDocumentUrl: REVIEWS_DOC,
    createdAt: "",
    formatVersion: 3,
    direction: "front-to-back",
    authors: [],
  };
  const other = { ...deck, id: "deck-2", url: `${CATALOG}#deck-2` };
  const GROUP = `${CATALOG}#group-1`;

  /** A catalog document of two decks, the first in a group with a position, the group listed by the catalog. */
  function arranged() {
    let dataset = withCatalog(
      withDeck(withDeck(datasetFrom(CATALOG), deck), other),
      CATALOG,
      catalog,
    );
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: GROUP }))
        .addIri(RDF.type, SM.DeckGroup)
        .addIri(DCAT.dataset, deck.url)
        .addIri(DCAT.dataset, other.url)
        .build(),
    );
    dataset = setThing(
      dataset,
      buildThing(getThing(dataset, deck.url)!).addInteger(SM.position, 3).build(),
    );
    return setThing(
      dataset,
      buildThing(getThing(dataset, `${CATALOG}#catalog`)!)
        .addIri(DCAT.catalog, GROUP)
        .build(),
    );
  }

  it("survive a deck's rewrite (rename, switch, upgrade) and the catalog's", () => {
    let dataset = withDeck(arranged(), { ...deck, title: { en: "Renamed" }, formatVersion: 6 });
    dataset = withCatalog(dataset, CATALOG, { ...catalog, title: "Renamed" });
    expect(getInteger(getThing(dataset, deck.url)!, SM.position)).toBe(3);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DCAT.catalog)).toEqual([GROUP]);
  });

  it("lose a removed deck from every group that listed it, the rest left as they are", () => {
    const dataset = withoutDeck(arranged(), deck);
    expect(getUrlAll(getThing(dataset, GROUP)!, DCAT.dataset)).toEqual([other.url]);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DCAT.catalog)).toEqual([GROUP]);
    // A group that did not list it is not touched.
    expect(withoutDeck(dataset, deck)).toEqual(dataset);
  });
});

describe("the agents of a catalog's decks", () => {
  const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";
  const FOAF_MBOX = "http://xmlns.com/foaf/0.1/mbox";
  const SLUG = `${CATALOG}#agent-jane-doe-jane-example-org`;
  const deckOf = (id: string, authors: string[]): Deck => ({
    id,
    url: `${CATALOG}#${id}`,
    title: { en: id },
    cardsDocumentUrl: `https://pod.example/solid-memo/a/decks/${id}.ttl`,
    reviewsDocumentUrl: `https://pod.example/solid-memo/a/reviews/${id}.ttl`,
    createdAt: "",
    formatVersion: 6,
    direction: "front-to-back",
    authors,
  });
  const authorsOf = (dataset: Dataset) =>
    Object.fromEntries(toDecks(dataset, CATALOG).map((deck) => [deck.id, deck.authors]));
  // Four authors the slug of agentUrlOf folds to the same node.
  const LOOK_ALIKES = [
    "Jane Doe <jane@exämple.org>",
    "Jane Doe <jane.example@org>",
    "Jane Doe (jane example org)",
  ];

  it.each(LOOK_ALIKES)(
    "keep another deck's author when a deck by %s is added, and when it is removed",
    (other) => {
      const a = deckOf("deck-1", ["Jane Doe <jane@example.org>"]);
      const b = deckOf("deck-2", [other]);
      const withA = withDeck(datasetFrom(CATALOG), a);
      const withBoth = withDeck(withA, b);
      expect(authorsOf(withBoth)).toEqual({ "deck-1": a.authors, "deck-2": b.authors });
      expect(getStringNoLocale(getThing(withBoth, SLUG)!, FOAF_NAME)).toBe("Jane Doe");
      expect(getUrlAll(getThing(withBoth, SLUG)!, FOAF_MBOX)).toEqual(["mailto:jane@example.org"]);
      const [creator] = getUrlAll(getThing(withBoth, b.url)!, DCTERMS.creator);
      expect(creator).toMatch(new RegExp(`^${SLUG}-[0-9a-f]{6}$`));
      expect(deckSubjects(withBoth, b)).toEqual([b.url, `${b.url}-cards`, creator]);
      expect(deckSubjects(withBoth, a)).toEqual([a.url, `${a.url}-cards`, SLUG]);
      // Written again, each deck keeps its node.
      const again = withDeck(withDeck(withBoth, a), b);
      expect(getUrlAll(getThing(again, b.url)!, DCTERMS.creator)).toEqual([creator]);
      expect(getUrlAll(getThing(again, a.url)!, DCTERMS.creator)).toEqual([SLUG]);
      const removed = withoutDeck(withBoth, b);
      expect(authorsOf(removed)).toEqual({ "deck-1": a.authors });
      expect(getThing(removed, creator!)).toBeNull();
    },
  );

  it("keep the four authors that fold alike four agents, in one deck or in several", () => {
    const authors = ["Jane Doe <jane@example.org>", ...LOOK_ALIKES];
    const one = withDeck(datasetFrom(CATALOG), deckOf("deck-1", authors));
    expect(authorsOf(one)).toEqual({ "deck-1": authors });
    expect(new Set(getUrlAll(getThing(one, `${CATALOG}#deck-1`)!, DCTERMS.creator)).size).toBe(4);
    const several = withDecks(
      datasetFrom(CATALOG),
      authors.map((author, i) => deckOf(`deck-${i + 1}`, [author])),
    );
    expect(Object.values(authorsOf(several))).toEqual(authors.map((author) => [author]));
  });

  it("take the next node when the hashed one holds another author too", () => {
    const b = deckOf("deck-2", ["Jane Doe <jane@exämple.org>"]);
    const squatter = (url: string, name: string) =>
      buildThing(createThing({ url }))
        .addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent")
        .addStringNoLocale(FOAF_NAME, name)
        .build();
    const onSlug = setThing(datasetFrom(CATALOG), squatter(SLUG, "Someone"));
    const hashed = getUrlAll(getThing(withDeck(onSlug, b), b.url)!, DCTERMS.creator)[0]!;
    expect(hashed).toMatch(new RegExp(`^${SLUG}-[0-9a-f]{6}$`));
    const taken = setThing(onSlug, squatter(hashed, "Someone else"));
    const written = withDeck(taken, b);
    expect(getUrlAll(getThing(written, b.url)!, DCTERMS.creator)).toEqual([`${hashed}-2`]);
    expect(authorsOf(written)).toEqual({ "deck-2": b.authors });
  });

  it("write onto a node that says nothing an agent says, and not onto one that names someone outside the agent shape", () => {
    const deck = deckOf("deck-1", ["Jane Doe <jane@example.org>"]);
    const note = buildThing(createThing({ url: SLUG }))
      .addStringNoLocale("https://other.example/note", "kept")
      .build();
    const onNote = withDeck(setThing(datasetFrom(CATALOG), note), deck);
    expect(getUrlAll(getThing(onNote, deck.url)!, DCTERMS.creator)).toEqual([SLUG]);
    expect(getStringNoLocale(getThing(onNote, SLUG)!, "https://other.example/note")).toBe("kept");
    const untyped = buildThing(createThing({ url: SLUG }))
      .addStringNoLocale(FOAF_NAME, "Jane Doe")
      .build();
    const onUntyped = withDeck(setThing(datasetFrom(CATALOG), untyped), deck);
    const [creator] = getUrlAll(getThing(onUntyped, deck.url)!, DCTERMS.creator);
    expect(creator).toMatch(new RegExp(`^${SLUG}-[0-9a-f]{6}$`));
    expect(authorsOf(onUntyped)).toEqual({ "deck-1": deck.authors });
  });
});
