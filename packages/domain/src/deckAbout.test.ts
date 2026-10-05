import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import { parseKeywords, topicsOfDeck, withAbout } from "./deckAbout";

const TOPIC = "https://pod.solid-memo.com/vocab/topics#";
const EDUC = "http://publications.europa.eu/resource/authority/data-theme/EDUC";
const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/c.ttl#deck-1",
  title: { en: "Capitals" },
  cardsDocumentUrl: "https://pod.example/d.ttl",
  reviewsDocumentUrl: "https://pod.example/r.ttl",
  createdAt: "",
  formatVersion: 3,
  direction: "front-to-back",
  authors: [],
  description: { en: "Old." },
  themes: [EDUC, `${TOPIC}geography`],
  keywords: { en: ["old"], "": ["legacy"] },
};

describe("topicsOfDeck", () => {
  it("picks the topics among the deck's themes", () => {
    expect(topicsOfDeck(deck)).toEqual([`${TOPIC}geography`]);
    expect(topicsOfDeck({ ...deck, themes: undefined })).toEqual([]);
  });
});

describe("parseKeywords", () => {
  it("splits on commas, trims, drops empty and repeated keywords", () => {
    expect(parseKeywords(" capitals, countries ,, capitals ")).toEqual(["capitals", "countries"]);
    expect(parseKeywords("")).toEqual([]);
  });
});

describe("withAbout", () => {
  it("replaces the description, the topics and the keywords, keeping other themes", () => {
    expect(
      withAbout(deck, { description: { en: "  Every capital. " }, topics: [`${TOPIC}languages`], keywords: { en: ["new"], SV: [" ny "] } }),
    ).toEqual({ ...deck, description: { en: "Every capital." }, themes: [EDUC, `${TOPIC}languages`], keywords: { en: ["new"], sv: ["ny"] } });
  });

  it("keeps the deck's untagged keywords as they are, and asks for the language of new ones", () => {
    expect(withAbout(deck, { description: { en: "x" }, topics: [], keywords: { "": ["legacy"], sv: ["ny"] } }).keywords).toEqual({
      "": ["legacy"],
      sv: ["ny"],
    });
    expect(() => withAbout(deck, { description: { en: "x" }, topics: [], keywords: { "": ["legacy", "new"] } })).toThrow(
      "Choose the language of the keywords.",
    );
  });

  it("saves the description in the languages given, in any language, leaving out a cleared one", () => {
    expect(withAbout(deck, { description: { sv: "Ny.", ja: "新しい", en: " " }, topics: [], keywords: {} }).description).toEqual({
      sv: "Ny.",
      ja: "新しい",
    });
  });

  it("gives a deck without themes the topics it names", () => {
    expect(withAbout({ ...deck, themes: undefined }, { description: { en: "x" }, topics: [`${TOPIC}languages`], keywords: {} }).themes).toEqual([
      `${TOPIC}languages`,
    ]);
  });

  it("leaves out themes and keywords when there are none", () => {
    const bare = withAbout({ ...deck, themes: [`${TOPIC}geography`] }, { description: { en: "x" }, topics: [], keywords: {} });
    expect(bare).not.toHaveProperty("themes");
    expect(bare).not.toHaveProperty("keywords");
    const cleared = withAbout(deck, { description: { en: "x" }, topics: [], keywords: { en: [" "], sv: [] } });
    expect(cleared).not.toHaveProperty("keywords");
  });

  it("refuses an empty description", () => {
    expect(() => withAbout(deck, { description: { en: "  ", sv: "" }, topics: [], keywords: {} })).toThrow(
      "A deck needs a description.",
    );
    expect(() => withAbout(deck, { description: {}, topics: [], keywords: {} })).toThrow("A deck needs a description.");
  });
});
