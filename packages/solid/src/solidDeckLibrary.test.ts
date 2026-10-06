import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  getSolidDataset,
  mockSolidDatasetFrom,
  setThing,
} from "@inrupt/solid-client";
import { createSolidDeckLibrary } from "./solidDeckLibrary";
import { DCTERMS, RDF, SM } from "./vocab";

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
    expect(getSolidDataset).toHaveBeenCalledWith(INDEX, { fetch });
  });

  it("propagates a failed index read", async () => {
    vi.mocked(getSolidDataset).mockRejectedValue(new Error("offline"));
    await expect(makeLibrary().listLibraryDecks()).rejects.toThrow("offline");
  });
});

describe("fetchLibraryDeck", () => {
  it("fetches the document and maps its content", async () => {
    const document = setThing(
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
    vi.mocked(getSolidDataset).mockResolvedValue(document);

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
    expect(getSolidDataset).toHaveBeenCalledWith(DOC, { fetch });
  });
});
