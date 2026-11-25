// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Card, Deck } from "./deck";
import type { CourseChapter } from "./course";
import {
  cardLanguageTag,
  preferableCardLanguages,
  preferableCourseLanguages,
  withCardLanguage,
} from "./deckCardLanguage";

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/c.ttl#deck-1",
  title: { en: "Capitals" },
  cardsDocumentUrl: "https://pod.example/d.ttl",
  reviewsDocumentUrl: "https://pod.example/r.ttl",
  createdAt: "",
  formatVersion: 6,
  direction: "front-to-back",
  authors: [],
};

function card(id: string, front: Card["front"], back: Card["back"]): Card {
  return {
    id,
    url: `https://pod.example/d.ttl#${id}`,
    front,
    back,
    createdAt: "2026-10-01T10:00:00.000Z",
    formatVersion: 7,
  };
}

describe("cardLanguageTag", () => {
  it("is the tag as the app stores it", () => {
    expect(cardLanguageTag("sv")).toBe("sv");
    expect(cardLanguageTag("PT-br")).toBe("pt-br");
  });

  it("is undefined for a value that names no language, or text in no language", () => {
    expect(cardLanguageTag("Swedish")).toBeUndefined();
    expect(cardLanguageTag("")).toBeUndefined();
    expect(cardLanguageTag("zxx")).toBeUndefined();
  });
});

describe("withCardLanguage", () => {
  it("sets the card language, in lower case", () => {
    expect(withCardLanguage(deck, "sv")).toEqual({ ...deck, cardLanguage: "sv" });
    expect(withCardLanguage(deck, "PT-br")).toEqual({ ...deck, cardLanguage: "pt-br" });
    expect(withCardLanguage({ ...deck, cardLanguage: "sv" }, "ko")).toEqual({
      ...deck,
      cardLanguage: "ko",
    });
  });

  it("clears it for null, back to the usual order", () => {
    expect(withCardLanguage({ ...deck, cardLanguage: "sv" }, null)).toEqual(deck);
    expect(withCardLanguage(deck, null)).toEqual(deck);
  });

  it("refuses a tag that names no language, and text in no language", () => {
    expect(() => withCardLanguage(deck, "Swedish")).toThrow("“Swedish” is not a language code.");
    expect(() => withCardLanguage(deck, "zxx")).toThrow("“zxx” is not a language code.");
  });
});

describe("preferableCardLanguages", () => {
  it("offers the cards' stated languages, without untagged text or text in no language", () => {
    const cards = [
      card("a", { en: "house", sv: "hus" }, { sv: "hus" }),
      card("b", { "": "untagged" }, { zxx: "404" }),
      card("c", { "en-gb": "colour" }, { fr: "couleur" }),
    ];
    expect(preferableCardLanguages(cards)).toEqual(["en", "en-gb", "fr", "sv"]);
    expect(preferableCardLanguages([])).toEqual([]);
  });
});

describe("preferableCourseLanguages", () => {
  function chapter(
    title: CourseChapter["title"],
    description: CourseChapter["description"],
    theories: CourseChapter["title"][],
  ): CourseChapter {
    return {
      id: "ch-1",
      url: "https://library.example/c.ttl#ch-1",
      position: 1,
      title,
      description,
      steps: theories.map((theory, index) => ({
        id: `step-${index}`,
        url: `https://library.example/c.ttl#step-${index}`,
        position: index,
        theory,
        questionIds: [],
      })),
      reviewQuestionIds: [],
    };
  }

  it("offers the languages of its cards, its release's and its own text, in order", () => {
    const release = {
      title: { en: "Basics", de: "Grundlagen" },
      description: { en: "About", "": "untagged" },
      cards: [{ ...card("q-1", { en: "Q", ko: "질문" }, { en: "A" }), formatVersion: 7 }],
    };
    const outline = {
      chapters: [
        chapter({ en: "One", es: "Uno" }, { fr: "Un" }, [{ en: "Theory", sv: "Teori" }]),
        chapter({ en: "Two" }, undefined, [{ zxx: "404" }]),
      ],
    };
    const cards = [card("mine", { ar: "بيت" }, { en: "house" })];
    expect(preferableCourseLanguages(cards, release, outline)).toEqual([
      "ar",
      "de",
      "en",
      "es",
      "fr",
      "ko",
      "sv",
    ]);
  });

  it("offers the release's languages before any question is answered", () => {
    const release = { title: { en: "Basics", sv: "Grunder" }, cards: [] };
    expect(preferableCourseLanguages([], release, { chapters: [] })).toEqual(["en", "sv"]);
  });
});
