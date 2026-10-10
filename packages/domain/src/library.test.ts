import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import {
  filterLibraryDecks,
  isCopyOf,
  libraryCopiesOf,
  newestRelease,
  offersNewerRelease,
  releaseHost,
  releaseUrlOf,
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

  it("matches a copy of a release published in a pod, its series named after its first version, by the releases it lists", () => {
    const v1 = "https://alice.example/memo/releases/capitals/v1.ttl";
    const v2 = "https://alice.example/memo/releases/capitals/v2.ttl";
    const published = libraryDeck("capitals", [], { url: v2, seriesUrl: `${v1}#series`, releases: [{ url: v1, version: "1" }] });
    expect(isCopyOf({ sourceUrl: v1 } as Deck, published)).toBe(true);
    expect(isCopyOf({ sourceUrl: v2 } as Deck, published)).toBe(true);
    expect(isCopyOf({ sourceUrl: "https://alice.example/memo/releases/capitals/v3.ttl" } as Deck, published)).toBe(false);
  });
});

describe("releaseUrlOf and releaseHost", () => {
  it("take an http(s) address of a document, as the URL standard writes it, and no other", () => {
    expect(releaseUrlOf("https://alice.example/memo/releases/capitals/v1.ttl")).toBe("https://alice.example/memo/releases/capitals/v1.ttl");
    expect(releaseUrlOf("http://alice.example/v1.ttl")).toBe("http://alice.example/v1.ttl");
    expect(releaseUrlOf("https://Alice.example/r/v1.ttl")).toBe("https://alice.example/r/v1.ttl");
    expect(releaseUrlOf("https://alice.example:443/r/v1.ttl")).toBe("https://alice.example/r/v1.ttl");
    expect(releaseUrlOf(" https://alice.example/v1.ttl")).toBe("https://alice.example/v1.ttl");
    for (const text of ["", "capitals", "ftp://alice.example/v1.ttl", "https://alice.example/v1.ttl#it", "https://alice.example/v1.ttl#", "https://alice.example/releases/", "https://alice.example"]) {
      expect(releaseUrlOf(text), text).toBeNull();
    }
  });

  it("name the host a release is published on, with its port", () => {
    expect(releaseHost("https://alice.example/v1.ttl")).toBe("alice.example");
    expect(releaseHost("https://127.0.0.1:8443/v1.ttl")).toBe("127.0.0.1:8443");
  });
});

describe("newestRelease", () => {
  const copied = libraryDeck("capitals", [], { version: "1" });
  it("is the newest release of the copied one's series found, else the copied one", () => {
    const v2 = { ...copied, url: "v2", version: "2" };
    const v3 = { ...copied, url: "v3", version: "3" };
    const other = { ...copied, url: "other", seriesUrl: "elsewhere", version: "9" };
    expect(newestRelease(copied, [v2, null, v3, other])).toBe(v3);
    expect(newestRelease(copied, [v3, v2])).toBe(v3);
    expect(newestRelease(copied, [other, null])).toBe(copied);
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
