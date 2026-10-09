import { describe, expect, it } from "vitest";
import {
  buildThing,
  createThing,
  type ThingBuilder,
  type ThingPersisted,
} from "@inrupt/solid-client";
import { mockSolidDatasetFrom, setThing } from "@inrupt/solid-client";
import { getInteger, getThing, getUrlAll, getStringNoLocale } from "@inrupt/solid-client";
import { fragmentIdOf, toCard, toCards, toCatalog, toDeck, toDecks, toDistractor, withCatalog, withDeck, withDistractors, withoutDeck } from "./deckMapper";
import type { Deck } from "@solid-memo/domain/deck";
import { DCAT, DCTERMS, RDF, SM } from "../vocab";

const OWL_DEPRECATED = "http://www.w3.org/2002/07/owl#deprecated";

const CATALOG = "https://pod.example/solid-memo/a/catalog.ttl";
const CARDS_DOC = "https://pod.example/solid-memo/a/decks/deck-1.ttl";
const REVIEWS_DOC = "https://pod.example/solid-memo/a/reviews/deck-1.ttl";
const FLAG = "https://flagcdn.com/h80/af.png";
const MAP = "https://img.example/af-map.png";

describe("fragmentIdOf", () => {
  it("returns the fragment of a subject URL", () => {
    expect(fragmentIdOf(`${CATALOG}#deck-1`)).toBe("deck-1");
  });
});

describe("toDeck", () => {
  function deckThing(
    build: (t: ThingBuilder<ThingPersisted>) => ThingBuilder<ThingPersisted>,
  ) {
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
    const chapters = ["https://solid-memo.com/decks/solid/v1.ttl#ch-1", "https://solid-memo.com/decks/solid/v1.ttl#ch-2"];
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
    const rewritten = withDeck(setThing(mockSolidDatasetFrom(CATALOG), thing), { ...deck, title: { en: "Solid, renamed" } });
    expect(getUrlAll(getThing(rewritten, deck.url)!, SM.completedChapter)).toEqual(chapters);
    expect(toDecks(rewritten)[0]).toMatchObject({ title: { en: "Solid, renamed" }, completedChapters: chapters });
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
        .addIri("http://www.w3.org/ns/dcat#theme", "https://solid-memo.com/ns/vocab/topics.ttl#geography")
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
    const catalog = setThing(setThing(mockSolidDatasetFrom(CATALOG), deck), agent);
    expect(toDecks(catalog)).toEqual([
      expect.objectContaining({
        direction: "back-to-front",
        authors: ["Anton <anton@example.com>", `${CATALOG}#agent-gone`],
        themes: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"],
        keywords: { "": ["capitals"] },
        formatVersion: 3,
      }),
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
    expect(toDeck(thing)).toMatchObject({ direction: "bidirectional", createdAt: "", formatVersion: 2 });
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

describe("toCard", () => {
  /** The card a subject is, alone in its document. */
  const cardOf = (thing: ThingPersisted) => toCard(thing, mockSolidDatasetFrom(CARDS_DOC));

  function cardThing(
    build: (t: ThingBuilder<ThingPersisted>) => ThingBuilder<ThingPersisted>,
  ) {
    return build(
      buildThing(createThing({ url: `${CARDS_DOC}#card-1` })),
    ).build();
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
      t
        .addIri(RDF.type, SM.Card)
        .addStringNoLocale(SM.front, "f")
        .addStringNoLocale(SM.back, "b"),
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
      cardOf(
        cardThing((t) =>
          t.addIri(RDF.type, SM.Card).addStringNoLocale(SM.front, "f"),
        ),
      ),
    ).toBeNull();
    expect(
      cardOf(
        cardThing((t) =>
          t.addIri(RDF.type, SM.Card).addStringNoLocale(SM.back, "b"),
        ),
      ),
    ).toBeNull();
    expect(
      cardOf(
        cardThing((t) =>
          t
            .addIri(RDF.type, SM.Card)
            .addStringNoLocale(SM.front, "")
            .addIri(SM.backImage, MAP),
        ),
      ),
    ).toBeNull();
  });

  it("reads the distractors a card names from its document, by id, leaving out one that is missing, does not fit or is retired", () => {
    const distractor = (id: string, build: (t: ThingBuilder<ThingPersisted>) => ThingBuilder<ThingPersisted>) =>
      build(buildThing(createThing({ url: `${CARDS_DOC}#${id}` })).addIri(RDF.type, SM.Distractor)).build();
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
      distractor("d1", (t) => t.addStringWithLocale(SM.distractorText, "Only web pages", "en").addStringWithLocale(SM.distractorNote, "A URL is one kind of IRI.", "en")),
      distractor("d2", (t) => t.addStringNoLocale(SM.distractorText, "404")),
      distractor("empty", (t) => t),
      distractor("retired", (t) => t.addStringNoLocale(SM.distractorText, "500").addBoolean(OWL_DEPRECATED, true)),
    ].reduce((current, thing) => setThing(current, thing), mockSolidDatasetFrom(CARDS_DOC));
    expect(toCard(card, dataset)!.distractors).toEqual([
      { id: "d1", text: { en: "Only web pages" }, note: { en: "A URL is one kind of IRI." } },
      { id: "d2", text: { "": "404" } },
    ]);
    expect(toCards(dataset)).toHaveLength(1);
    expect(toDistractor(card)).toBeNull();
  });
});

describe("withDistractors", () => {
  it("writes a card's distractors beside it and removes those it named before and no longer does", () => {
    const before = [`${CARDS_DOC}#d1`, `${CARDS_DOC}#old`];
    const first = withDistractors(mockSolidDatasetFrom(CARDS_DOC), CARDS_DOC, [{ id: "d1", text: { en: "One" } }, { id: "old", text: { en: "Old" } }], []);
    expect(first.subjects).toEqual(before);
    const kept = setThing(first.dataset, buildThing(getThing(first.dataset, before[0])!).addStringNoLocale("https://example.org/other", "kept").build());
    const second = withDistractors(kept, CARDS_DOC, [{ id: "d1", text: { en: "One, again" }, note: { sv: "Fel." } }], before);
    expect(second.subjects).toEqual([before[0]]);
    expect(getThing(second.dataset, before[1])).toBeNull();
    const d1 = getThing(second.dataset, before[0])!;
    expect(toDistractor(d1)).toEqual({ id: "d1", text: { en: "One, again" }, note: { sv: "Fel." } });
    expect(getInteger(d1, SM.formatVersion)).toBe(1);
    expect(getUrlAll(d1, RDF.type)).toEqual([SM.Distractor, "https://schema.org/Answer"]);
    expect(getStringNoLocale(d1, "https://example.org/other")).toBe("kept");
  });
});

describe("the catalogue node", () => {
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
    const written = withCatalog(withDeck(mockSolidDatasetFrom(CATALOG), deck), CATALOG, catalog);
    const node = getThing(written, `${CATALOG}#catalog`)!;
    expect(getUrlAll(node, DATASET)).toEqual([deck.url]);
    expect(getStringNoLocale(getThing(written, catalog.publisher.webId)!, "http://xmlns.com/foaf/0.1/name")).toBe("Alice");
    expect(toCatalog(written, CATALOG)).toEqual(catalog);
  });

  it("keeps listing exactly the decks as they are added and removed", () => {
    let dataset = withCatalog(mockSolidDatasetFrom(CATALOG), CATALOG, catalog);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DATASET)).toEqual([]);
    const other = { ...deck, id: "deck-2", url: `${CATALOG}#deck-2` };
    dataset = withDeck(withDeck(dataset, deck), other);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DATASET)).toEqual([deck.url, other.url]);
    dataset = withoutDeck(dataset, deck);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DATASET)).toEqual([other.url]);
  });

  it("keeps the datasets another app listed through every deck save, removal and catalogue write", () => {
    const FOREIGN = "https://pod.example/recipes/index.ttl#cookbook";
    const LOCAL = `${CATALOG}#their-dataset`;
    let dataset = withCatalog(mockSolidDatasetFrom(CATALOG), CATALOG, catalog);
    dataset = setThing(
      dataset,
      buildThing(getThing(dataset, `${CATALOG}#catalog`)!).addIri(DATASET, FOREIGN).addIri(DATASET, LOCAL).build(),
    );
    dataset = setThing(dataset, buildThing(createThing({ url: LOCAL })).addIri(RDF.type, DCAT.Dataset).build());
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

  it("drops, when written whole, only a link to a subject of its own document that is no dataset", () => {
    let dataset = withCatalog(withDeck(mockSolidDatasetFrom(CATALOG), deck), CATALOG, catalog);
    dataset = setThing(
      dataset,
      buildThing(getThing(dataset, `${CATALOG}#catalog`)!).addIri(DATASET, `${CATALOG}#deck-gone`).build(),
    );
    // A deck save leaves it…
    dataset = withDeck(dataset, deck);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DATASET)).toContain(`${CATALOG}#deck-gone`);
    // …the catalogue, written whole and checked, cannot keep it.
    dataset = withCatalog(dataset, CATALOG, catalog);
    expect(getUrlAll(getThing(dataset, `${CATALOG}#catalog`)!, DATASET)).toEqual([deck.url]);
  });

  it("names its publisher by the WebID when no agent node describes them", () => {
    const written = withCatalog(mockSolidDatasetFrom(CATALOG), CATALOG, catalog);
    const withoutAgent = setThing(
      written,
      buildThing(getThing(written, catalog.publisher.webId)!).removeAll(RDF.type).build(),
    );
    expect(toCatalog(withoutAgent, CATALOG)?.publisher.name).toBe(catalog.publisher.webId);
  });

  it("is absent from a document without one, or with one that does not fit its shape", () => {
    expect(toCatalog(mockSolidDatasetFrom(CATALOG), CATALOG)).toBeNull();
    const broken = setThing(
      mockSolidDatasetFrom(CATALOG),
      buildThing(createThing({ url: `${CATALOG}#catalog` })).addIri(RDF.type, "http://www.w3.org/ns/dcat#Catalog").build(),
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

  /** A catalog document of two decks, the first in a group with a position, the group listed by the catalogue. */
  function arranged() {
    let dataset = withCatalog(withDeck(withDeck(mockSolidDatasetFrom(CATALOG), deck), other), CATALOG, catalog);
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: GROUP }))
        .addIri(RDF.type, SM.DeckGroup)
        .addIri(DCAT.dataset, deck.url)
        .addIri(DCAT.dataset, other.url)
        .build(),
    );
    dataset = setThing(dataset, buildThing(getThing(dataset, deck.url)!).addInteger(SM.position, 3).build());
    return setThing(dataset, buildThing(getThing(dataset, `${CATALOG}#catalog`)!).addIri(DCAT.catalog, GROUP).build());
  }

  it("survive a deck's rewrite (rename, switch, upgrade) and the catalogue's", () => {
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
