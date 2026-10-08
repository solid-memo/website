import { AppError } from "./appError";
import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import {
  cardLabel,
  cardLabelText,
  isDeckDirection,
  promptSides,
  isMarkdown,
  promptsOf,
  studyDirections,
  validateCardContent,
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
    expect(validateCardContent({ front: { en: "**a**" }, back: { en: "b" }, textFormat: MARKDOWN })).toEqual({
      ok: true,
      content: { front: { en: "**a**" }, back: { en: "b" }, textFormat: MARKDOWN },
    });
  });

  it("keeps the spaces a formatted text starts with, a Markdown code block, through an edit of another field", () => {
    const MARKDOWN = "https://solid-memo.com/ns/vocab/v1.ttl#markdown";
    const PLAIN = "https://solid-memo.com/ns/vocab/v1.ttl#plainText";
    const saved = { front: { "": "    code\n" }, back: { en: "b" }, textFormat: MARKDOWN };
    // The editor states no text format: the saved card's is kept, and with it the code block.
    expect(validateCardContent({ front: { "": "\n  \n    code  \n" }, back: { en: "the b" } }, saved)).toEqual({
      ok: true,
      content: { front: { "": "    code" }, back: { en: "the b" } },
    });
    expect(
      validateCardContent({ front: { en: "    code" }, back: { en: " b" }, backNote: { en: "\n    note" }, textFormat: MARKDOWN }),
    ).toEqual({
      ok: true,
      content: { front: { en: "    code" }, back: { en: " b" }, backNote: { en: "    note" }, textFormat: MARKDOWN },
    });
    // Plain text, stated or not, is trimmed as ever.
    expect(validateCardContent({ front: { en: "    code" }, back: { en: "b" }, textFormat: PLAIN })).toEqual({
      ok: true,
      content: { front: { en: "code" }, back: { en: "b" }, textFormat: PLAIN },
    });
  });

  it("keeps a note under the answer, trimmed, and drops an empty one", () => {
    expect(validateCardContent({ front: { sv: "Aktiemäklare" }, back: { sv: "Finansmäklare" }, backNote: { en: " Replaced in version 30. " } })).toEqual({
      ok: true,
      content: { front: { sv: "Aktiemäklare" }, back: { sv: "Finansmäklare" }, backNote: { en: "Replaced in version 30." } },
    });
    expect(validateCardContent({ front: { en: "a" }, back: { en: "b" }, backNote: { en: "  " } })).toEqual({ ok: true, content: { front: { en: "a" }, back: { en: "b" } } });
  });

  it("keeps a note's every language, trimmed, English or not", () => {
    expect(
      validateCardContent({ front: { en: "a" }, back: { en: "b" }, backNote: { en: " Replaced. ", sv: " Ersatt. ", de: " " } }),
    ).toEqual({ ok: true, content: { front: { en: "a" }, back: { en: "b" }, backNote: { en: "Replaced.", sv: "Ersatt." } } });
    expect(validateCardContent({ front: { en: "a" }, back: { en: "b" }, frontNote: { en: "", sv: "Används inte längre" } })).toEqual({
      ok: true,
      content: { front: { en: "a" }, back: { en: "b" }, frontNote: { sv: "Används inte längre" } },
    });
    expect(validateCardContent({ front: { en: "a" }, back: { en: "b" }, backLabel: { fi: "Pääkaupunki" } })).toEqual({
      ok: true,
      content: { front: { en: "a" }, back: { en: "b" }, backLabel: { fi: "Pääkaupunki" } },
    });
  });

  it("asks the language of a note, the label or a picture's description, never keeping untagged text", () => {
    const card = { front: { en: "a" }, back: { en: "b" } };
    expect(validateCardContent({ ...card, frontNote: { "": "Out of use" } }, { ...card, frontNote: { "": "Out of use" } })).toEqual({
      ok: false,
      error: new AppError("textNeedsLanguage", { field: "the note under the front" }),
      part: "frontNote",
    });
    expect(validateCardContent({ ...card, backLabel: { "": "Capital" } })).toMatchObject({ ok: false, part: "backLabel" });
    expect(validateCardContent({ ...card, backNote: { "": "Since 1634" } })).toMatchObject({ ok: false, part: "backNote" });
    expect(validateCardContent({ ...card, frontImageUrl: FLAG, frontImageDescription: { "": "A flag" } })).toMatchObject({
      ok: false,
      part: "frontImageDescription",
    });
    expect(validateCardContent({ ...card, backImageUrl: FLAG, backImageDescription: { "": "A map" } })).toEqual({
      ok: false,
      error: new AppError("textNeedsLanguage", { field: "the back picture's description" }),
      part: "backImageDescription",
    });
  });

  it("keeps a side's untagged text only as the card saved it", () => {
    const saved = { front: { "": "水" }, back: { "": "water" } };
    // Untouched: kept as it is, whatever else changes.
    expect(validateCardContent({ ...saved, front: { "": " 水 " }, backNote: { en: "An element." } }, saved)).toEqual({
      ok: true,
      content: { ...saved, backNote: { en: "An element." } },
    });
    // Its language stated: tagged from now on.
    expect(validateCardContent({ ...saved, front: { ja: "水" } }, saved)).toEqual({ ok: true, content: { ...saved, front: { ja: "水" } } });
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
    expect(validateCardContent({ front: { ja: "水" }, back: { "": "water" } }, { front: { ja: "水" }, back: {} })).toMatchObject({
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
    ).toEqual({ ok: true, content: { front: {}, back: { en: "Sweden" }, frontImageUrl: FLAG, frontImageDescription: { sv: "En flagga med ett gult kors" } } });
    expect(
      validateCardContent({ front: { en: "a" }, back: { en: "b" }, backImageUrl: FLAG, backImageDescription: { en: " " } }),
    ).toEqual({ ok: true, content: { front: { en: "a" }, back: { en: "b" }, backImageUrl: FLAG } });
    expect(
      validateCardContent({ front: { en: "a" }, back: {}, backImageUrl: FLAG, backImageDescription: { en: "A flag" } }),
    ).toEqual({ ok: true, content: { front: { en: "a" }, back: {}, backImageUrl: FLAG, backImageDescription: { en: "A flag" } } });
  });

  it("keeps a note under the front, trimmed, and drops an empty one", () => {
    expect(validateCardContent({ front: { sv: "Aktiemäklare" }, back: { sv: "Finansmäklare" }, frontNote: { en: " Out of use " } })).toEqual({
      ok: true,
      content: { front: { sv: "Aktiemäklare" }, back: { sv: "Finansmäklare" }, frontNote: { en: "Out of use" } },
    });
    expect(validateCardContent({ front: { en: "a" }, back: { en: "b" }, frontNote: { en: " " } })).toEqual({ ok: true, content: { front: { en: "a" }, back: { en: "b" } } });
  });

  it("keeps a label above the back, trimmed, and drops an empty one", () => {
    expect(validateCardContent({ front: { en: "Sweden" }, back: { en: "Stockholm" }, backLabel: { en: " Capital " } })).toEqual({
      ok: true,
      content: { front: { en: "Sweden" }, back: { en: "Stockholm" }, backLabel: { en: "Capital" } },
    });
    expect(validateCardContent({ front: { en: "a" }, back: { en: "b" }, backLabel: { en: "" } })).toEqual({ ok: true, content: { front: { en: "a" }, back: { en: "b" } } });
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
    expect(
      validateCardContent({ front: {}, back: {}, frontImageUrl: FLAG }),
    ).toEqual({ ok: false, error: new AppError("cardBackEmpty") });
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

  it("recognises the three directions and nothing else", () => {
    expect(isDeckDirection("front-to-back")).toBe(true);
    expect(isDeckDirection("back-to-front")).toBe(true);
    expect(isDeckDirection("bidirectional")).toBe(true);
    expect(isDeckDirection("sideways")).toBe(false);
  });

  it("studies a one-way deck one way and a bidirectional deck both ways", () => {
    expect(studyDirections("front-to-back")).toEqual(["front-to-back"]);
    expect(studyDirections("back-to-front")).toEqual(["back-to-front"]);
    expect(studyDirections("bidirectional")).toEqual([
      "front-to-back",
      "back-to-front",
    ]);
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
    const noted = { ...sweden, frontNote: { en: "A kingdom." }, backNote: { en: "The capital since 1634." } };
    expect(promptSides({ card: noted, direction: "front-to-back" })).toEqual({
      question: { side: "front", text: { "": "Sweden" }, note: { en: "A kingdom." } },
      answer: { side: "back", text: { "": "Stockholm" }, imageUrl: FLAG, note: { en: "The capital since 1634." } },
    });
    expect(promptSides({ card: noted, direction: "back-to-front" })).toEqual({
      question: { side: "back", text: { "": "Stockholm" }, imageUrl: FLAG, note: { en: "The capital since 1634." } },
      answer: { side: "front", text: { "": "Sweden" }, note: { en: "A kingdom." } },
    });
    const described = { ...sweden, frontImageUrl: FLAG, frontImageDescription: { en: "A blue flag" }, backImageDescription: { en: "The same flag" } };
    expect(promptSides({ card: described, direction: "front-to-back" })).toEqual({
      question: { side: "front", text: { "": "Sweden" }, imageUrl: FLAG, imageDescription: { en: "A blue flag" } },
      answer: { side: "back", text: { "": "Stockholm" }, imageUrl: FLAG, imageDescription: { en: "The same flag" } },
    });
    const labelled = { ...sweden, backLabel: { en: "Capital" } };
    expect(promptSides({ card: labelled, direction: "front-to-back" }).answer).toMatchObject({ side: "back", label: { en: "Capital" } });
    expect(promptSides({ card: labelled, direction: "back-to-front" }).question).toMatchObject({ side: "back", label: { en: "Capital" } });
    const flagOnly = { ...sweden, frontImageUrl: FLAG, backImageUrl: undefined };
    expect(promptSides({ card: flagOnly, direction: "front-to-back" })).toEqual({
      question: { side: "front", text: { "": "Sweden" }, imageUrl: FLAG },
      answer: { side: "back", text: { "": "Stockholm" } },
    });
    const marked = { ...sweden, textFormat: SM.markdown };
    expect(promptSides({ card: marked, direction: "back-to-front" })).toEqual({
      question: { side: "back", text: { "": "Stockholm" }, imageUrl: FLAG, textFormat: SM.markdown },
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
    expect(cardLabel({ ...card, frontImageUrl: FLAG, backImageUrl: FLAG })).toBe(
      "afghanistan",
    );
  });
});
