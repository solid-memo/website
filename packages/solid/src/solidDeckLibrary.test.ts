import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  getSolidDataset,
  getThing,
  mockSolidDatasetFrom,
  setThing,
} from "@inrupt/solid-client";
import { createSolidDeckLibrary } from "./solidDeckLibrary";
import { DCTERMS, RDF, SCHEMA, SM } from "./vocab";

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@inrupt/solid-client")>();
  return { ...actual, getSolidDataset: vi.fn() };
});

const INDEX = "https://solid-memo.com/decks/index.ttl";
const DOC = "https://solid-memo.com/decks/capitals/v1.ttl";
const fetch = vi.fn() as unknown as typeof globalThis.fetch;

function makeLibrary() {
  return createSolidDeckLibrary({ fetch, indexUrl: INDEX });
}

/** A release of one card. */
function deckDocument() {
  return setThing(
    setThing(
      mockSolidDatasetFrom(DOC),
      buildThing(createThing({ url: DOC }))
        .addIri(RDF.type, SM.Deck)
        .addStringNoLocale(DCTERMS.title, "Capitals")
        .build(),
    ),
    buildThing(createThing({ url: `${DOC}#sweden` }))
      .addIri(RDF.type, SM.Card)
      .addStringNoLocale(SM.front, "Sweden")
      .addStringNoLocale(SM.back, "Stockholm")
      .build(),
  );
}

beforeEach(() => {
  vi.mocked(getSolidDataset).mockReset();
});

describe("listLibraryDecks", () => {
  it("reads the decks the index's catalogue lists", async () => {
    const index = setThing(
      mockSolidDatasetFrom(INDEX),
      buildThing(createThing({ url: INDEX }))
        .addIri(RDF.type, "http://www.w3.org/ns/dcat#Catalog")
        .addStringNoLocale(DCTERMS.title, "The library")
        .build(),
    );
    vi.mocked(getSolidDataset).mockResolvedValue(index);

    await expect(makeLibrary().listLibraryDecks()).resolves.toEqual([]);
    expect(getSolidDataset).toHaveBeenCalledWith(INDEX, expect.objectContaining({ fetch }));
  });

  it("propagates a failed index read", async () => {
    vi.mocked(getSolidDataset).mockRejectedValue(new Error("offline"));
    await expect(makeLibrary().listLibraryDecks()).rejects.toThrow("offline");
  });
});

describe("readLibraryIndex", () => {
  it("reads what the index says that places a release", async () => {
    const index = setThing(
      mockSolidDatasetFrom(INDEX),
      buildThing(createThing({ url: INDEX }))
        .addIri(RDF.type, "http://www.w3.org/ns/dcat#Catalog")
        .addIri(DCTERMS.publisher, `${INDEX}#me`)
        .build(),
    );
    vi.mocked(getSolidDataset).mockResolvedValue(index);
    await expect(makeLibrary().readLibraryIndex()).resolves.toEqual({ url: INDEX, publisher: `${INDEX}#me`, releases: [] });
    expect(getSolidDataset).toHaveBeenCalledWith(INDEX, expect.objectContaining({ fetch }));
  });
});

describe("fetchLibraryDeck", () => {
  it("fetches the document and maps its content", async () => {
    vi.mocked(getSolidDataset).mockResolvedValue(deckDocument());

    await expect(makeLibrary().fetchLibraryDeck(DOC)).resolves.toEqual({
      url: DOC,
      title: { en: "Capitals" },
      formatVersion: 1,
      authors: [],
      description: { en: "Flashcards: Capitals.", sv: "Kortlek: Capitals." },
      direction: "front-to-back",
      version: "1",
      seriesUrl: expect.any(String),
      themes: ["http://publications.europa.eu/resource/authority/data-theme/EDUC"],
      keywords: {},
      cards: [
        { id: "sweden", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 },
      ],
    });
    expect(getSolidDataset).toHaveBeenCalledWith(DOC, expect.objectContaining({ fetch }));
  });

  it("reads a release once, for every reader of it, concurrent or later", async () => {
    vi.mocked(getSolidDataset).mockResolvedValue(deckDocument());
    const library = makeLibrary();
    const [first, second] = await Promise.all([library.fetchLibraryDeck(DOC), library.fetchLibraryDeck(DOC)]);
    expect(await library.fetchLibraryDeck(DOC)).toBe(first);
    expect(second).toBe(first);
    expect(getSolidDataset).toHaveBeenCalledTimes(1);
  });

  it("reads a release again after a failed read", async () => {
    vi.mocked(getSolidDataset).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(deckDocument());
    const library = makeLibrary();
    await expect(library.fetchLibraryDeck(DOC)).rejects.toThrow("offline");
    await expect(library.fetchLibraryDeck(DOC)).resolves.toMatchObject({ url: DOC });
    expect(getSolidDataset).toHaveBeenCalledTimes(2);
  });
});

describe("fetchCourseOutline", () => {
  /** The release, a course of one chapter of one step. */
  function courseDocument() {
    const chapter = buildThing(createThing({ url: `${DOC}#ch-1` }))
      .addIri(RDF.type, SM.Chapter)
      .addStringWithLocale(DCTERMS.title, "Nordic capitals", "en")
      .addIri("https://schema.org/isPartOf", DOC)
      .addInteger("https://schema.org/position", 0)
      .build();
    const step = buildThing(createThing({ url: `${DOC}#ch-1-1` }))
      .addIri(RDF.type, SM.Step)
      .addStringWithLocale(SM.theory, "Stockholm is the capital of Sweden.", "en")
      .addIri(SM.checkedBy, `${DOC}#sweden`)
      .addIri("https://schema.org/isPartOf", `${DOC}#ch-1`)
      .addInteger("https://schema.org/position", 0)
      .build();
    const document = deckDocument();
    const deck = buildThing(getThing(document, DOC)!).addIri(RDF.type, SCHEMA.Course).build();
    return setThing(setThing(setThing(document, chapter), step), deck);
  }

  it("reads the outline from the same read of the release as its content", async () => {
    vi.mocked(getSolidDataset).mockResolvedValue(courseDocument());
    const library = makeLibrary();
    const [outline, content] = await Promise.all([library.fetchCourseOutline(DOC), library.fetchLibraryDeck(DOC)]);
    expect(outline).toEqual({
      releaseUrl: DOC,
      chapters: [
        {
          id: "ch-1",
          url: `${DOC}#ch-1`,
          position: 0,
          title: { en: "Nordic capitals" },
          steps: [{ id: "ch-1-1", url: `${DOC}#ch-1-1`, position: 0, theory: { en: "Stockholm is the capital of Sweden." }, questionIds: ["sweden"] }],
          reviewQuestionIds: [],
        },
      ],
    });
    expect(content.isCourse).toBe(true);
    expect(await library.fetchCourseOutline(DOC)).toBe(outline);
    expect(getSolidDataset).toHaveBeenCalledTimes(1);
  });

  it("reads the release again after a failed read", async () => {
    vi.mocked(getSolidDataset).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(deckDocument());
    const library = makeLibrary();
    await expect(library.fetchCourseOutline(DOC)).rejects.toThrow("offline");
    await expect(library.fetchCourseOutline(DOC)).resolves.toEqual({ releaseUrl: DOC, chapters: [] });
  });
});
