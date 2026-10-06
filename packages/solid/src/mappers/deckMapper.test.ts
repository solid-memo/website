import { describe, expect, it } from "vitest";
import {
  buildThing,
  createThing,
  type ThingBuilder,
  type ThingPersisted,
} from "@inrupt/solid-client";
import { mockSolidDatasetFrom, setThing } from "@inrupt/solid-client";
import { getThing, getUrlAll, getStringNoLocale } from "@inrupt/solid-client";
import { fragmentIdOf, toCard, toCatalog, toDeck, toDecks, withCatalog, withDeck, withoutDeck } from "./deckMapper";
import type { Deck } from "@solid-memo/domain/deck";
import { DCTERMS, RDF, SM } from "../vocab";

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
        .addIri(DCTERMS.source, "https://solid-memo.com/decks/capitals.ttl"),
    );
    expect(toDeck(thing)).toMatchObject({
      formatVersion: 1,
      authors: ["Anton Wiklund", "A friend"],
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      description: { en: "Capitals, from Wikipedia." },
      sourceUrl: "https://solid-memo.com/decks/capitals/v1",
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
    expect(toCard(thing)).toEqual({
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
    expect(toCard(thing)!.createdAt).toBe("");
    expect(toCard(thing)!.formatVersion).toBe(1);
  });

  it("reads a stored format version", () => {
    const thing = cardThing((t) =>
      t
        .addIri(RDF.type, SM.Card)
        .addStringNoLocale(SM.front, "f")
        .addStringNoLocale(SM.back, "b")
        .addInteger(SM.formatVersion, 2),
    );
    expect(toCard(thing)!.formatVersion).toBe(2);
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
    expect(toCard(thing)).toMatchObject({
      front: {},
      back: { "": "Afghanistan" },
      frontImageUrl: FLAG,
      backImageUrl: MAP,
      formatVersion: 2,
    });
  });

  it("ignores a picture given as a string literal instead of an IRI", () => {
    expect(
      toCard(
        cardThing((t) =>
          t
            .addIri(RDF.type, SM.Card)
            .addStringNoLocale(SM.frontImage, FLAG)
            .addStringNoLocale(SM.back, "Afghanistan"),
        ),
      ),
    ).toBeNull();
    expect(
      toCard(
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
    expect(toCard(cardThing((t) => t.addIri(RDF.type, SM.Deck)))).toBeNull();
  });

  it("rejects cards with a side that has neither text nor a picture", () => {
    expect(
      toCard(
        cardThing((t) =>
          t.addIri(RDF.type, SM.Card).addStringNoLocale(SM.front, "f"),
        ),
      ),
    ).toBeNull();
    expect(
      toCard(
        cardThing((t) =>
          t.addIri(RDF.type, SM.Card).addStringNoLocale(SM.back, "b"),
        ),
      ),
    ).toBeNull();
    expect(
      toCard(
        cardThing((t) =>
          t
            .addIri(RDF.type, SM.Card)
            .addStringNoLocale(SM.front, "")
            .addIri(SM.backImage, MAP),
        ),
      ),
    ).toBeNull();
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
