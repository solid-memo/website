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
  responseToSolidDataset,
  saveSolidDatasetAt,
  setThing,
  solidDatasetAsTurtle,
  type SolidDataset,
} from "@inrupt/solid-client";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { getSolidDatasetOrNull, versionOf } from "./datasets";
import { DCTERMS, PROV, RDF, SCHEMA, SM } from "./vocab";
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
vi.mock("./datasets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./datasets")>();
  return { ...actual, getSolidDatasetOrNull: vi.fn(), versionOf: vi.fn(actual.versionOf) };
});

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
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [deck.url, `${deck.url}-cards`, `${CATALOG}#agent-anton`], "pod");
    await repository.saveCatalog(INSTANCE, {
      title: "Main",
      description: "Mine.",
      publisher: { webId: "https://alice.example/profile/card#me", name: "Alice" },
    });
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [`${CATALOG}#catalog`, "https://alice.example/profile/card#me"], "pod");
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await repository.createDeck(INSTANCE, { en: "New" });
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [`${CATALOG}#deck-fixed`, `${CATALOG}#deck-fixed-cards`], "pod");
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(mockSolidDatasetFrom(deck.cardsDocumentUrl), buildThing(createThing({ url: card.url })).addIri(RDF.type, SM.Card).build()),
    );
    await repository.addCard(deck, { front: { "": "a" }, back: { "": "b" } });
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [`${deck.cardsDocumentUrl}#card-fixed`], "pod");
    await repository.updateCard(deck, card, { front: { "": "a" }, back: { "": "b" } });
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [card.url], "pod");
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

  it("writes a card's distractors as the Studio's edits, moves and imports do: both links in step, typed sm:Distractor and schema:Answer", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    const distractors = [
      { id: "no-d1", text: { en: "Bergen" } },
      { id: "no-d2", text: { en: "Trondheim" }, retired: true as const },
    ];
    await makeRepository().applyCardChanges(deck, { save: [{ id: "no", front: { en: "Norway" }, back: { en: "Oslo" }, distractors }], remove: [] });
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    const urls = distractors.map((d) => `${deck.cardsDocumentUrl}#${d.id}`);
    const no = getThing(saved, `${deck.cardsDocumentUrl}#no`)!;
    expect(getUrlAll(no, SM.distractor).sort()).toEqual(urls);
    expect(getUrlAll(no, SCHEMA.suggestedAnswer).sort()).toEqual(urls);
    for (const url of urls) expect(getUrlAll(getThing(saved, url)!, RDF.type).sort()).toEqual(["https://schema.org/Answer", SM.Distractor]);
    expect(getBoolean(getThing(saved, urls[1]!)!, OWL_DEPRECATED)).toBe(true);

    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(saved as never);
    await makeRepository().applyCardChanges(deck, {
      save: [{ id: "no", front: { en: "Norway" }, back: { en: "Oslo" }, distractors: [distractors[0]!] }],
      remove: [],
    });
    const again = vi.mocked(saveSolidDatasetAt).mock.calls[1][1] as SolidDataset;
    expect(getUrlAll(getThing(again, `${deck.cardsDocumentUrl}#no`)!, SM.distractor)).toEqual([urls[0]]);
    expect(getUrlAll(getThing(again, `${deck.cardsDocumentUrl}#no`)!, SCHEMA.suggestedAnswer)).toEqual([urls[0]]);
    expect(getThing(again, urls[1]!)).toBeNull();
  });

  it("creates the cards document when there is none", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().applyCardChanges(deck, { save: [{ id: "no", front: { "": "Norway" }, back: { "": "Oslo" } }], remove: [] });
    expect(getThing(vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset, `${deck.cardsDocumentUrl}#no`)).not.toBeNull();
  });

  it("makes a new card at the creation time given, as a card copied whole keeps its own", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().applyCardChanges(deck, {
      save: [{ id: "no", front: { "": "Norway" }, back: { "": "Oslo" }, createdAt: "2026-01-02T03:04:05.000Z" }],
      remove: [],
    });
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getDatetime(getThing(saved, `${deck.cardsDocumentUrl}#no`)!, DCTERMS.created)?.toISOString()).toBe(
      "2026-01-02T03:04:05.000Z",
    );
  });

  it("writes changes made from an earlier read only while the document is still at the version read", async () => {
    const changes = { save: [{ id: "no", front: { "": "Norway" }, back: { "": "Oslo" } }], remove: [] };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(mockSolidDatasetFrom(deck.cardsDocumentUrl));
    vi.mocked(versionOf).mockReturnValueOnce('"v1"');
    await makeRepository().applyCardChanges(deck, changes, { whole: true, version: '"v1"' });
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    // Changed since it was read: nothing is written.
    vi.mocked(versionOf).mockReturnValueOnce('"v2"');
    await expect(makeRepository().applyCardChanges(deck, changes, { version: '"v1"' })).rejects.toMatchObject({
      code: "changedElsewhere",
      vars: { url: deck.cardsDocumentUrl },
    });
    // Gone since, or created since it was read as missing.
    vi.mocked(getSolidDatasetOrNull).mockResolvedValueOnce(null);
    await expect(makeRepository().applyCardChanges(deck, changes, { version: '"v1"' })).rejects.toMatchObject({ code: "changedElsewhere" });
    await expect(makeRepository().applyCardChanges(deck, changes, { version: "absent" })).rejects.toMatchObject({ code: "createdElsewhere" });
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    // Still missing, it is created.
    vi.mocked(getSolidDatasetOrNull).mockResolvedValueOnce(null);
    await makeRepository().applyCardChanges(deck, changes, { version: "absent" });
    expect(saveSolidDatasetAt).toHaveBeenCalledTimes(2);
  });
});

describe("addDeck", () => {
  const added: Deck = {
    ...deck,
    id: "deck-2",
    url: `${CATALOG}#deck-2`,
    cardsDocumentUrl: `${INSTANCE}decks/deck-2.ttl`,
    reviewsDocumentUrl: `${INSTANCE}reviews/deck-2.ttl`,
    createdAt: "2026-01-02T03:04:05.000Z",
    sourceUrl: "https://solid-memo.com/decks/solid-fundamentals/v1.ttl",
    completedChapters: ["https://solid-memo.com/decks/solid-fundamentals/v1.ttl#ch-why-solid"],
  };

  it("adds the deck's entry as it is, at its own URLs, with its chapters completed, beside the decks there, checked first", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    const checkWrite = vi.fn(async () => undefined);
    const written = await makeRepository(checkWrite).addDeck(added);
    expect(written).toEqual({ ...added, formatVersion: 6 });
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [added.url, `${added.url}-cards`], "pod");
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0]!;
    expect(saveUrl).toBe(CATALOG);
    const thing = getThing(saved as SolidDataset, added.url)!;
    expect(getUrl(thing, SM.cardsDocument)).toBe(added.cardsDocumentUrl);
    expect(getUrl(thing, PROV.wasDerivedFrom)).toBe(added.sourceUrl);
    expect(getUrlAll(thing, SM.completedChapter)).toEqual(added.completedChapters);
    expect(getDatetime(thing, DCTERMS.created)?.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect(getThing(saved as SolidDataset, deck.url)).not.toBeNull();
  });

  it("creates the catalog document when there is none, a deck without chapters stating none", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    const { completedChapters: _chapters, ...plain } = added;
    await makeRepository().addDeck(plain);
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0]![1] as SolidDataset;
    expect(getUrlAll(getThing(saved, added.url)!, SM.completedChapter)).toEqual([]);
  });

  it("refuses an entry where the catalog has one, writing nothing", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    await expect(makeRepository().addDeck(deck)).rejects.toMatchObject({ code: "createdElsewhere" });
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  const preconditionFailed = () => Object.assign(new Error("412 Precondition Failed"), { statusCode: 412 });

  it("reads the catalog again and adds the entry to it when it changed elsewhere meanwhile, a few times at most", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    vi.mocked(saveSolidDatasetAt).mockRejectedValueOnce(preconditionFailed());
    await expect(makeRepository().addDeck(added)).resolves.toEqual({ ...added, formatVersion: 6 });
    expect(getSolidDatasetOrNull).toHaveBeenCalledTimes(2);
    expect(saveSolidDatasetAt).toHaveBeenCalledTimes(2);

    vi.mocked(saveSolidDatasetAt).mockReset().mockRejectedValue(preconditionFailed());
    await expect(makeRepository().addDeck(added)).rejects.toMatchObject({ code: "changedElsewhere" });
    expect(saveSolidDatasetAt).toHaveBeenCalledTimes(3);
  });

  it("refuses an entry another tab wrote meanwhile, and gives up at once on any other failure", async () => {
    const withAdded = setThing(catalogWithDeck(), buildThing(createThing({ url: added.url })).addIri(RDF.type, SM.Deck).build());
    vi.mocked(getSolidDatasetOrNull).mockResolvedValueOnce(catalogWithDeck()).mockResolvedValueOnce(withAdded);
    vi.mocked(saveSolidDatasetAt).mockRejectedValueOnce(preconditionFailed());
    await expect(makeRepository().addDeck(added)).rejects.toMatchObject({ code: "createdElsewhere" });
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();

    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    vi.mocked(saveSolidDatasetAt).mockReset().mockRejectedValueOnce(new Error("403"));
    await expect(makeRepository().addDeck(added)).rejects.toThrow("403");
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
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

describe("upgradeDecks", () => {
  const catalog = {
    title: "Main",
    description: "My decks.",
    publisher: { webId: "https://alice.example/profile/card#me", name: "Alice" },
  };
  /** The catalog document with a deck entry at format 1 and one, `deck-2`, at this app's format. */
  function catalogWithTwo() {
    const current = buildThing(createThing({ url: `${CATALOG}#deck-2` }))
      .addIri(RDF.type, SM.Deck)
      .addStringWithLocale(DCTERMS.title, "Current", "en")
      .addStringWithLocale(DCTERMS.description, "Up to date.", "en")
      .addIri(SM.cardsDocument, `${INSTANCE}decks/deck-2.ttl`)
      .addIri(SM.reviewsDocument, `${INSTANCE}reviews/deck-2.ttl`)
      .addIri(SM.studyDirection, SM.frontToBack)
      .addInteger(SM.formatVersion, 6)
      .build();
    return setThing(catalogWithDeck(), current);
  }

  it("rewrites each outdated entry, as read, in this app's format and writes a missing catalogue, in one write of the catalog document", async () => {
    const checkWrite = vi.fn(async () => undefined);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithTwo());
    await expect(makeRepository(checkWrite).upgradeDecks(INSTANCE, catalog)).resolves.toBe(true);
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const [url, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(url).toBe(CATALOG);
    const entry = getThing(saved as SolidDataset, deck.url)!;
    expect(getInteger(entry, SM.formatVersion)).toBe(6);
    expect(getStringWithLocale(entry, DCTERMS.title, "en")).toBe("Kanji N5");
    expect(getUrlAll(getThing(saved as SolidDataset, `${CATALOG}#catalog`)!, "http://www.w3.org/ns/dcat#dataset")).toEqual([
      deck.url,
      `${CATALOG}#deck-2`,
    ]);
    // The entry in this app's format already is not written.
    const subjects = (checkWrite.mock.calls[0] as unknown as [SolidDataset, string[]])[1];
    expect(subjects).toEqual(expect.arrayContaining([deck.url, `${CATALOG}#catalog`, catalog.publisher.webId]));
    expect(subjects).not.toContain(`${CATALOG}#deck-2`);
  });

  it("keeps a catalogue the document has, and writes nothing when nothing is outdated", async () => {
    const withCatalogue = setThing(
      catalogWithTwo(),
      buildThing(createThing({ url: `${CATALOG}#catalog` }))
        .addIri(RDF.type, "http://www.w3.org/ns/dcat#Catalog")
        .addStringNoLocale(DCTERMS.title, "Theirs")
        .addStringNoLocale(DCTERMS.description, "Kept.")
        .addIri("http://purl.org/dc/terms/publisher", "https://bob.example/profile/card#me")
        .build(),
    );
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(withCatalogue);
    await expect(makeRepository().upgradeDecks(INSTANCE, catalog)).resolves.toBe(true);
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getStringNoLocale(getThing(saved, `${CATALOG}#catalog`)!, DCTERMS.title)).toBe("Theirs");
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(mockSolidDatasetFrom(CATALOG), getThing(catalogWithTwo(), `${CATALOG}#deck-2`)!));
    await expect(makeRepository().upgradeDecks(INSTANCE, null)).resolves.toBe(false);
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
  });

  it("creates the catalog document for a catalogue alone, and writes nothing where there is neither", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().upgradeDecks(INSTANCE, null)).resolves.toBe(false);
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
    await expect(makeRepository().upgradeDecks(INSTANCE, catalog)).resolves.toBe(true);
    expect(getThing(vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset, `${CATALOG}#catalog`)).not.toBeNull();
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
    url: "https://solid-memo.com/decks/capitals/v1.ttl",
    title: { en: "Capitals" },
    formatVersion: 1,
    authors: ["Anton Wiklund", "A friend"],
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    description: { en: "Capitals, from Wikipedia." },
    direction: "bidirectional",
    version: "1",
    seriesUrl: "https://solid-memo.com/decks/index.ttl#capitals",
    themes: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"],
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

  it("copies a card's distractors beside it, keeping their fragment ids, and checks them with the cards", async () => {
    const checkWrite = vi.fn(async () => undefined);
    const imported = await makeRepository(checkWrite).importDeck(INSTANCE, {
      ...content,
      cards: [
        {
          id: "q",
          front: { en: "What can an IRI name?" },
          back: { en: "Anything" },
          distractors: [{ id: "q-d1", text: { en: "Only web pages" }, note: { en: "A URL is one kind of IRI." } }],
          formatVersion: 5,
        },
      ],
    });

    const doc = imported.cardsDocumentUrl;
    expect(checkWrite).toHaveBeenNthCalledWith(1, expect.anything(), [`${doc}#q`, `${doc}#q-d1`], "pod");
    const cards = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getUrlAll(getThing(cards, `${doc}#q`)!, SM.distractor)).toEqual([`${doc}#q-d1`]);
    const distractor = getThing(cards, `${doc}#q-d1`)!;
    expect(getUrlAll(distractor, RDF.type)).toContain(SM.Distractor);
    expect(getStringWithLocale(distractor, SM.distractorText, "en")).toBe("Only web pages");
    expect(getStringWithLocale(distractor, SM.distractorNote, "en")).toBe("A URL is one kind of IRI.");
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

describe("saveDecks", () => {
  const second: Deck = { ...deck, id: "deck-2", url: `${CATALOG}#deck-2`, title: { en: "Verbs" } };
  const elsewhere: Deck = { ...deck, id: "deck-3", url: "https://pod.example/solid-memo/b/catalog.ttl#deck-3" };
  const entry = (of: Deck) => buildThing(createThing({ url: of.url })).addIri(RDF.type, SM.Deck).build();

  it("writes the decks of a catalog document in one save, and each other document in one of its own", async () => {
    vi.mocked(getSolidDatasetOrNull).mockImplementation((async (url: string) =>
      url === CATALOG
        ? setThing(catalogWithDeck(), entry(second))
        : setThing(mockSolidDatasetFrom(url), entry(elsewhere))) as never);

    const saved = await makeRepository().saveDecks([
      { ...deck, newCardsPerDay: 3 },
      { ...elsewhere, newCardsPerDay: 3 },
      { ...second, newCardsPerDay: 3 },
    ]);

    expect(saved.map((written) => [written.id, written.newCardsPerDay, written.formatVersion])).toEqual([
      ["deck-1", 3, 6],
      ["deck-3", 3, 6],
      ["deck-2", 3, 6],
    ]);
    const saves = vi.mocked(saveSolidDatasetAt).mock.calls;
    expect(saves.map(([url]) => url)).toEqual([CATALOG, "https://pod.example/solid-memo/b/catalog.ttl"]);
    for (const written of [deck, second]) {
      expect(getInteger(getThing(saves[0]![1] as SolidDataset, written.url)!, SM.deckNewCardsPerDay)).toBe(3);
    }
  });

  it("writes nothing of a document when one of its decks is gone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    await expect(makeRepository().saveDecks([deck, second])).rejects.toThrow("no longer exists");
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("removeDecks", () => {
  it("deletes each deck's documents, once each, then their entries in one write", async () => {
    const second: Deck = {
      ...deck,
      id: "deck-2",
      url: `${CATALOG}#deck-2`,
      cardsDocumentUrl: `${INSTANCE}decks/deck-2.ttl`,
      // Another app pointed both decks at one reviews document.
      reviewsDocumentUrl: deck.reviewsDocumentUrl,
    };
    const secondEntry = buildThing(createThing({ url: second.url }))
      .addIri(RDF.type, SM.Deck)
      .addStringNoLocale(DCTERMS.title, "Verbs")
      .addIri(SM.cardsDocument, second.cardsDocumentUrl)
      .addIri(SM.reviewsDocument, second.reviewsDocumentUrl)
      .build();
    vi.mocked(getSolidDatasetOrNull).mockImplementation((async (url: string) =>
      url === CATALOG ? setThing(catalogWithDeck(), secondEntry) : mockSolidDatasetFrom(url)) as never);

    await makeRepository().removeDecks([deck, second]);

    expect(vi.mocked(deleteSolidDataset).mock.calls.map(([url]) => url)).toEqual([
      deck.cardsDocumentUrl,
      deck.reviewsDocumentUrl,
      second.cardsDocumentUrl,
    ]);
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(getThing(saved as SolidDataset, deck.url)).toBeNull();
    expect(getThing(saved as SolidDataset, second.url)).toBeNull();
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
    // The document itself says whose cards it holds.
    expect(getUrlAll(getThing(saved as SolidDataset, deck.cardsDocumentUrl)!, DCTERMS.isPartOf)).toEqual([deck.url]);
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

  it("keeps a card's distractors when the edit states none, and replaces them when it does", async () => {
    const distractors = [{ id: "card-1-d1", text: { en: "Fire" } }, { id: "card-1-d2", text: { en: "Earth" } }];
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(cardsDoc());

    const kept = await makeRepository().updateCard(deck, { ...card, distractors }, { front: { "": "水" }, back: { "": "water" } });

    expect(kept.distractors).toEqual(distractors);
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getUrlAll(getThing(saved, card.url)!, SM.distractor)).toEqual(distractors.map((d) => `${deck.cardsDocumentUrl}#${d.id}`));
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(saved as Awaited<ReturnType<typeof getSolidDatasetOrNull>>);

    const replaced = await makeRepository().updateCard(deck, kept, { front: { "": "水" }, back: { "": "water" }, distractors: [distractors[1]] });

    expect(replaced.distractors).toEqual([distractors[1]]);
    const again = vi.mocked(saveSolidDatasetAt).mock.calls[1][1] as SolidDataset;
    expect(getThing(again, `${deck.cardsDocumentUrl}#card-1-d1`)).toBeNull();
    expect(getStringWithLocale(getThing(again, `${deck.cardsDocumentUrl}#card-1-d2`)!, SM.distractorText, "en")).toBe("Earth");
  });

  it("names each distractor a schema:suggestedAnswer too, keeping another app's suggested answers", async () => {
    const distractors = [{ id: "card-1-d1", text: { en: "Fire" } }, { id: "card-1-d2", text: { en: "Earth" } }];
    const theirs = "https://quiz.example/answers#a1";
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        cardsDoc(),
        buildThing(getThing(cardsDoc(), card.url)!).addUrl(SCHEMA.suggestedAnswer, theirs).build(),
      ) as never,
    );
    const kept = await makeRepository().updateCard(deck, card, { front: { "": "水" }, back: { "": "water" }, distractors });
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getUrlAll(getThing(saved, card.url)!, SCHEMA.suggestedAnswer).sort()).toEqual(
      [theirs, ...distractors.map((d) => `${deck.cardsDocumentUrl}#${d.id}`)].sort(),
    );
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(saved as never);

    await makeRepository().updateCard(deck, kept, { front: { "": "水" }, back: { "": "water" }, distractors: [distractors[1]] });

    const again = vi.mocked(saveSolidDatasetAt).mock.calls[1][1] as SolidDataset;
    expect(getUrlAll(getThing(again, card.url)!, SCHEMA.suggestedAnswer).sort()).toEqual(
      [theirs, `${deck.cardsDocumentUrl}#card-1-d2`].sort(),
    );
  });

  it("keeps a card's text format when the edit states none, and writes the one it states", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(cardsDoc());

    const kept = await makeRepository().updateCard(deck, { ...card, textFormat: SM.markdown }, { front: { "": "水" }, back: { "": "**water**" } });

    expect(kept.textFormat).toBe(SM.markdown);
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getUrlAll(getThing(saved, card.url)!, SM.textFormat)).toEqual([SM.markdown]);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(saved as Awaited<ReturnType<typeof getSolidDatasetOrNull>>);

    const plain = await makeRepository().updateCard(deck, kept, { front: { "": "水" }, back: { "": "**water**" }, textFormat: SM.plainText });

    expect(plain.textFormat).toBe(SM.plainText);
    const again = vi.mocked(saveSolidDatasetAt).mock.calls[1][1] as SolidDataset;
    expect(getUrlAll(getThing(again, card.url)!, SM.textFormat)).toEqual([SM.plainText]);
  });

  it("keeps a text format this app does not know through an edit, and writes none for a card that has none", async () => {
    const unknown = "https://example.org/formats#asciidoc";
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(cardsDoc());

    await makeRepository().updateCard(deck, { ...card, textFormat: unknown }, { front: { "": "水" }, back: { "": "water" } });
    await makeRepository().updateCard(deck, card, { front: { "": "水" }, back: { "": "water" } });

    const [first, second] = vi.mocked(saveSolidDatasetAt).mock.calls.map((call) => call[1] as SolidDataset);
    expect(getUrlAll(getThing(first!, card.url)!, SM.textFormat)).toEqual([unknown]);
    expect(getUrlAll(getThing(second!, card.url)!, SM.textFormat)).toEqual([]);
  });

  it("keeps a text's line breaks and leading spaces through the pod's Turtle and back", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(cardsDoc());
    const content = {
      front: { en: "Run it" },
      back: { en: "a\n\n  b", sv: "a\r\nb\n" },
      backNote: { en: "# Not a comment\n\"quoted\"\n" },
    };

    await makeRepository().updateCard(deck, card, content);

    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    const response = new Response(await solidDatasetAsTurtle(saved), { headers: { "Content-Type": "text/turtle" } });
    Object.defineProperty(response, "url", { value: deck.cardsDocumentUrl });
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(await responseToSolidDataset(response));
    const [read] = await makeRepository().listCards(deck);
    expect(read).toMatchObject(content);
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

describe("upgradeCards", () => {
  const other: Card = {
    ...card,
    id: "card-2",
    url: `${deck.cardsDocumentUrl}#card-2`,
    front: { "": "火" },
    back: { "": "fire" },
  };

  const stored = (c: Card, formatVersion: number) =>
    buildThing(createThing({ url: c.url }))
      .addIri(RDF.type, SM.Card)
      .addStringNoLocale(SM.front, c.front[""])
      .addStringNoLocale(SM.back, c.back[""])
      .addInteger(SM.formatVersion, formatVersion)
      .addStringNoLocale("https://other.example/vocab#note", "kept")
      .build();

  it("rewrites each outdated card, as read, in this app's format, in one checked save; unknown triples and up-to-date cards kept", async () => {
    const checkWrite = vi.fn(async () => undefined);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(setThing(mockSolidDatasetFrom(deck.cardsDocumentUrl), stored(card, 1)), stored(other, 5)),
    );

    await expect(makeRepository(checkWrite).upgradeCards(deck)).resolves.toBe(true);

    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(deck.cardsDocumentUrl);
    const upgraded = getThing(saved as SolidDataset, card.url)!;
    expect(getInteger(upgraded, SM.formatVersion)).toBe(5);
    expect(getStringNoLocale(upgraded, SM.front)).toBe("水");
    expect(getStringNoLocale(upgraded, SM.back)).toBe("water");
    expect(getStringNoLocale(upgraded, "https://other.example/vocab#note")).toBe("kept");
    expect(checkWrite).toHaveBeenCalledWith(saved, [card.url], "pod");
  });

  it("writes nothing when no card is outdated, or there is no cards document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(mockSolidDatasetFrom(deck.cardsDocumentUrl), stored(other, 5)));
    await expect(makeRepository().upgradeCards(deck)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().upgradeCards(deck)).resolves.toBe(false);
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
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [urlOf("card-1"), urlOf("card-2")], "pod");
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
  it("refuses to remove a card a newer version of the app has written, writing nothing", async () => {
    const cardsDoc = setThing(
      mockSolidDatasetFrom(deck.cardsDocumentUrl),
      buildThing(createThing({ url: card.url })).addIri(RDF.type, SM.Card).addInteger(SM.formatVersion, 99).build(),
    );
    vi.mocked(getSolidDatasetOrNull).mockImplementation(async (url) => (url === deck.cardsDocumentUrl ? cardsDoc : null));
    await expect(makeRepository().removeCard(deck, card)).rejects.toMatchObject({ code: "writtenByNewerApp" });
    expect(vi.mocked(saveSolidDatasetAt).mock.calls.filter(([url]) => url === deck.cardsDocumentUrl)).toEqual([]);
  });

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

  it("removes the card's states that name it, whatever their subject, and keeps another card's and another scheduler's", async () => {
    const reviewState = (id: string, cardId: string, scheduler?: string) => {
      const thing = buildThing(createThing({ url: `${deck.reviewsDocumentUrl}#${id}` }))
        .addIri(RDF.type, SM.ReviewState)
        .addIri(SM.reviewOf, `${deck.cardsDocumentUrl}#${cardId}`);
      return (scheduler === undefined ? thing : thing.addIri(SM.scheduler, scheduler)).build();
    };
    const reviewsDoc = [
      reviewState("rs-1", "card-1"),
      reviewState("card-1", "card-2"),
      reviewState("rs-2", "card-1", "https://fsrs.example/ns#fsrs"),
    ].reduce((dataset, thing) => setThing(dataset, thing), mockSolidDatasetFrom(deck.reviewsDocumentUrl));
    vi.mocked(getSolidDatasetOrNull).mockImplementation(async (url) => (url === deck.reviewsDocumentUrl ? reviewsDoc : null));

    await makeRepository().removeCard(deck, card);

    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getThing(saved, `${deck.reviewsDocumentUrl}#rs-1`)).toBeNull();
    expect(getThing(saved, `${deck.reviewsDocumentUrl}#card-1`)).not.toBeNull();
    expect(getThing(saved, `${deck.reviewsDocumentUrl}#rs-2`)).not.toBeNull();
  });

  it("removes the distractors the card names with it, and leaves a document without the card as it was", async () => {
    const distractor = `${deck.cardsDocumentUrl}#card-1-d1`;
    const cardsDoc = [
      buildThing(createThing({ url: card.url })).addIri(RDF.type, SM.Card).addIri(SM.distractor, distractor).build(),
      buildThing(createThing({ url: distractor })).addIri(RDF.type, SM.Distractor).build(),
      buildThing(createThing({ url: `${deck.cardsDocumentUrl}#other` })).addIri(RDF.type, SM.Card).build(),
    ].reduce((dataset, thing) => setThing(dataset, thing), mockSolidDatasetFrom(deck.cardsDocumentUrl));
    vi.mocked(getSolidDatasetOrNull).mockImplementation(async (url) => (url === deck.cardsDocumentUrl ? cardsDoc : null));

    await makeRepository().removeCard(deck, card);
    await makeRepository().removeCard(deck, { ...card, id: "gone", url: `${deck.cardsDocumentUrl}#gone` });

    const [first, second] = vi.mocked(saveSolidDatasetAt).mock.calls.map((call) => call[1] as SolidDataset);
    expect(getThing(first, card.url)).toBeNull();
    expect(getThing(first, distractor)).toBeNull();
    expect(getThing(first, `${deck.cardsDocumentUrl}#other`)).not.toBeNull();
    expect(getThing(second, distractor)).not.toBeNull();
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

  it("upgradeDeckEntry moves the entry to the new release in one write of the catalog, keeping what changed meanwhile", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    const current = (await makeRepository().readDeck(deck.url))!;
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(catalogWithDeck(), buildThing(getThing(catalogWithDeck(), deck.url)!).addUrl(DCTERMS.license, CC0).build()),
    );
    const next = { ...current, sourceUrl: "https://solid-memo.com/decks/capitals/v2.ttl" };
    const upgraded = await makeRepository().upgradeDeckEntry(current, next);
    expect(upgraded).toMatchObject({ cardsDocumentUrl: deck.cardsDocumentUrl, sourceUrl: next.sourceUrl, license: CC0, formatVersion: 6 });
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const [url, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(url).toBe(CATALOG);
    const thing = getThing(saved as SolidDataset, deck.url)!;
    expect(getUrl(thing, SM.cardsDocument)).toBe(deck.cardsDocumentUrl);
    expect(getUrl(thing, SM.reviewsDocument)).toBe(deck.reviewsDocumentUrl);
    expect(getUrl(thing, PROV.wasDerivedFrom)).toBe(next.sourceUrl);
    expect(getUrl(thing, DCTERMS.license)).toBe(CC0);
  });

  it("upgradeDeckEntry writes nothing when the entry changed meanwhile, or is gone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalogWithDeck());
    const current = (await makeRepository().readDeck(deck.url))!;
    const next = { ...current, sourceUrl: "https://solid-memo.com/decks/capitals/v2.ttl" };
    await expect(makeRepository().upgradeDeckEntry({ ...current, title: { en: "Other" } }, next)).rejects.toThrow(
      `The deck changed while it was being updated, perhaps in another tab or app. Try again.\nurl: ${deck.url}`,
    );
    await expect(makeRepository().upgradeDeckEntry({ ...current, url: `${CATALOG}#deck-2` }, next)).rejects.toThrow("changed while");
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().upgradeDeckEntry(current, next)).rejects.toThrow("changed while");
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

describe("the cards document itself", () => {
  it("is part of the deck once, keeping what else it is part of, through every write", async () => {
    const other = `${CATALOG}#deck-2`;
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        mockSolidDatasetFrom(deck.cardsDocumentUrl),
        buildThing(createThing({ url: deck.cardsDocumentUrl })).addUrl(DCTERMS.isPartOf, other).build(),
      ) as never,
    );
    await makeRepository().addCard(deck, { front: { "": "火" }, back: { "": "fire" } });
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getUrlAll(getThing(saved, deck.cardsDocumentUrl)!, DCTERMS.isPartOf)).toEqual([other, deck.url]);

    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(saved as never);
    await makeRepository().removeCard(deck, { ...card, id: "card-fixed", url: `${deck.cardsDocumentUrl}#card-fixed` });
    const again = vi.mocked(saveSolidDatasetAt).mock.calls[1][1] as SolidDataset;
    expect(getUrlAll(getThing(again, deck.cardsDocumentUrl)!, DCTERMS.isPartOf)).toEqual([other, deck.url]);
  });
});
