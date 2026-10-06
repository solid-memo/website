import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import {
  filterLibraryDecks,
  isCopyOf,
  topicLabels,
  topicsOf,
  type LibraryDeck,
} from "./library";

const TOPIC = "https://solid-memo.com/ns/vocab/topics.ttl#";
const EDUC = "http://publications.europa.eu/resource/authority/data-theme/EDUC";

function libraryDeck(name: string, themes: string[], extra: Partial<LibraryDeck> = {}): LibraryDeck {
  const url = `https://pod.solid-memo.com/library/decks/${name}/v2`;
  return {
    url,
    seriesUrl: `https://pod.solid-memo.com/library/decks/index#${name}`,
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
  const deck = { sourceUrl: "https://pod.solid-memo.com/library/decks/capitals/v1" } as Deck;

  it("matches a copy of any release of the deck, or of its document from before releases", () => {
    expect(isCopyOf(deck, capitals)).toBe(true);
    expect(isCopyOf({ sourceUrl: "https://pod.solid-memo.com/library/decks/capitals/1.ttl" } as Deck, capitals)).toBe(true);
    expect(isCopyOf({ sourceUrl: "https://pod.solid-memo.com/library/decks/capitals.ttl" } as Deck, capitals)).toBe(true);
    expect(isCopyOf(deck, http)).toBe(false);
    expect(isCopyOf({} as Deck, capitals)).toBe(false);
  });
});

describe("topicsOf and topicLabels", () => {
  it("list the topics the decks name, with the broader topics above them, in the scheme's order", () => {
    expect(topicsOf([nouns, capitals]).map((t) => t.label.en)).toEqual(["Languages", "Swedish", "Geography"]);
    expect(topicsOf([nouns]).map((t) => t.label.sv)).toEqual(["Språk", "Svenska"]);
    expect(topicsOf([])).toEqual([]);
  });

  it("label a deck's topics, leaving out the EU themes", () => {
    expect(topicLabels(nouns.themes)).toEqual([{ en: "Swedish", sv: "Svenska" }]);
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
});
