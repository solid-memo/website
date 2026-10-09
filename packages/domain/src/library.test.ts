import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import {
  filterLibraryDecks,
  isCopyOf,
  libraryCopiesOf,
  offersNewerRelease,
  topicLabels,
  topicsOf,
  type LibraryDeck,
} from "./library";

const TOPIC = "https://solid-memo.com/ns/vocab/topics.ttl#";
const EDUC = "http://publications.europa.eu/resource/authority/data-theme/EDUC";

function libraryDeck(name: string, themes: string[], extra: Partial<LibraryDeck> = {}): LibraryDeck {
  const url = `https://solid-memo.com/decks/${name}/v2.ttl`;
  return {
    url,
    seriesUrl: `https://solid-memo.com/decks/index.ttl#${name}`,
    version: "2",
    releases: [],
    title: { en: name },
    cardCount: 1,
    authors: [],
    direction: "front-to-back",
    sources: [],
    themes: [EDUC, ...themes],
    keywords: {},
    ...extra,
  };
}

const capitals = libraryDeck("capitals", [`${TOPIC}geography`], { description: { en: "Every country's capital." } });
const nouns = libraryDeck("swedish-nouns", [`${TOPIC}swedish`], { keywords: { en: ["Vocabulary"], sv: ["Ordförråd"] } });
const http = libraryDeck("http", [`${TOPIC}computing`]);

describe("isCopyOf", () => {
  const deck = { sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl" } as Deck;

  it("matches a copy of any release of the deck", () => {
    expect(isCopyOf(deck, capitals)).toBe(true);
    expect(isCopyOf({ sourceUrl: "https://solid-memo.com/decks/capitals/v3.ttl" } as Deck, capitals)).toBe(true);
    expect(isCopyOf(deck, http)).toBe(false);
    expect(isCopyOf({} as Deck, capitals)).toBe(false);
  });
});

describe("offersNewerRelease and libraryCopiesOf", () => {
  const v1 = "https://solid-memo.com/decks/capitals/v1.ttl";
  const v2 = "https://solid-memo.com/decks/capitals/v2.ttl";
  const series = { ...capitals, releases: [{ url: v1, version: "1" }, { url: v2, version: "2" }] };
  const copy = (id: string, sourceUrl?: string) => ({ id, ...(sourceUrl === undefined ? {} : { sourceUrl }) }) as Deck;

  it("tell a copy of an older release from one of the current release, or of one listed as no older", () => {
    expect(offersNewerRelease(copy("a", v1), series)).toBe(true);
    expect(offersNewerRelease(copy("a", v2), series)).toBe(false);
    expect(offersNewerRelease(copy("a", v1), { ...series, url: "https://solid-memo.com/decks/capitals/v3.ttl", version: "1" })).toBe(false);
    // A release the index does not list may be older.
    expect(offersNewerRelease(copy("a", "https://solid-memo.com/decks/capitals/v0.ttl"), series)).toBe(true);
  });

  it("list each copy with its deck in the library and its version, leaving home-made decks out", () => {
    const decks = [copy("a", v1), copy("home"), copy("b", v2), copy("gone", "https://solid-memo.com/decks/gone/v1.ttl"), copy("c", "https://solid-memo.com/decks/capitals/v9.ttl")];
    expect(libraryCopiesOf(decks, [http, series])).toEqual([
      { deck: decks[0], series, version: "1", newer: true },
      { deck: decks[2], series, version: "2", newer: false },
      { deck: decks[3], series: null, version: null, newer: false },
      { deck: decks[4], series, version: null, newer: true },
    ]);
  });
});

describe("topicsOf and topicLabels", () => {
  it("list the topics the decks name, with the broader topics above them, in the scheme's order", () => {
    expect(topicsOf([nouns, capitals]).map((t) => t.label.en)).toEqual(["Languages", "Swedish", "Geography"]);
    expect(topicsOf([nouns]).map((t) => t.label.sv)).toEqual(["Språk", "Svenska"]);
    expect(topicsOf([])).toEqual([]);
  });

  it("label a deck's topics, leaving out the EU themes", () => {
    expect(topicLabels(nouns.themes)).toEqual([{ en: "Swedish", ko: "스웨덴어", sv: "Svenska" }]);
    expect(topicLabels([EDUC])).toEqual([]);
  });
});

describe("filterLibraryDecks", () => {
  const decks = [capitals, nouns, http];

  it("keeps every deck when nothing is chosen or typed", () => {
    expect(filterLibraryDecks(decks, { topics: [], query: "  " })).toEqual(decks);
  });

  it("keeps the decks about every chosen topic, a narrower topic included", () => {
    expect(filterLibraryDecks(decks, { topics: [`${TOPIC}languages`], query: "" })).toEqual([nouns]);
    expect(filterLibraryDecks(decks, { topics: [`${TOPIC}geography`], query: "" })).toEqual([capitals]);
    expect(filterLibraryDecks(decks, { topics: [`${TOPIC}geography`, `${TOPIC}computing`], query: "" })).toEqual([]);
  });

  it("keeps the decks whose name, description or keywords contain the query, whatever the case", () => {
    expect(filterLibraryDecks(decks, { topics: [], query: "HTTP" })).toEqual([http]);
    expect(filterLibraryDecks(decks, { topics: [], query: "capital" })).toEqual([capitals]);
    expect(filterLibraryDecks(decks, { topics: [], query: "vocabulary" })).toEqual([nouns]);
  });

  it("searches the keywords in every language, not only the reader's", () => {
    expect(filterLibraryDecks(decks, { topics: [], query: "ordförråd" })).toEqual([nouns]);
  });

  it("finds composed text with a decomposed query, and decomposed text with a composed one", () => {
    const korean = libraryDeck("korean-nouns", [`${TOPIC}korean`], { keywords: { ko: ["사람"] } });
    const decomposed = libraryDeck("decomposed", [], { description: { en: "Cafe\u0301 words" } });
    expect(filterLibraryDecks([...decks, korean], { topics: [], query: "사람".normalize("NFD") })).toEqual([korean]);
    expect(filterLibraryDecks([...decks, decomposed], { topics: [], query: "CAFÉ" })).toEqual([decomposed]);
    expect(filterLibraryDecks(decks, { topics: [], query: "ordfo\u0308rra\u030Ad" })).toEqual([nouns]);
  });
});
