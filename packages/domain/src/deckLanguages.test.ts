import { describe, expect, it } from "vitest";
import type { CardContent } from "./deck";
import {
  deckLanguageIssues,
  deckLanguages,
  hasUnstatedSide,
  unlikeRelease,
  withStatedLanguages,
} from "./deckLanguages";

function card(id: string, content: Partial<CardContent>): CardContent & { id: string } {
  return { id, front: {}, back: {}, ...content };
}

describe("a deck's languages", () => {
  it("finds the tags the fronts, the backs and the user's own text usually have", () => {
    const cards = [
      card("a", { front: { sv: "en bil" }, back: { en: "a car" }, backLabel: { fi: "Auto" } }),
      card("b", { front: { sv: "ett hus" }, back: { en: "a house", de: "ein Haus" }, frontNote: { fi: "Vanha" } }),
      card("c", { front: { "": "en båt" }, back: { de: "ein Boot" }, frontImageDescription: { sv: "En båt" } }),
      card("d", { front: {}, back: { en: "a picture" }, backImageDescription: { fi: "Kuva" }, backNote: { fi: "Huom" } }),
    ];
    expect(deckLanguages(cards)).toEqual({
      front: "sv",
      back: "en",
      own: "fi",
      unstatedCounts: { front: 1, back: 0 },
    });
  });

  it("states no tag where no text has one", () => {
    expect(deckLanguages([card("a", { front: { "": "404" }, back: { "": "Not Found" } })])).toEqual({
      unstatedCounts: { front: 1, back: 1 },
    });
    expect(deckLanguages([])).toEqual({ unstatedCounts: { front: 0, back: 0 } });
  });

  it("takes the user's own text saved the same in several languages as text in each of them", () => {
    const cards = [
      card("a", { front: { sv: "hund" }, back: { en: "dog" }, backLabel: { en: "Ord", sv: "Ord" } }),
      card("b", { front: { sv: "katt" }, back: { en: "cat" }, frontNote: { sv: "Vardagligt", it: "Vardagligt" } }),
    ];
    expect(deckLanguages(cards).own).toBe("sv");
  });

  it("leaves a card still as its library release has it out of what is to settle, but not of the usual tags", () => {
    const released = card("a", { front: { "": "Fe" }, back: { en: "iron" }, backNote: { en: "Metall", sv: "Metall" } });
    const changed = card("b", { front: { "": "Cu" }, back: { en: "copper" } });
    const cards = [
      released,
      { ...changed, back: { en: "copper (Cu)" } },
      card("c", { front: { "": "Au" }, back: { en: "gold" }, frontNote: { en: "Ädel", sv: "Ädel" } }),
    ];
    expect(deckLanguages(cards, [released, changed])).toEqual({
      back: "en",
      own: "en",
      unstatedCounts: { front: 2, back: 0 },
    });
  });
});

describe("stating the language of a deck's untagged sides", () => {
  it("leaves out the cards still as their library release has them", () => {
    const released = card("a", { front: { "": "Fe" }, back: { en: "iron" } });
    const changed = card("b", { front: { "": "Cu" }, back: { en: "copper (Cu)" } });
    const own = card("c", { front: { "": "Au" }, back: { en: "gold" } });
    expect(unlikeRelease([released, changed, own], [released, { ...changed, back: { en: "copper" } }])).toEqual([
      changed,
      own,
    ]);
    expect(unlikeRelease([released])).toEqual([released]);
  });

  it("leaves out a card that only lost its release's text format, which the next release brings back", () => {
    const MARKDOWN = "https://solid-memo.com/ns/vocab/v1.ttl#markdown";
    const PLAIN = "https://solid-memo.com/ns/vocab/v1.ttl#plainText";
    const copy = card("a", { front: { "": "`Fe`" }, back: { en: "iron" } });
    const release = [{ ...copy, textFormat: MARKDOWN }];
    expect(unlikeRelease([copy], release)).toEqual([]);
    // Switched to plain text, the card is the user's.
    expect(unlikeRelease([{ ...copy, textFormat: PLAIN }], release)).toEqual([{ ...copy, textFormat: PLAIN }]);
  });

  it("moves an untagged side's text under the language stated, touching nothing else", () => {
    const untagged = card("a", { front: { "": "hund" }, back: { "": "dog" }, frontNote: { sv: "Vanligt" } });
    expect(withStatedLanguages(untagged, { front: "sv" })).toEqual({ ...untagged, front: { sv: "hund" } });
    expect(withStatedLanguages(untagged, { front: "sv", back: "en" })).toEqual({
      ...untagged,
      front: { sv: "hund" },
      back: { en: "dog" },
    });
    expect(untagged.front).toEqual({ "": "hund" });
  });

  it("changes nothing where a side states its language, has no text, or mixes both", () => {
    const tagged = card("a", { front: { sv: "hund" }, back: {}, backImageUrl: "https://example.org/dog.png" });
    expect(withStatedLanguages(tagged, { front: "fi", back: "en" })).toBeNull();
    expect(withStatedLanguages(card("b", { front: { "": "hund", sv: "hund" }, back: { en: "dog" } }), { front: "fi" })).toBeNull();
    expect(withStatedLanguages(card("c", { front: { "": "hund" }, back: { en: "dog" } }), {})).toBeNull();
  });
});

describe("a card's unstated sides", () => {
  it("are its untagged front or back", () => {
    expect(hasUnstatedSide(card("a", { front: { "": "Fe" }, back: { en: "iron" } }))).toBe(true);
    expect(hasUnstatedSide(card("b", { front: { sv: "järn" }, back: { "": "Fe" } }))).toBe(true);
    expect(hasUnstatedSide(card("c", { front: { sv: "järn" }, back: { en: "iron" }, backNote: { "": "x" } }))).toBe(false);
  });

});

describe("a deck's language issues", () => {
  it("are none when every card side states its language, whatever text says the same in several", () => {
    expect(deckLanguageIssues({ unstatedCounts: { front: 0, back: 0 } })).toBeNull();
  });

  it("count the untagged card sides", () => {
    expect(deckLanguageIssues({ unstatedCounts: { front: 2, back: 1 } })).toEqual({ unstated: 3 });
  });
});
