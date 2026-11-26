// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "./appError";
import { MAX_PICTURE_HOSTS } from "./deckPictures";
import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import {
  activeCountOf,
  boundedCompletedChapters,
  boundedKeywords,
  cardLabel,
  cardLabelText,
  isCardIdPastBound,
  isDeckDirection,
  promptSides,
  isMarkdown,
  promptsOf,
  studyDirections,
  validateCardContent,
  MAX_CARD_ID_LENGTH,
  MAX_COMPLETED_CHAPTERS,
  MAX_DECK_KEYWORDS,
  MAX_DECK_METADATA,
  MAX_DECK_METADATA_CHARACTERS,
  refuseLongCardIds,
  withBoundedMetadata,
  type Card,
} from "./deck";

const FLAG = "https://flagcdn.com/h80/af.png";

describe("validateCardContent", () => {
  it("trims text and drops empty image fields", () => {
    expect(
      validateCardContent({
        front: { ja: " 水 " },
        back: { en: " water " },
        frontImageUrl: "  ",
        backImageUrl: "",
      }),
    ).toEqual({ ok: true, content: { front: { ja: "水" }, back: { en: "water" } } });
  });

  it("keeps the card's text format", () => {
    const MARKDOWN = "https://solid-memo.com/ns/vocab/v1.ttl#markdown";
    expect(
      validateCardContent({ front: { en: "**a**" }, back: { en: "b" }, textFormat: MARKDOWN }),
    ).toEqual({
      ok: true,
      content: { front: { en: "**a**" }, back: { en: "b" }, textFormat: MARKDOWN },
    });
  });

  it("keeps what the card is about, as the input states it or as the saved card has it", () => {
    const subjects = ["http://www.wikidata.org/entity/Q34"];
    const saved = { front: { en: "Sweden" }, back: { en: "Stockholm" }, subjects };
    expect(
      validateCardContent({ front: { en: "Sweden " }, back: { en: "Stockholm" } }, saved),
    ).toEqual({ ok: true, content: saved });
    const others = ["http://www.wikidata.org/entity/Q1754"];
    expect(validateCardContent({ ...saved, subjects: others }, saved)).toEqual({
      ok: true,
      content: { ...saved, subjects: others },
    });
    expect(validateCardContent({ front: { en: "a" }, back: { en: "b" } })).toEqual({
      ok: true,
      content: { front: { en: "a" }, back: { en: "b" } },
    });
  });

  it("keeps the spaces a formatted text starts with, a Markdown code block, through an edit of another field", () => {
    const MARKDOWN = "https://solid-memo.com/ns/vocab/v1.ttl#markdown";
    const PLAIN = "https://solid-memo.com/ns/vocab/v1.ttl#plainText";
    const saved = { front: { "": "    code\n" }, back: { en: "b" }, textFormat: MARKDOWN };
    // The editor states no text format: the saved card's is kept, and with it the code block.
    expect(
      validateCardContent({ front: { "": "\n  \n    code  \n" }, back: { en: "the b" } }, saved),
    ).toEqual({
      ok: true,
      content: { front: { "": "    code" }, back: { en: "the b" } },
    });
    expect(
      validateCardContent({
        front: { en: "    code" },
        back: { en: " b" },
        backNote: { en: "\n    note" },
        textFormat: MARKDOWN,
      }),
    ).toEqual({
      ok: true,
      content: {
        front: { en: "    code" },
        back: { en: " b" },
        backNote: { en: "    note" },
        textFormat: MARKDOWN,
      },
    });
    // Plain text, stated or not, is trimmed as ever.
    expect(
      validateCardContent({ front: { en: "    code" }, back: { en: "b" }, textFormat: PLAIN }),
    ).toEqual({
      ok: true,
      content: { front: { en: "code" }, back: { en: "b" }, textFormat: PLAIN },
    });
  });

  it("keeps a note under the answer, trimmed, and drops an empty one", () => {
    expect(
      validateCardContent({
        front: { sv: "Aktiemäklare" },
        back: { sv: "Finansmäklare" },
        backNote: { en: " Replaced in version 30. " },
      }),
    ).toEqual({
      ok: true,
      content: {
        front: { sv: "Aktiemäklare" },
        back: { sv: "Finansmäklare" },
        backNote: { en: "Replaced in version 30." },
      },
    });
    expect(
      validateCardContent({ front: { en: "a" }, back: { en: "b" }, backNote: { en: "  " } }),
    ).toEqual({ ok: true, content: { front: { en: "a" }, back: { en: "b" } } });
  });

  it("keeps a note's every language, trimmed, English or not", () => {
    expect(
      validateCardContent({
        front: { en: "a" },
        back: { en: "b" },
        backNote: { en: " Replaced. ", sv: " Ersatt. ", de: " " },
      }),
    ).toEqual({
      ok: true,
      content: {
        front: { en: "a" },
        back: { en: "b" },
        backNote: { en: "Replaced.", sv: "Ersatt." },
      },
    });
    expect(
      validateCardContent({
        front: { en: "a" },
        back: { en: "b" },
        frontNote: { en: "", sv: "Används inte längre" },
      }),
    ).toEqual({
      ok: true,
      content: { front: { en: "a" }, back: { en: "b" }, frontNote: { sv: "Används inte längre" } },
    });
    expect(
      validateCardContent({
        front: { en: "a" },
        back: { en: "b" },
        backLabel: { fi: "Pääkaupunki" },
      }),
    ).toEqual({
      ok: true,
      content: { front: { en: "a" }, back: { en: "b" }, backLabel: { fi: "Pääkaupunki" } },
    });
  });

  it("asks the language of a note, a label or a picture's description, never keeping untagged text", () => {
    const card = { front: { en: "a" }, back: { en: "b" } };
    expect(
      validateCardContent(
        { ...card, frontNote: { "": "Out of use" } },
        { ...card, frontNote: { "": "Out of use" } },
      ),
    ).toEqual({
      ok: false,
      error: new AppError("textNeedsLanguage", { field: "the note under the front" }),
      part: "frontNote",
    });
    expect(validateCardContent({ ...card, frontLabel: { "": "Country" } })).toEqual({
      ok: false,
      error: new AppError("textNeedsLanguage", { field: "the label above the front" }),
      part: "frontLabel",
    });
    expect(validateCardContent({ ...card, backLabel: { "": "Capital" } })).toMatchObject({
      ok: false,
      part: "backLabel",
    });
    expect(validateCardContent({ ...card, backNote: { "": "Since 1634" } })).toMatchObject({
      ok: false,
      part: "backNote",
    });
    expect(
      validateCardContent({
        ...card,
        frontImageUrl: FLAG,
        frontImageDescription: { "": "A flag" },
      }),
    ).toMatchObject({
      ok: false,
      part: "frontImageDescription",
    });
    expect(
      validateCardContent({ ...card, backImageUrl: FLAG, backImageDescription: { "": "A map" } }),
    ).toEqual({
      ok: false,
      error: new AppError("textNeedsLanguage", { field: "the back picture's description" }),
      part: "backImageDescription",
    });
  });

  it("keeps a side's untagged text only as the card saved it", () => {
    const saved = { front: { "": "水" }, back: { "": "water" } };
    // Untouched: kept as it is, whatever else changes.
    expect(
      validateCardContent(
        { ...saved, front: { "": " 水 " }, backNote: { en: "An element." } },
        saved,
      ),
    ).toEqual({
      ok: true,
      content: { ...saved, backNote: { en: "An element." } },
    });
    // Its language stated: tagged from now on.
    expect(validateCardContent({ ...saved, front: { ja: "水" } }, saved)).toEqual({
      ok: true,
      content: { ...saved, front: { ja: "水" } },
    });
    // Edited, or new: its language is asked.
    expect(validateCardContent({ ...saved, front: { "": "火" } }, saved)).toEqual({
      ok: false,
      error: new AppError("textNeedsLanguage", { field: "the front" }),
      part: "front",
    });
    expect(validateCardContent({ front: { ja: "水" }, back: { "": "water" } })).toEqual({
      ok: false,
      error: new AppError("textNeedsLanguage", { field: "the back" }),
      part: "back",
    });
    expect(
      validateCardContent(
        { front: { ja: "水" }, back: { "": "water" } },
        { front: { ja: "水" }, back: {} },
      ),
    ).toMatchObject({
      ok: false,
      part: "back",
    });
    // Untagged and tagged text never mix: a translation needs the text's language first.
    expect(validateCardContent({ ...saved, back: { "": "water", sv: "vatten" } }, saved)).toEqual({
      ok: false,
      error: new AppError("textMixesUnstated"),
      part: "back",
    });
  });

  it("keeps a picture's description in any language, trimmed, and drops one with no text or no picture", () => {
    expect(
      validateCardContent({
        front: {},
        back: { en: "Sweden" },
        frontImageUrl: FLAG,
        frontImageDescription: { sv: " En flagga med ett gult kors " },
        backImageDescription: { en: "Nothing to describe" },
      }),
    ).toEqual({
      ok: true,
      content: {
        front: {},
        back: { en: "Sweden" },
        frontImageUrl: FLAG,
        frontImageDescription: { sv: "En flagga med ett gult kors" },
      },
    });
    expect(
      validateCardContent({
        front: { en: "a" },
        back: { en: "b" },
        backImageUrl: FLAG,
        backImageDescription: { en: " " },
      }),
    ).toEqual({ ok: true, content: { front: { en: "a" }, back: { en: "b" }, backImageUrl: FLAG } });
    expect(
      validateCardContent({
        front: { en: "a" },
        back: {},
        backImageUrl: FLAG,
        backImageDescription: { en: "A flag" },
      }),
    ).toEqual({
      ok: true,
      content: {
        front: { en: "a" },
        back: {},
        backImageUrl: FLAG,
        backImageDescription: { en: "A flag" },
      },
    });
  });

  it("keeps a note under the front, trimmed, and drops an empty one", () => {
    expect(
      validateCardContent({
        front: { sv: "Aktiemäklare" },
        back: { sv: "Finansmäklare" },
        frontNote: { en: " Out of use " },
      }),
    ).toEqual({
      ok: true,
      content: {
        front: { sv: "Aktiemäklare" },
        back: { sv: "Finansmäklare" },
        frontNote: { en: "Out of use" },
      },
    });
    expect(
      validateCardContent({ front: { en: "a" }, back: { en: "b" }, frontNote: { en: " " } }),
    ).toEqual({ ok: true, content: { front: { en: "a" }, back: { en: "b" } } });
  });

  it("keeps a label above the front, trimmed, and drops an empty one", () => {
    expect(
      validateCardContent({
        front: { en: "Croatia", sv: "Kroatien" },
        back: { en: "Zagreb" },
        frontLabel: { en: " Country ", sv: "Land" },
      }),
    ).toEqual({
      ok: true,
      content: {
        front: { en: "Croatia", sv: "Kroatien" },
        back: { en: "Zagreb" },
        frontLabel: { en: "Country", sv: "Land" },
      },
    });
    expect(
      validateCardContent({ front: { en: "a" }, back: { en: "b" }, frontLabel: { en: " " } }),
    ).toEqual({ ok: true, content: { front: { en: "a" }, back: { en: "b" } } });
  });

  it("keeps a label above the back, trimmed, and drops an empty one", () => {
    expect(
      validateCardContent({
        front: { en: "Sweden" },
        back: { en: "Stockholm" },
        backLabel: { en: " Capital " },
      }),
    ).toEqual({
      ok: true,
      content: { front: { en: "Sweden" }, back: { en: "Stockholm" }, backLabel: { en: "Capital" } },
    });
    expect(
      validateCardContent({ front: { en: "a" }, back: { en: "b" }, backLabel: { en: "" } }),
    ).toEqual({ ok: true, content: { front: { en: "a" }, back: { en: "b" } } });
  });

  it("accepts a picture-only side, trimming the URL", () => {
    expect(
      validateCardContent({
        front: {},
        back: { en: "Afghanistan" },
        frontImageUrl: ` ${FLAG} `,
      }),
    ).toEqual({
      ok: true,
      content: { front: {}, back: { en: "Afghanistan" }, frontImageUrl: FLAG },
    });
  });

  it("percent-encodes what a pod cannot hold in a picture's URL, the rest as typed", () => {
    expect(
      validateCardContent({
        front: {},
        back: { en: "Mona Lisa" },
        frontImageUrl: "https://Upload.example/a/Mona Lisa.jpg?x=a|b{c}#f>g",
      }),
    ).toEqual({
      ok: true,
      content: {
        front: {},
        back: { en: "Mona Lisa" },
        frontImageUrl: "https://Upload.example/a/Mona%20Lisa.jpg?x=a%7Cb%7Bc%7D#f%3Eg",
      },
    });
  });

  it("accepts pictures on both sides, with or without text", () => {
    expect(
      validateCardContent({
        front: { en: "Flag" },
        back: {},
        frontImageUrl: FLAG,
        backImageUrl: "http://example.org/map.png",
      }),
    ).toEqual({
      ok: true,
      content: {
        front: { en: "Flag" },
        back: {},
        frontImageUrl: FLAG,
        backImageUrl: "http://example.org/map.png",
      },
    });
  });

  it("requires text or an image on each side", () => {
    expect(validateCardContent({ front: { en: " " }, back: { en: "b" } })).toEqual({
      ok: false,
      error: new AppError("cardFrontEmpty"),
    });
    expect(validateCardContent({ front: {}, back: {}, frontImageUrl: FLAG })).toEqual({
      ok: false,
      error: new AppError("cardBackEmpty"),
    });
  });

  it("rejects images that are not http(s) URLs", () => {
    expect(
      validateCardContent({
        front: { en: "f" },
        back: { en: "b" },
        frontImageUrl: "/data/flags/h80/af.png",
      }),
    ).toEqual({ ok: false, error: new AppError("cardFrontImageNotWebUrl") });
    expect(
      validateCardContent({
        front: { en: "f" },
        back: { en: "b" },
        backImageUrl: "javascript:alert(1)",
      }),
    ).toEqual({ ok: false, error: new AppError("cardBackImageNotWebUrl") });
  });

  it("tidies the distractors it is given, keeping their ids and retirement, and refuses one without text", () => {
    const MARKDOWN = "https://solid-memo.com/ns/vocab/v1.ttl#markdown";
    const card = { front: { en: "f" }, back: { en: "b" } };
    expect(
      validateCardContent({
        ...card,
        distractors: [
          { id: "c-d1", text: { en: " one " }, note: { en: " " } },
          { id: "c-d2", text: { en: "two" }, note: { sv: " Fel. " }, retired: true },
        ],
      }),
    ).toEqual({
      ok: true,
      content: {
        ...card,
        distractors: [
          { id: "c-d1", text: { en: "one" } },
          { id: "c-d2", text: { en: "two" }, note: { sv: "Fel." }, retired: true },
        ],
      },
    });
    expect(
      validateCardContent({
        ...card,
        textFormat: MARKDOWN,
        distractors: [{ id: "c-d1", text: { en: "    code" } }],
      }),
    ).toMatchObject({
      ok: true,
      content: { distractors: [{ id: "c-d1", text: { en: "    code" } }] },
    });
    expect(
      validateCardContent({ ...card, distractors: [{ id: "c-d1", text: { en: " " } }] }),
    ).toEqual({
      ok: false,
      error: new AppError("distractorEmpty"),
    });
    expect(validateCardContent({ ...card, distractors: [] })).toEqual({
      ok: true,
      content: { ...card, distractors: [] },
    });
  });

  it("refuses two distractors of one id, as they would be written to one subject", () => {
    const card = { front: { en: "a" }, back: { en: "b" } };
    expect(
      validateCardContent({
        ...card,
        distractors: [
          { id: "c-d1", text: { en: "x" } },
          { id: "c-d2", text: { en: "y" } },
          { id: "c-d1", text: { en: "z" } },
        ],
      }),
    ).toEqual({ ok: false, error: new AppError("distractorIdRepeated") });
  });

  it("asks nothing of the distractors a card was saved with when it is not given any", () => {
    const saved = {
      front: { en: "a" },
      back: { en: "b" },
      distractors: [
        { id: "c-d1", text: { en: "x" } },
        { id: "c-d1", text: { en: "y" } },
      ],
    };
    expect(validateCardContent({ front: { en: "a2" }, back: { en: "b" } }, saved)).toEqual({
      ok: true,
      content: { front: { en: "a2" }, back: { en: "b" } },
    });
  });
});

describe("deck directions", () => {
  const sweden: Card = {
    id: "sweden",
    url: "https://pod.example/decks/d.ttl#sweden",
    front: { "": "Sweden" },
    back: { "": "Stockholm" },
    backImageUrl: FLAG,
    createdAt: "2026-09-01T00:00:00.000Z",
    formatVersion: 2,
  };
  const norway: Card = { ...sweden, id: "norway", front: { "": "Norway" }, back: { "": "Oslo" } };

  it("recognizes the three directions and nothing else", () => {
    expect(isDeckDirection("front-to-back")).toBe(true);
    expect(isDeckDirection("back-to-front")).toBe(true);
    expect(isDeckDirection("bidirectional")).toBe(true);
    expect(isDeckDirection("sideways")).toBe(false);
  });

  it("studies a one-way deck one way and a bidirectional deck both ways", () => {
    expect(studyDirections("front-to-back")).toEqual(["front-to-back"]);
    expect(studyDirections("back-to-front")).toEqual(["back-to-front"]);
    expect(studyDirections("bidirectional")).toEqual(["front-to-back", "back-to-front"]);
  });

  it("makes the deck's prompts card by card", () => {
    expect(promptsOf([sweden, norway], "back-to-front")).toEqual([
      { card: sweden, direction: "back-to-front" },
      { card: norway, direction: "back-to-front" },
    ]);
    expect(promptsOf([sweden, norway], "bidirectional")).toEqual([
      { card: sweden, direction: "front-to-back" },
      { card: sweden, direction: "back-to-front" },
      { card: norway, direction: "front-to-back" },
      { card: norway, direction: "back-to-front" },
    ]);
  });

  it("asks the front and answers with the back, or the reverse", () => {
    expect(promptSides({ card: sweden, direction: "front-to-back" })).toEqual({
      question: { side: "front", text: { "": "Sweden" } },
      answer: { side: "back", text: { "": "Stockholm" }, imageUrl: FLAG },
    });
    expect(promptSides({ card: sweden, direction: "back-to-front" })).toEqual({
      question: { side: "back", text: { "": "Stockholm" }, imageUrl: FLAG },
      answer: { side: "front", text: { "": "Sweden" } },
    });
    const noted = {
      ...sweden,
      frontNote: { en: "A kingdom." },
      backNote: { en: "The capital since 1634." },
    };
    expect(promptSides({ card: noted, direction: "front-to-back" })).toEqual({
      question: { side: "front", text: { "": "Sweden" }, note: { en: "A kingdom." } },
      answer: {
        side: "back",
        text: { "": "Stockholm" },
        imageUrl: FLAG,
        note: { en: "The capital since 1634." },
      },
    });
    expect(promptSides({ card: noted, direction: "back-to-front" })).toEqual({
      question: {
        side: "back",
        text: { "": "Stockholm" },
        imageUrl: FLAG,
        note: { en: "The capital since 1634." },
      },
      answer: { side: "front", text: { "": "Sweden" }, note: { en: "A kingdom." } },
    });
    const described = {
      ...sweden,
      frontImageUrl: FLAG,
      frontImageDescription: { en: "A blue flag" },
      backImageDescription: { en: "The same flag" },
    };
    expect(promptSides({ card: described, direction: "front-to-back" })).toEqual({
      question: {
        side: "front",
        text: { "": "Sweden" },
        imageUrl: FLAG,
        imageDescription: { en: "A blue flag" },
      },
      answer: {
        side: "back",
        text: { "": "Stockholm" },
        imageUrl: FLAG,
        imageDescription: { en: "The same flag" },
      },
    });
    const labeled = { ...sweden, backLabel: { en: "Capital" } };
    expect(promptSides({ card: labeled, direction: "front-to-back" }).answer).toMatchObject({
      side: "back",
      label: { en: "Capital" },
    });
    expect(promptSides({ card: labeled, direction: "back-to-front" }).question).toMatchObject({
      side: "back",
      label: { en: "Capital" },
    });
    // The front's label shows with the front, as the question or the answer.
    const both = { ...labeled, frontLabel: { en: "Country" } };
    expect(promptSides({ card: both, direction: "front-to-back" }).question).toMatchObject({
      side: "front",
      label: { en: "Country" },
    });
    expect(promptSides({ card: both, direction: "back-to-front" })).toMatchObject({
      question: { side: "back", label: { en: "Capital" } },
      answer: { side: "front", label: { en: "Country" } },
    });
    const flagOnly = { ...sweden, frontImageUrl: FLAG, backImageUrl: undefined };
    expect(promptSides({ card: flagOnly, direction: "front-to-back" })).toEqual({
      question: { side: "front", text: { "": "Sweden" }, imageUrl: FLAG },
      answer: { side: "back", text: { "": "Stockholm" } },
    });
    const marked = { ...sweden, textFormat: SM.markdown };
    expect(promptSides({ card: marked, direction: "back-to-front" })).toEqual({
      question: {
        side: "back",
        text: { "": "Stockholm" },
        imageUrl: FLAG,
        textFormat: SM.markdown,
      },
      answer: { side: "front", text: { "": "Sweden" }, textFormat: SM.markdown },
    });
  });
});

describe("isMarkdown", () => {
  it("is true of sm:markdown alone", () => {
    expect(isMarkdown(SM.markdown)).toBe(true);
    expect(isMarkdown(SM.plainText)).toBe(false);
    expect(isMarkdown("https://example.org/formats#asciidoc")).toBe(false);
    expect(isMarkdown(undefined)).toBe(false);
  });
});

describe("cardLabelText", () => {
  it("is the front's text, else the back's", () => {
    const sides = { front: { sv: "vatten" }, back: { en: "water" } };
    expect(cardLabelText(sides)).toEqual({ sv: "vatten" });
    expect(cardLabelText({ ...sides, front: {} })).toEqual({ en: "water" });
  });
});

describe("cardLabel", () => {
  const card: Card = {
    id: "afghanistan",
    url: "https://pod.example/decks/deck-1.ttl#afghanistan",
    front: {},
    back: {},
    createdAt: "",
    formatVersion: 2,
  };

  it("prefers the front text, then the back text, then the id", () => {
    expect(cardLabel({ ...card, front: { "": "水" }, back: { "": "water" } })).toBe("水");
    expect(cardLabel({ ...card, back: { "": "Afghanistan" }, frontImageUrl: FLAG })).toBe(
      "Afghanistan",
    );
    expect(cardLabel({ ...card, frontImageUrl: FLAG, backImageUrl: FLAG })).toBe("afghanistan");
  });
});

describe("boundedCompletedChapters", () => {
  const RELEASE = "https://lib.example/c/v1.ttl";
  const junk = (count: number) =>
    Array.from({ length: count }, (_, i) => `https://elsewhere.example/x${i}.ttl#ch-1`);

  it("keeps them all, each once, within the bound", () => {
    const urls = [`${RELEASE}#ch-1`, `${RELEASE}#ch-2`, `${RELEASE}#ch-1`];
    expect(boundedCompletedChapters(urls, [RELEASE])).toEqual([
      `${RELEASE}#ch-1`,
      `${RELEASE}#ch-2`,
    ]);
  });

  it("past the bound, leaves out the values of other documents first, in order", () => {
    const others = junk(MAX_COMPLETED_CHAPTERS);
    const kept = boundedCompletedChapters(
      [`${RELEASE}#ch-1`, ...others, `${RELEASE}#ch-2`],
      [undefined, `${RELEASE}#ch-2`],
    );
    expect(kept).toEqual([`${RELEASE}#ch-1`, ...others.slice(2), `${RELEASE}#ch-2`]);
  });

  it("past the bound with the course's alone, leaves out the oldest", () => {
    const own = Array.from({ length: MAX_COMPLETED_CHAPTERS + 2 }, (_, i) => `${RELEASE}#ch-${i}`);
    expect(boundedCompletedChapters([...junk(3), ...own], [RELEASE])).toEqual(own.slice(2));
  });
});

describe("withBoundedMetadata", () => {
  const values = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, i) => `${prefix}${i}`);
  const texts = (count: number) =>
    Object.fromEntries(values("x-", count).map((tag) => [tag, `In ${tag}`]));

  it("leaves a deck within the bounds as it is", () => {
    const deck = {
      title: { en: "Capitals", sv: "Huvudstäder" },
      description: { en: "Capitals of the world." },
      authors: ["Anton"],
      themes: ["https://topic.example/geography"],
      keywords: { en: ["capitals"], sv: ["huvudstäder"] },
      sourceUrl: "https://lib.example/capitals/v1.ttl",
    };
    expect(withBoundedMetadata(deck)).toEqual(deck);
    expect(withBoundedMetadata({ title: { en: "Bare" }, authors: [] })).toEqual({
      title: { en: "Bare" },
      authors: [],
    });
  });

  it("keeps the first values of each list and the first languages of each text, in order", () => {
    const authors = values("Author ", MAX_DECK_METADATA + 5);
    const themes = values("https://topic.example/t", MAX_DECK_METADATA + 5);
    const bounded = withBoundedMetadata({
      title: texts(MAX_DECK_METADATA + 5),
      description: texts(MAX_DECK_METADATA + 1),
      authors,
      themes,
      keywords: { ko: values("k", MAX_DECK_METADATA * 3) },
    });
    expect(bounded.authors).toEqual(authors.slice(0, MAX_DECK_METADATA));
    expect(bounded.themes).toEqual(themes.slice(0, MAX_DECK_METADATA));
    expect(Object.keys(bounded.title)).toEqual(values("x-", MAX_DECK_METADATA));
    expect(Object.keys(bounded.description!)).toHaveLength(MAX_DECK_METADATA);
    expect(bounded.keywords).toEqual({ ko: values("k", MAX_DECK_METADATA) });
  });

  it("keeps the first MAX_PICTURE_HOSTS picture hosts, in order (GHSA-jmrw-gq3f-r4g6)", () => {
    const hosts = values("h", MAX_PICTURE_HOSTS + 5).map((host) => `${host}.example`);
    const bounded = withBoundedMetadata({
      title: { en: "Deck" },
      authors: [],
      pictureHosts: hosts,
    });
    expect(bounded.pictureHosts).toEqual(hosts.slice(0, MAX_PICTURE_HOSTS));
  });

  it("keeps values while they fit in MAX_DECK_METADATA_CHARACTERS, in order", () => {
    const quarter = (prefix: string) => prefix.padEnd(MAX_DECK_METADATA_CHARACTERS / 4, "x");
    const bounded = withBoundedMetadata({
      title: { en: "Deck", sv: quarter("title ") },
      description: { en: quarter("description ") },
      authors: [quarter("author "), "Anton", quarter("another ")],
      themes: ["https://topic.example/geography"],
      keywords: { en: ["capitals", quarter("keyword ")], sv: ["huvudstäder"] },
    });
    expect(bounded.title).toEqual({ en: "Deck", sv: quarter("title ") });
    expect(bounded.description).toEqual({ en: quarter("description ") });
    expect(bounded.authors).toEqual([quarter("author "), "Anton"]);
    expect(bounded.themes).toEqual(["https://topic.example/geography"]);
    expect(bounded.keywords).toEqual({ en: ["capitals"], sv: ["huvudstäder"] });
  });

  it("keeps the title's first language, however long, and nothing past the bound", () => {
    const long = "t".repeat(MAX_DECK_METADATA_CHARACTERS + 1);
    const bounded = withBoundedMetadata({
      title: { en: long, sv: "Kort" },
      description: { en: "d" },
      authors: ["Anton"],
      themes: ["https://topic.example/geography"],
      keywords: { en: ["capitals"] },
    });
    expect(bounded).toEqual({
      title: { en: long },
      description: { en: "d" },
      authors: [],
      themes: [],
      keywords: {},
    });
  });

  it("keeps the description's first language when the title's languages fill the bound", () => {
    // The title's two languages take every character the bound allows.
    const rest = "t".repeat(MAX_DECK_METADATA_CHARACTERS - "enDeckfr".length);
    const bounded = withBoundedMetadata({
      title: { en: "Deck", fr: rest },
      description: { en: "About the deck.", sv: "Om leken." },
      authors: ["Anton"],
    });
    expect(bounded.title).toEqual({ en: "Deck", fr: rest });
    expect(bounded.description).toEqual({ en: "About the deck." });
    expect(bounded.authors).toEqual([]);
  });
});

describe("boundedKeywords", () => {
  it("keeps a language only when one of its keywords fits, charging its tag only then", () => {
    const budget = { left: 12 };
    expect(boundedKeywords({ en: [], ko: ["much too long"], sv: ["kort"] }, budget)).toEqual({
      sv: ["kort"],
    });
    expect(budget.left).toBe(12 - "sv".length - "kort".length);
  });

  it("keeps the keywords of the first languages, no more than MAX_DECK_KEYWORDS in all", () => {
    const tags = Array.from({ length: MAX_DECK_METADATA + 1 }, (_, i) => `x-${i}`);
    const keywords = Object.fromEntries(
      tags.map((tag) => [tag, Array.from({ length: MAX_DECK_METADATA }, (_, i) => `${tag} ${i}`)]),
    );
    const bounded = boundedKeywords(keywords);
    const full = MAX_DECK_KEYWORDS / MAX_DECK_METADATA;
    expect(Object.keys(bounded)).toEqual(tags.slice(0, full));
    expect(Object.values(bounded).flat()).toHaveLength(MAX_DECK_KEYWORDS);
  });

  it("cuts the language that reaches MAX_DECK_KEYWORDS short", () => {
    const many = Array.from({ length: MAX_DECK_METADATA }, (_, i) => `k${i}`);
    const keywords = Object.fromEntries(
      Array.from({ length: MAX_DECK_KEYWORDS / MAX_DECK_METADATA }, (_, i) => [`x-${i}`, many]),
    );
    const bounded = boundedKeywords({ en: ["first"], ...keywords });
    expect(bounded.en).toEqual(["first"]);
    expect(bounded[`x-${MAX_DECK_KEYWORDS / MAX_DECK_METADATA - 1}`]).toHaveLength(
      MAX_DECK_METADATA - 1,
    );
  });
});

describe("activeCountOf", () => {
  /** Cards that count each time one is asked whether it's retired. */
  const looked = () => {
    const looks = { count: 0 };
    const card = (retired?: true) => ({
      get retired() {
        looks.count += 1;
        return retired;
      },
    });
    return { looks, cards: [card(), card(true), card()] };
  };

  it("counts the cards in use once of a frozen array, however often it's asked", () => {
    const { looks, cards } = looked();
    const frozen = Object.freeze(cards);
    expect(activeCountOf(frozen)).toBe(2);
    expect(activeCountOf(frozen)).toBe(2);
    expect(looks.count).toBe(cards.length);
  });

  it("counts them afresh of an array that may still change", () => {
    const { looks, cards } = looked();
    expect(activeCountOf(cards)).toBe(2);
    cards.push({ retired: undefined } as never);
    expect(activeCountOf(cards)).toBe(3);
    expect(looks.count).toBe(6);
  });
});

describe("card ids", () => {
  it("are past the bound beyond MAX_CARD_ID_LENGTH characters", () => {
    expect(isCardIdPastBound("c".repeat(MAX_CARD_ID_LENGTH))).toBe(false);
    expect(isCardIdPastBound("c".repeat(MAX_CARD_ID_LENGTH + 1))).toBe(true);
  });

  it("refuse cards taken in with a card or wrong option id past the bound, naming its start", () => {
    const longest = "c".repeat(MAX_CARD_ID_LENGTH);
    expect(() =>
      refuseLongCardIds([{ id: "q-1" }, { id: longest, distractors: [{ id: longest }] }]),
    ).not.toThrow();
    for (const cards of [
      [{ id: "q-1" }, { id: `${longest}c` }],
      [{ id: "q-1", distractors: [{ id: "d-1" }, { id: `${longest}c` }] }],
    ]) {
      const refused = (() => {
        try {
          refuseLongCardIds(cards);
        } catch (error) {
          return error;
        }
      })();
      expect(refused).toBeInstanceOf(AppError);
      expect(refused).toMatchObject({
        code: "cardIdTooLong",
        vars: { limit: MAX_CARD_ID_LENGTH },
      });
    }
  });
});
