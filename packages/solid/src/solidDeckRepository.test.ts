import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  deleteSolidDataset,
  getBoolean,
  getDatetime,
  getInteger,
  getStringNoLocale,
  getStringWithLocale,
  getStringWithLocaleAll,
  getStringNoLocaleAll,
  getThing,
  getUrl,
  getUrlAll,
  mockSolidDatasetFrom,
  saveSolidDatasetAt,
  setThing,
  type SolidDataset,
} from "@inrupt/solid-client";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { getSolidDatasetOrNull } from "./datasets";
import { DCTERMS, PROV, RDF, SM } from "./vocab";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { LibraryDeckContent } from "@solid-memo/domain/library";

const OWL_DEPRECATED = "http://www.w3.org/2002/07/owl#deprecated";

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@inrupt/solid-client")>();
  return {
    ...actual,
    saveSolidDatasetAt: vi.fn(),
    deleteSolidDataset: vi.fn(),
  };
});
vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
}));

const INSTANCE = "https://pod.example/solid-memo/a/";
const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";
const DCAT_ACCESS_URL = "http://www.w3.org/ns/dcat#accessURL";
const CATALOG = `${INSTANCE}catalog.ttl`;
const FLAG = "https://flagcdn.com/h80/af.png";

const deck: Deck = {
  id: "deck-1",
  url: `${CATALOG}#deck-1`,
  title: { en: "Kanji N5" },
  cardsDocumentUrl: `${INSTANCE}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${INSTANCE}reviews/deck-1.ttl`,
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
  authors: [],
};

const card: Card = {
  id: "card-1",
  url: `${deck.cardsDocumentUrl}#card-1`,
  front: { "": "水" },
  back: { "": "water" },
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
};

function makeRepository(checkWrite?: Parameters<typeof createSolidDeckRepository>[0]["checkWrite"]) {
  return createSolidDeckRepository({
    fetch: vi.fn() as unknown as typeof globalThis.fetch,
    now: () => new Date("2026-09-21T10:00:00.000Z"),
    randomId: () => "fixed",
    ...(checkWrite === undefined ? {} : { checkWrite }),
  });
}

function catalogWithDeck() {
  return setThing(
    mockSolidDatasetFrom(CATALOG),
    buildThing(createThing({ url: deck.url }))
      .addIri(RDF.type, SM.Deck)
      .addStringNoLocale(DCTERMS.title, deck.title.en)
      .addIri(SM.cardsDocument, deck.cardsDocumentUrl)
      .addIri(SM.reviewsDocument, deck.reviewsDocumentUrl)
      .build(),
  );
}

beforeEach(() => {
  vi.mocked(getSolidDatasetOrNull).mockReset();
  vi.mocked(saveSolidDatasetAt).mockReset();
  vi.mocked(deleteSolidDataset).mockReset();
});

describe("listDecks", () => {
  it("returns an empty list when the catalog does not exist", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().listDecks(INSTANCE)).resolves.toEqual([]);
  });

  it("maps catalog subjects to decks", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    const decks = await makeRepository().listDecks(INSTANCE);
    expect(decks).toHaveLength(1);
    expect(decks[0].title.en).toBe("Kanji N5");
  });
});

describe("checked writes", () => {
  it("check the subjects each write touches before saving", async () => {
    const checkWrite = vi.fn(async () => undefined);
    const repository = makeRepository(checkWrite);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    const authored = { ...deck, authors: ["Anton"] };
    await repository.saveDeck(authored);
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [deck.url, `${deck.url}-cards`, `${CATALOG}#agent-anton`]);
    await repository.saveCatalog(INSTANCE, {
      title: "Main",
      description: "Mine.",
      publisher: { webId: "https://alice.example/profile/card#me", name: "Alice" },
    });
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [`${CATALOG}#catalog`, "https://alice.example/profile/card#me"]);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await repository.createDeck(INSTANCE, { en: "New" });
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [`${CATALOG}#deck-fixed`, `${CATALOG}#deck-fixed-cards`]);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(mockSolidDatasetFrom(deck.cardsDocumentUrl), buildThing(createThing({ url: card.url })).addIri(RDF.type, SM.Card).build()),
    );
    await repository.addCard(deck, { front: { "": "a" }, back: { "": "b" } });
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [`${deck.cardsDocumentUrl}#card-fixed`]);
    await repository.updateCard(deck, card, { front: { "": "a" }, back: { "": "b" } });
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [card.url]);
    await repository.saveCards(deck, [card]);
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [card.url]);
  });

  it("save nothing when the check refuses", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    const checkWrite = vi.fn(async () => {
      throw new Error("does not conform");
    });
    await expect(makeRepository(checkWrite).createDeck(INSTANCE, { en: "New" })).rejects.toThrow("does not conform");
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("applyCardChanges", () => {
  it("writes new and changed cards by id, keeping an existing card's creation time, and removes others, in one write", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        setThing(
          mockSolidDatasetFrom(deck.cardsDocumentUrl),
          buildThing(createThing({ url: `${deck.cardsDocumentUrl}#se` }))
            .addIri(RDF.type, SM.Card)
            .addStringNoLocale(SM.front, "Sweden")
            .addStringNoLocale(SM.back, "Stockholm?")
            .addDatetime(DCTERMS.created, new Date("2026-01-01T00:00:00.000Z"))
            .build(),
        ),
        buildThing(createThing({ url: `${deck.cardsDocumentUrl}#is` })).addIri(RDF.type, SM.Card).build(),
      ) as never,
    );
    await makeRepository().applyCardChanges(deck, {
      save: [
        { id: "se", front: { "": "Sweden" }, back: { "": "Stockholm" } },
        { id: "no", front: { "": "Norway" }, back: { "": "Oslo" } },
      ],
      remove: ["is"],
    });
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    const se = getThing(saved, `${deck.cardsDocumentUrl}#se`)!;
    expect(getStringNoLocale(se, SM.back)).toBe("Stockholm");
    expect(getDatetime(se, DCTERMS.created)?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(getDatetime(getThing(saved, `${deck.cardsDocumentUrl}#no`)!, DCTERMS.created)?.toISOString()).toBe(
      "2026-09-21T10:00:00.000Z",
    );
    expect(getThing(saved, `${deck.cardsDocumentUrl}#is`)).toBeNull();
  });

  it("retires a card and brings one back, stating owl:deprecated only on a retired card", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        mockSolidDatasetFrom(deck.cardsDocumentUrl),
        buildThing(createThing({ url: `${deck.cardsDocumentUrl}#yu` }))
          .addIri(RDF.type, SM.Card)
          .addStringNoLocale(SM.front, "Yugoslavia")
          .addStringNoLocale(SM.back, "Belgrade")
          .addBoolean(OWL_DEPRECATED, true)
          .build(),
      ) as never,
    );
    await makeRepository().applyCardChanges(deck, {
      save: [
        { id: "yu", front: { "": "Yugoslavia" }, back: { "": "Belgrade" } },
        { id: "se", front: { "": "Sweden" }, back: { "": "Stockholm" }, retired: true },
      ],
      remove: [],
    });
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getBoolean(getThing(saved, `${deck.cardsDocumentUrl}#yu`)!, OWL_DEPRECATED)).toBeNull();
    expect(getBoolean(getThing(saved, `${deck.cardsDocumentUrl}#se`)!, OWL_DEPRECATED)).toBe(true);
  });

  it("creates the cards document when there is none", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().applyCardChanges(deck, { save: [{ id: "no", front: { "": "Norway" }, back: { "": "Oslo" } }], remove: [] });
    expect(getThing(vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset, `${deck.cardsDocumentUrl}#no`)).not.toBeNull();
  });
});

describe("readCatalog and saveCatalog", () => {
  const catalog = {
    title: "Main",
    description: "My decks.",
    publisher: { webId: "https://alice.example/profile/card#me", name: "Alice" },
  };

  it("read no catalogue from an instance without a catalog document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().readCatalog(INSTANCE)).resolves.toBeNull();
  });

  it("write the catalogue into a new catalog document, and read it back", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().saveCatalog(INSTANCE, catalog);
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(CATALOG);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(saved as never);
    await expect(makeRepository().readCatalog(INSTANCE)).resolves.toEqual(catalog);
  });

  it("write the catalogue beside the decks of an existing catalog document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    await makeRepository().saveCatalog(INSTANCE, catalog);
    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(getThing(saved as SolidDataset, deck.url)).not.toBeNull();
    expect(getUrlAll(getThing(saved as SolidDataset, `${CATALOG}#catalog`)!, "http://www.w3.org/ns/dcat#dataset")).toEqual([deck.url]);
  });
});

describe("createDeck", () => {
  it("adds a deck subject to a fresh catalog and returns the deck", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);

    const created = await makeRepository().createDeck(INSTANCE, { en: "Kanji N5" });

    expect(created).toEqual({
      id: "deck-fixed",
      url: `${CATALOG}#deck-fixed`,
      title: { en: "Kanji N5" },
      cardsDocumentUrl: `${INSTANCE}decks/deck-fixed.ttl`,
      reviewsDocumentUrl: `${INSTANCE}reviews/deck-fixed.ttl`,
      direction: "front-to-back",
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 6,
      authors: [],
    });
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(CATALOG);
    const thing = getThing(saved as SolidDataset, created.url)!;
    expect(getStringWithLocale(thing, DCTERMS.title, "en")).toBe("Kanji N5");
    expect(getStringWithLocale(thing, DCTERMS.description, "en")).toBe("Flashcards: Kanji N5.");
    expect(getStringWithLocale(thing, DCTERMS.description, "sv")).toBe("Kortlek: Kanji N5.");
    expect(getInteger(thing, SM.formatVersion)).toBe(6);
    expect(getUrl(thing, SM.studyDirection)).toBe(SM.frontToBack);
    expect(getUrlAll(thing, DCTERMS.creator)).toEqual([]);
    expect(getUrl(thing, DCTERMS.license)).toBeNull();
    const distribution = getThing(saved as SolidDataset, `${created.url}-cards`)!;
    expect(getUrl(distribution, DCAT_ACCESS_URL)).toBe(created.cardsDocumentUrl);
  });

  it("appends to an existing catalog", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());

    await makeRepository().createDeck(INSTANCE, { en: "Second deck" });

    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(getThing(saved as SolidDataset, deck.url)).not.toBeNull();
    expect(
      getThing(saved as SolidDataset, `${CATALOG}#deck-fixed`),
    ).not.toBeNull();
  });
});

describe("importDeck", () => {
  const content: LibraryDeckContent = {
    url: "https://solid-memo.com/decks/capitals.ttl",
    title: { en: "Capitals" },
    formatVersion: 1,
    authors: ["Anton Wiklund", "A friend"],
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    description: { en: "Capitals, from Wikipedia." },
    direction: "bidirectional",
    version: "1",
    seriesUrl: "https://solid-memo.com/decks/index.ttl#capitals",
    themes: ["https://pod.solid-memo.com/vocab/topics#geography"],
    keywords: { en: ["capitals", "countries"], sv: ["huvudstäder"], "": ["legacy"] },
    cards: [
      { id: "sweden", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 },
      {
        id: "afghanistan",
        front: {},
        back: { "": "Afghanistan" },
        frontImageUrl: FLAG,
        formatVersion: 2,
      },
    ],
  };

  it("writes the cards document once, then the catalog entry with its source", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);

    const imported = await makeRepository().importDeck(INSTANCE, content);

    expect(imported).toEqual({
      id: "deck-fixed",
      url: `${CATALOG}#deck-fixed`,
      title: { en: "Capitals" },
      cardsDocumentUrl: `${INSTANCE}decks/deck-fixed.ttl`,
      reviewsDocumentUrl: `${INSTANCE}reviews/deck-fixed.ttl`,
      direction: "bidirectional",
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 6,
      authors: ["Anton Wiklund", "A friend"],
      license: content.license,
      description: content.description,
      sourceUrl: content.url,
      themes: content.themes,
      keywords: content.keywords,
    });
    const calls = vi.mocked(saveSolidDatasetAt).mock.calls;
    expect(calls.map((c) => c[0])).toEqual([
      imported.cardsDocumentUrl,
      CATALOG,
    ]);
    const cards = calls[0][1] as SolidDataset;
    const sweden = getThing(cards, `${imported.cardsDocumentUrl}#sweden`)!;
    expect(getStringNoLocale(sweden, SM.front)).toBe("Sweden");
    expect(getStringNoLocale(sweden, SM.back)).toBe("Stockholm");
    expect(getInteger(sweden, SM.formatVersion)).toBe(5);
    const afghanistan = getThing(
      cards,
      `${imported.cardsDocumentUrl}#afghanistan`,
    )!;
    expect(getStringNoLocale(afghanistan, SM.front)).toBeNull();
    expect(getUrl(afghanistan, SM.frontImage)).toBe(FLAG);
    expect(getStringNoLocale(afghanistan, SM.back)).toBe("Afghanistan");
    expect(getSolidDatasetOrNull).toHaveBeenCalledTimes(1);
    const entry = getThing(calls[1][1] as SolidDataset, imported.url)!;
    expect(getStringWithLocale(entry, DCTERMS.title, "en")).toBe("Capitals");
    expect(getUrl(entry, PROV.wasDerivedFrom)).toBe(content.url);
    expect(getUrl(entry, DCTERMS.source)).toBeNull();
    expect(getInteger(entry, SM.formatVersion)).toBe(6);
    expect(getUrl(entry, SM.studyDirection)).toBe(SM.bidirectional);
    expect(getUrlAll(entry, DCTERMS.creator)).toEqual([
      `${CATALOG}#agent-anton-wiklund`,
      `${CATALOG}#agent-a-friend`,
    ]);
    const anton = getThing(calls[1][1] as SolidDataset, `${CATALOG}#agent-anton-wiklund`)!;
    expect(getStringNoLocale(anton, FOAF_NAME)).toBe("Anton Wiklund");
    expect(getUrlAll(entry, "http://www.w3.org/ns/dcat#theme")).toEqual(content.themes);
    expect(getStringWithLocaleAll(entry, "http://www.w3.org/ns/dcat#keyword", "en")).toEqual(["capitals", "countries"]);
    expect(getStringWithLocaleAll(entry, "http://www.w3.org/ns/dcat#keyword", "sv")).toEqual(["huvudstäder"]);
    expect(getStringNoLocaleAll(entry, "http://www.w3.org/ns/dcat#keyword")).toEqual(["legacy"]);
    expect(getUrl(entry, DCTERMS.license)).toBe(content.license);
    expect(getStringWithLocale(entry, DCTERMS.description, "en")).toBe(
      content.description!.en,
    );
  });

  it("copies the release's title and description in every language it states them in", async () => {
    const imported = await makeRepository().importDeck(INSTANCE, {
      ...content,
      title: { ...content.title, sv: "Huvudstäder" },
      description: { ...content.description, sv: "Från Wikipedia." },
    });

    const catalog = vi.mocked(saveSolidDatasetAt).mock.calls[1][1] as SolidDataset;
    const entry = getThing(catalog, imported.url)!;
    expect(getStringWithLocale(entry, DCTERMS.title, "en")).toBe(content.title.en);
    expect(getStringWithLocale(entry, DCTERMS.title, "sv")).toBe("Huvudstäder");
    expect(getStringWithLocale(entry, DCTERMS.description, "sv")).toBe("Från Wikipedia.");
  });

  it("leaves the catalog alone when the cards document fails to save", async () => {
    vi.mocked(saveSolidDatasetAt).mockRejectedValueOnce(new Error("403"));

    await expect(
      makeRepository().importDeck(INSTANCE, content),
    ).rejects.toThrow("403");
    expect(getSolidDatasetOrNull).not.toHaveBeenCalled();
    expect(saveSolidDatasetAt).toHaveBeenCalledTimes(1);
  });
});

describe("renameDeck", () => {
  it("replaces the title in place and returns the renamed deck", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());

    const renamed = await makeRepository().renameDeck(deck, { en: "Kanji N4" });

    expect(renamed).toEqual({ ...deck, title: { en: "Kanji N4" }, formatVersion: 6 });
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(CATALOG);
    const thing = getThing(saved as SolidDataset, deck.url)!;
    expect(getStringWithLocale(thing, DCTERMS.title, "en")).toBe("Kanji N4");
    expect(getInteger(thing, SM.formatVersion)).toBe(6);
    expect(getUrl(thing, SM.studyDirection)).toBe(SM.frontToBack);
    expect(getUrl(thing, SM.cardsDocument)).toBe(deck.cardsDocumentUrl);
  });

  it("writes the title in every language it has", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());

    await makeRepository().renameDeck(deck, { en: "Kanji N4", sv: "Kanji N4 (svenska)" });

    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    const thing = getThing(saved as SolidDataset, deck.url)!;
    expect(getStringWithLocale(thing, DCTERMS.title, "en")).toBe("Kanji N4");
    expect(getStringWithLocale(thing, DCTERMS.title, "sv")).toBe("Kanji N4 (svenska)");
  });

  it("rejects when the catalog no longer exists", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().renameDeck(deck, { en: "x" })).rejects.toThrow(
      "no longer exists",
    );
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("rejects when the deck is no longer in the catalog", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      mockSolidDatasetFrom(CATALOG),
    );
    await expect(makeRepository().renameDeck(deck, { en: "x" })).rejects.toThrow(
      "no longer exists",
    );
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("saveDeck", () => {
  it("writes the direction and format version in place, keeping the rest and dropping the old direction", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        catalogWithDeck(),
        buildThing(getThing(catalogWithDeck(), deck.url)!)
          .addStringNoLocale(SM.direction, "front-to-back")
          .build(),
      ),
    );

    const saved = await makeRepository().saveDeck({
      ...deck,
      direction: "bidirectional",
    });

    expect(saved).toEqual({ ...deck, direction: "bidirectional", formatVersion: 6 });
    const [saveUrl, dataset] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(CATALOG);
    const thing = getThing(dataset as SolidDataset, deck.url)!;
    expect(getUrl(thing, SM.studyDirection)).toBe(SM.bidirectional);
    expect(getStringNoLocale(thing, SM.direction)).toBeNull();
    expect(getInteger(thing, SM.formatVersion)).toBe(6);
    expect(getStringWithLocale(thing, DCTERMS.title, "en")).toBe(deck.title.en);
    expect(getUrl(thing, SM.reviewsDocument)).toBe(deck.reviewsDocumentUrl);
  });

  it("writes the deck's own daily limits, and removes one the deck no longer sets", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        catalogWithDeck(),
        buildThing(getThing(catalogWithDeck(), deck.url)!)
          .addInteger(SM.deckNewCardsPerDay, 20)
          .addInteger(SM.deckMaxReviewsPerDay, 100)
          .build(),
      ),
    );

    const saved = await makeRepository().saveDeck({ ...deck, newCardsPerDay: 5 });

    expect(saved).toEqual({ ...deck, newCardsPerDay: 5, formatVersion: 6 });
    const [, dataset] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    const thing = getThing(dataset as SolidDataset, deck.url)!;
    expect(getInteger(thing, SM.deckNewCardsPerDay)).toBe(5);
    expect(getInteger(thing, SM.deckMaxReviewsPerDay)).toBeNull();
  });

  it("rejects when the deck is gone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().saveDeck(deck)).rejects.toThrow(
      "no longer exists",
    );
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("removeDeck", () => {
  it("deletes both documents and the catalog subject, its distribution and agents no other deck names", async () => {
    const authored: Deck = { ...deck, authors: ["Anton Wiklund", "A friend"] };
    const other: Deck = {
      ...deck,
      id: "deck-2",
      url: `${CATALOG}#deck-2`,
      cardsDocumentUrl: `${INSTANCE}decks/deck-2.ttl`,
      reviewsDocumentUrl: `${INSTANCE}reviews/deck-2.ttl`,
      authors: ["A friend"],
    };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    await makeRepository().saveDeck(authored);
    let catalog = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    vi.mocked(getSolidDatasetOrNull).mockReset().mockResolvedValue(
      setThing(catalog, buildThing(createThing({ url: other.url })).addIri(RDF.type, SM.Deck).build()) as never,
    );
    await makeRepository().saveDeck(other);
    catalog = vi.mocked(saveSolidDatasetAt).mock.calls[1][1] as SolidDataset;
    expect(getThing(catalog, `${CATALOG}#agent-anton-wiklund`)).not.toBeNull();
    vi.mocked(saveSolidDatasetAt).mockReset();
    vi.mocked(getSolidDatasetOrNull).mockReset().mockImplementation((async (
      url: string,
    ) =>
      url === CATALOG ? catalog : mockSolidDatasetFrom(url)) as never);

    await makeRepository().removeDeck(authored);

    expect(deleteSolidDataset).toHaveBeenCalledWith(
      deck.cardsDocumentUrl,
      expect.anything(),
    );
    expect(deleteSolidDataset).toHaveBeenCalledWith(
      deck.reviewsDocumentUrl,
      expect.anything(),
    );
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(CATALOG);
    expect(getThing(saved as SolidDataset, deck.url)).toBeNull();
    expect(getThing(saved as SolidDataset, `${deck.url}-cards`)).toBeNull();
    expect(getThing(saved as SolidDataset, `${CATALOG}#agent-anton-wiklund`)).toBeNull();
    expect(getThing(saved as SolidDataset, `${CATALOG}#agent-a-friend`)).not.toBeNull();
    expect(getThing(saved as SolidDataset, other.url)).not.toBeNull();
  });

  it("keeps a document another deck uses too", async () => {
    const sharing = buildThing(createThing({ url: `${CATALOG}#deck-2` }))
      .addIri(RDF.type, SM.Deck)
      .addStringNoLocale(DCTERMS.title, "Shared")
      .addIri(SM.cardsDocument, deck.cardsDocumentUrl)
      .addIri(SM.reviewsDocument, `${INSTANCE}reviews/deck-2.ttl`)
      .build();
    vi.mocked(getSolidDatasetOrNull).mockImplementation((async (url: string) =>
      url === CATALOG ? setThing(catalogWithDeck(), sharing) : mockSolidDatasetFrom(url)) as never);

    await makeRepository().removeDeck(deck);

    expect(deleteSolidDataset).toHaveBeenCalledOnce();
    expect(deleteSolidDataset).toHaveBeenCalledWith(deck.reviewsDocumentUrl, expect.anything());
    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(getThing(saved as SolidDataset, deck.url)).toBeNull();
    expect(getThing(saved as SolidDataset, `${CATALOG}#deck-2`)).not.toBeNull();
  });

  it("skips missing documents and a missing catalog", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);

    await makeRepository().removeDeck(deck);

    expect(deleteSolidDataset).not.toHaveBeenCalled();
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("listCards", () => {
  it("returns an empty list when the cards document does not exist", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().listCards(deck)).resolves.toEqual([]);
  });

  it("maps card subjects", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        mockSolidDatasetFrom(deck.cardsDocumentUrl),
        buildThing(createThing({ url: card.url }))
          .addIri(RDF.type, SM.Card)
          .addStringNoLocale(SM.front, card.front[""])
          .addStringNoLocale(SM.back, card.back[""])
          .build(),
      ),
    );
    const cards = await makeRepository().listCards(deck);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toEqual({ "": "水" });
  });
});

describe("addCard", () => {
  it("adds a card subject to a fresh cards document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);

    const created = await makeRepository().addCard(deck, {
      front: { "": "火" },
      back: { "": "fire" },
    });

    expect(created).toEqual({
      id: "card-fixed",
      url: `${deck.cardsDocumentUrl}#card-fixed`,
      front: { "": "火" },
      back: { "": "fire" },
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 5,
    });
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(deck.cardsDocumentUrl);
    const thing = getThing(saved as SolidDataset, created.url)!;
    expect(getStringNoLocale(thing, SM.front)).toBe("火");
    expect(getStringNoLocale(thing, SM.back)).toBe("fire");
    expect(getUrl(thing, SM.frontImage)).toBeNull();
    expect(getInteger(thing, SM.formatVersion)).toBe(5);
  });

  it("writes a picture as an IRI and no text triple for an empty side", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);

    const created = await makeRepository().addCard(deck, {
      front: {},
      back: { "": "Afghanistan" },
      frontImageUrl: FLAG,
    });

    expect(created.frontImageUrl).toBe(FLAG);
    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    const thing = getThing(saved as SolidDataset, created.url)!;
    expect(getStringNoLocale(thing, SM.front)).toBeNull();
    expect(getUrl(thing, SM.frontImage)).toBe(FLAG);
    expect(getStringNoLocale(thing, SM.frontImage)).toBeNull();
    expect(getStringNoLocale(thing, SM.back)).toBe("Afghanistan");
  });

  it("writes each picture's description as language-tagged text, and reads it back", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    const content = {
      front: {},
      back: { "": "Sweden" },
      frontImageUrl: FLAG,
      frontImageDescription: { en: "A blue flag with a yellow cross", sv: "En blå flagga med ett gult kors" },
      backImageUrl: FLAG,
      backImageDescription: { sv: "Samma flagga" },
    };

    const created = await makeRepository().addCard(deck, content);

    expect(created).toMatchObject(content);
    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    const thing = getThing(saved as SolidDataset, created.url)!;
    expect(getStringWithLocale(thing, SM.frontImageDescription, "en")).toBe("A blue flag with a yellow cross");
    expect(getStringWithLocale(thing, SM.frontImageDescription, "sv")).toBe("En blå flagga med ett gult kors");
    expect(getStringWithLocale(thing, SM.backImageDescription, "sv")).toBe("Samma flagga");
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(mockSolidDatasetFrom(deck.cardsDocumentUrl), thing));
    const [read] = await makeRepository().listCards(deck);
    expect(read).toMatchObject(content);
  });

  it("writes a picture-only back the same way", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);

    const created = await makeRepository().addCard(deck, {
      front: { "": "Afghanistan" },
      back: {},
      backImageUrl: FLAG,
    });

    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    const thing = getThing(saved as SolidDataset, created.url)!;
    expect(getStringNoLocale(thing, SM.back)).toBeNull();
    expect(getUrl(thing, SM.backImage)).toBe(FLAG);
  });
});

describe("updateCard", () => {
  function cardsDoc() {
    return setThing(
      mockSolidDatasetFrom(deck.cardsDocumentUrl),
      buildThing(createThing({ url: card.url }))
        .addIri(RDF.type, SM.Card)
        .addStringNoLocale(SM.front, card.front[""])
        .addStringNoLocale(SM.back, card.back[""])
        .addIri(SM.backImage, "https://img.example/old.png")
        .addInteger(SM.formatVersion, 1)
        .addStringNoLocale("https://other.example/vocab#note", "kept")
        .build(),
    );
  }

  it("replaces the content in place, in the current format, and returns the updated card", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(cardsDoc());

    const updated = await makeRepository().updateCard(deck, card, {
      front: { "": "수영하다" },
      back: { "": "to swim" },
      frontImageUrl: FLAG,
    });

    expect(updated).toEqual({
      ...card,
      front: { "": "수영하다" },
      back: { "": "to swim" },
      frontImageUrl: FLAG,
      formatVersion: 5,
    });
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(deck.cardsDocumentUrl);
    const thing = getThing(saved as SolidDataset, card.url)!;
    expect(getStringNoLocale(thing, SM.front)).toBe("수영하다");
    expect(getStringNoLocale(thing, SM.back)).toBe("to swim");
    expect(getUrl(thing, SM.frontImage)).toBe(FLAG);
    expect(getUrl(thing, SM.backImage)).toBeNull();
    expect(getInteger(thing, SM.formatVersion)).toBe(5);
    expect(
      getStringNoLocale(thing, "https://other.example/vocab#note"),
    ).toBe("kept");
  });

  it("keeps a retired card retired when it is edited", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(cardsDoc());

    const updated = await makeRepository().updateCard(deck, { ...card, retired: true }, { front: { "": "x" }, back: { "": "y" } });

    expect(updated.retired).toBe(true);
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getBoolean(getThing(saved, card.url)!, OWL_DEPRECATED)).toBe(true);
  });

  it("rejects when the cards document no longer exists", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(
      makeRepository().updateCard(deck, card, { front: { "": "x" }, back: { "": "y" } }),
    ).rejects.toThrow("can no longer be found");
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("rejects when the card no longer exists", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      mockSolidDatasetFrom(deck.cardsDocumentUrl),
    );
    await expect(
      makeRepository().updateCard(deck, card, { front: { "": "x" }, back: { "": "y" } }),
    ).rejects.toThrow("no longer exists");
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("saveCards", () => {
  const other: Card = {
    ...card,
    id: "card-2",
    url: `${deck.cardsDocumentUrl}#card-2`,
    front: { "": "火" },
    back: { "": "fire" },
  };

  const formatOne = (c: Card) =>
    buildThing(createThing({ url: c.url }))
      .addIri(RDF.type, SM.Card)
      .addStringNoLocale(SM.front, c.front[""])
      .addStringNoLocale(SM.back, c.back[""])
      .addInteger(SM.formatVersion, 1)
      .build();

  function cardsDoc() {
    return setThing(
      setThing(mockSolidDatasetFrom(deck.cardsDocumentUrl), formatOne(card)),
      formatOne(other),
    );
  }

  it("rewrites the given cards in one save, skipping cards that are gone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(cardsDoc());
    const gone: Card = {
      ...card,
      id: "card-gone",
      url: `${deck.cardsDocumentUrl}#card-gone`,
      formatVersion: 5,
    };

    await makeRepository().saveCards(deck, [
      { ...card, formatVersion: 5 },
      gone,
      { ...other, formatVersion: 5 },
    ]);

    expect(saveSolidDatasetAt).toHaveBeenCalledTimes(1);
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(deck.cardsDocumentUrl);
    for (const c of [card, other]) {
      const thing = getThing(saved as SolidDataset, c.url)!;
      expect(getInteger(thing, SM.formatVersion)).toBe(5);
      expect(getStringNoLocale(thing, SM.front)).toBe(c.front[""]);
      expect(getStringNoLocale(thing, SM.back)).toBe(c.back[""]);
    }
    expect(getThing(saved as SolidDataset, gone.url)).toBeNull();
  });

  it("does nothing when the cards document no longer exists", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().saveCards(deck, [card]);
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("stateCardLanguages", () => {
  const VOCAB_NOTE = "https://other.example/vocab#note";
  const urlOf = (id: string) => `${deck.cardsDocumentUrl}#${id}`;

  function cardsDoc() {
    const untagged = (id: string, front: string, back: string) =>
      buildThing(createThing({ url: urlOf(id) }))
        .addIri(RDF.type, SM.Card)
        .addStringNoLocale(SM.front, front)
        .addStringNoLocale(SM.back, back)
        .addDatetime(DCTERMS.created, new Date("2026-01-02T03:04:05.000Z"))
        .addInteger(SM.formatVersion, 4)
        .addStringNoLocale(VOCAB_NOTE, "kept")
        .build();
    const frontTagged = buildThing(createThing({ url: urlOf("card-2") }))
      .addIri(RDF.type, SM.Card)
      .addStringWithLocale(SM.front, "eld", "sv")
      .addStringNoLocale(SM.back, "fire")
      .addInteger(SM.formatVersion, 4)
      .build();
    return [untagged("card-1", "水", "water"), frontTagged, untagged("card-3", "木", "tree")].reduce(
      (dataset, thing) => setThing(dataset, thing),
      mockSolidDatasetFrom(deck.cardsDocumentUrl),
    );
  }

  it("states the language of the given cards' untagged sides in one write, as each is in the pod", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(cardsDoc());
    const checkWrite = vi.fn(async () => undefined);

    await expect(
      makeRepository(checkWrite).stateCardLanguages(deck, ["card-1", "card-2", "card-gone"], { front: "ja", back: "en" }),
    ).resolves.toBe(2);

    expect(saveSolidDatasetAt).toHaveBeenCalledTimes(1);
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(deck.cardsDocumentUrl);
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [urlOf("card-1"), urlOf("card-2")]);
    const first = getThing(saved as SolidDataset, urlOf("card-1"))!;
    expect(getStringWithLocale(first, SM.front, "ja")).toBe("水");
    expect(getStringWithLocale(first, SM.back, "en")).toBe("water");
    expect(getStringNoLocale(first, SM.front)).toBeNull();
    expect(getInteger(first, SM.formatVersion)).toBe(5);
    expect(getDatetime(first, DCTERMS.created)).toEqual(new Date("2026-01-02T03:04:05.000Z"));
    expect(getStringNoLocale(first, VOCAB_NOTE)).toBe("kept");
    // A side that states its language is left as it is.
    const second = getThing(saved as SolidDataset, urlOf("card-2"))!;
    expect(getStringWithLocale(second, SM.front, "sv")).toBe("eld");
    expect(getStringWithLocale(second, SM.front, "ja")).toBeNull();
    expect(getStringWithLocale(second, SM.back, "en")).toBe("fire");
    // A card not asked about is untouched.
    expect(getStringNoLocale(getThing(saved as SolidDataset, urlOf("card-3"))!, SM.front)).toBe("木");
  });

  it("writes nothing when no card changes, or the cards document is gone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(cardsDoc());
    await expect(makeRepository().stateCardLanguages(deck, ["card-2"], { front: "ja" })).resolves.toBe(0);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().stateCardLanguages(deck, ["card-1"], { front: "ja" })).resolves.toBe(0);
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("removeCard", () => {
  it("removes the card and its review state", async () => {
    const cardsDoc = setThing(
      mockSolidDatasetFrom(deck.cardsDocumentUrl),
      buildThing(createThing({ url: card.url }))
        .addIri(RDF.type, SM.Card)
        .addStringNoLocale(SM.front, card.front[""])
        .addStringNoLocale(SM.back, card.back[""])
        .build(),
    );
    const reviewsDoc = [
      `${deck.reviewsDocumentUrl}#card-1`,
      `${deck.reviewsDocumentUrl}#card-1@back-to-front`,
    ].reduce(
      (dataset, url) =>
        setThing(
          dataset,
          buildThing(createThing({ url }))
            .addIri(RDF.type, SM.ReviewState)
            .build(),
        ),
      mockSolidDatasetFrom(deck.reviewsDocumentUrl),
    );
    vi.mocked(getSolidDatasetOrNull).mockImplementation(async (url) =>
      url === deck.cardsDocumentUrl ? cardsDoc : reviewsDoc,
    );

    await makeRepository().removeCard(deck, card);

    const cardsSave = vi
      .mocked(saveSolidDatasetAt)
      .mock.calls.find(([url]) => url === deck.cardsDocumentUrl)!;
    expect(getThing(cardsSave[1] as SolidDataset, card.url)).toBeNull();
    const reviewsSave = vi
      .mocked(saveSolidDatasetAt)
      .mock.calls.find(([url]) => url === deck.reviewsDocumentUrl)!;
    expect(
      getThing(
        reviewsSave[1] as SolidDataset,
        `${deck.reviewsDocumentUrl}#card-1`,
      ),
    ).toBeNull();
    expect(
      getThing(
        reviewsSave[1] as SolidDataset,
        `${deck.reviewsDocumentUrl}#card-1@back-to-front`,
      ),
    ).toBeNull();
  });

  it("does nothing when neither document exists", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().removeCard(deck, card);
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("library upgrade writes", () => {
  const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
  const STAGED = `${INSTANCE}decks/deck-1-u1.ttl`;

  it("readDeck reads the deck as its catalog entry says now; null when it is gone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    await expect(makeRepository().readDeck(deck.url)).resolves.toMatchObject({ url: deck.url, title: deck.title });
    await expect(makeRepository().readDeck(`${CATALOG}#deck-2`)).resolves.toBeNull();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().readDeck(deck.url)).resolves.toBeNull();
  });

  it("stageCardChanges writes the changed cards into a new document, moving every card to it, and leaves the original alone", async () => {
    const checkWrite = vi.fn(async () => undefined);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        setThing(
          mockSolidDatasetFrom(deck.cardsDocumentUrl),
          buildThing(createThing({ url: `${deck.cardsDocumentUrl}#se` }))
            .addIri(RDF.type, SM.Card)
            .addStringNoLocale(SM.front, "Sweden")
            .addStringNoLocale(SM.back, "Stockholm?")
            .addDatetime(DCTERMS.created, new Date("2026-01-01T00:00:00.000Z"))
            .addUrl("https://example.org/seeAlso", `${deck.cardsDocumentUrl}#is`)
            .build(),
        ),
        buildThing(createThing({ url: `${deck.cardsDocumentUrl}#is` })).addIri(RDF.type, SM.Card).build(),
      ) as never,
    );
    await makeRepository(checkWrite).stageCardChanges(deck, STAGED, {
      save: [{ id: "se", front: { "": "Sweden" }, back: { "": "Stockholm" } }],
      remove: ["is"],
    });
    expect(getSolidDatasetOrNull).toHaveBeenCalledWith(deck.cardsDocumentUrl, expect.anything());
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const [url, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(url).toBe(STAGED);
    expect(checkWrite).toHaveBeenCalledWith(saved, [`${STAGED}#se`]);
    const se = getThing(saved as SolidDataset, `${STAGED}#se`)!;
    expect(getStringNoLocale(se, SM.back)).toBe("Stockholm");
    expect(getDatetime(se, DCTERMS.created)?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(getUrl(se, "https://example.org/seeAlso")).toBe(`${STAGED}#is`);
    expect(getThing(saved as SolidDataset, `${STAGED}#is`)).toBeNull();
    expect(getThing(saved as SolidDataset, `${deck.cardsDocumentUrl}#se`)).toBeNull();
  });

  it("stageCardChanges writes a deck without a cards document the new cards alone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().stageCardChanges(deck, STAGED, { save: [{ id: "no", front: { "": "Norway" }, back: { "": "Oslo" } }], remove: [] });
    expect(getThing(vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset, `${STAGED}#no`)).not.toBeNull();
  });

  it("switchDeck moves the entry over in one write of the catalog, keeping what changed meanwhile", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    const current = (await makeRepository().readDeck(deck.url))!;
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(catalogWithDeck(), buildThing(getThing(catalogWithDeck(), deck.url)!).addUrl(DCTERMS.license, CC0).build()),
    );
    const next = { ...current, cardsDocumentUrl: STAGED, sourceUrl: "https://solid-memo.com/decks/capitals/2.ttl" };
    const switched = await makeRepository().switchDeck(current, next);
    expect(switched).toMatchObject({ cardsDocumentUrl: STAGED, sourceUrl: next.sourceUrl, license: CC0, formatVersion: 6 });
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const [url, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(url).toBe(CATALOG);
    const thing = getThing(saved as SolidDataset, deck.url)!;
    expect(getUrl(thing, SM.cardsDocument)).toBe(STAGED);
    expect(getUrl(thing, SM.reviewsDocument)).toBe(deck.reviewsDocumentUrl);
    expect(getUrl(thing, PROV.wasDerivedFrom)).toBe(next.sourceUrl);
    expect(getUrl(thing, DCTERMS.license)).toBe(CC0);
  });

  it("switchDeck writes nothing when the entry changed meanwhile, or is gone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    const current = (await makeRepository().readDeck(deck.url))!;
    const next = { ...current, cardsDocumentUrl: STAGED };
    await expect(makeRepository().switchDeck({ ...current, title: { en: "Other" } }, next)).rejects.toThrow(
      `The deck changed while it was being updated, perhaps in another tab or app. Try again.\nurl: ${deck.url}`,
    );
    await expect(makeRepository().switchDeck({ ...current, url: `${CATALOG}#deck-2` }, next)).rejects.toThrow("changed while");
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().switchDeck(current, next)).rejects.toThrow("changed while");
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("deleteDocument deletes a document there is, and nothing when it is gone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(mockSolidDatasetFrom(STAGED));
    await makeRepository().deleteDocument(STAGED);
    expect(deleteSolidDataset).toHaveBeenCalledWith(STAGED, expect.anything());
    vi.mocked(deleteSolidDataset).mockReset();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().deleteDocument(STAGED);
    expect(deleteSolidDataset).not.toHaveBeenCalled();
  });
});
