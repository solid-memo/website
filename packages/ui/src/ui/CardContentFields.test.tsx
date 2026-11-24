// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { CardContent } from "@solid-memo/domain/deck";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { LANGUAGE_CHOICE_LIMIT } from "@solid-memo/domain/cardQuery";
import {
  cardLanguageHints,
  checkDraft,
  draftChanged,
  draftOf,
  newDraft,
  nextDraft,
  stillReadOtherwise,
  switchMarkdown,
  textFormatOfDraft,
  type CardDraft,
} from "./CardContentFields";
import { UNKEPT_VALUES } from "./deviceValues";

const plain: CardContent = { front: { en: "a" }, back: { en: "b" } };
const marked: CardContent = { ...plain, textFormat: SM.markdown };
const unknown: CardContent = { ...plain, textFormat: "https://example.org/formats#wiki" };

/** A new card's draft with these sides, in English, in Markdown or not. */
function written(front: string, back: string, markdown: boolean): CardDraft {
  const draft = newDraft({ front: "en", back: "en" });
  return {
    ...draft,
    front: [{ id: 0, value: front, tag: "en" }],
    back: [{ id: 0, value: back, tag: "en" }],
    markdown,
  };
}

describe("the card draft's Markdown", () => {
  it("is off for every new card, the next one too whatever the added card was", () => {
    expect(newDraft({}).markdown).toBe(false);
    const added = switchMarkdown(written("**a**", "b", false), true);
    expect(nextDraft(added, {})).toMatchObject({ markdown: false, readOtherwise: [] });
    expect(nextDraft(newDraft({}), {}).markdown).toBe(false);
  });

  it("is on for a card in Markdown only, not one in a format this app does not know", () => {
    expect(draftOf(marked, []).markdown).toBe(true);
    expect(draftOf(plain, []).markdown).toBe(false);
    expect(draftOf({ ...plain, textFormat: SM.plainText }, []).markdown).toBe(false);
    expect(draftOf(unknown, []).markdown).toBe(false);
  });
});

describe("switching Markdown", () => {
  /** A draft whose front has a translation, in Swedish. */
  function translated(front: string, swedish: string, back: string): CardDraft {
    const draft = written(front, back, false);
    return { ...draft, front: [...draft.front, { id: 1, value: swedish, tag: "sv" }] };
  }

  it("notes the texts that read otherwise as Markdown at that moment, in every language, and none switched off", () => {
    const on = switchMarkdown(translated("M87*", "**fet**", "2. place"), true);
    expect(on.markdown).toBe(true);
    expect(on.readOtherwise).toEqual([
      { part: "front", id: 1, value: "**fet**" },
      { part: "back", id: 0, value: "2. place" },
    ]);
    expect(switchMarkdown(on, false)).toMatchObject({ markdown: false, readOtherwise: [] });
  });

  it("says where such text still is as it was: in a main text, only in translations, or nowhere", () => {
    const on = switchMarkdown(translated("M87*", "**fet**", "2. place"), true);
    expect(stillReadOtherwise(on)).toBe("main");
    const backChanged = { ...on, back: [{ id: 0, value: "2. plats", tag: "en" }] };
    expect(stillReadOtherwise(backChanged)).toBe("translation");
    const translationRemoved = { ...backChanged, front: backChanged.front.slice(0, 1) };
    expect(stillReadOtherwise(translationRemoved)).toBeUndefined();
  });

  it("reads each text's entries once, however many languages it is in", () => {
    const count = LANGUAGE_CHOICE_LIMIT + 5;
    let reads = 0;
    /** A translation that counts how often its id is read. */
    const entry = (id: number) => ({
      get id() {
        reads += 1;
        return id;
      },
      value: "*x*",
      tag: `sv-${id}`,
    });
    const draft = written("a", "b", false);
    const many = {
      ...draft,
      front: [draft.front[0]!, ...Array.from({ length: count }, (_, i) => entry(i + 1))],
    };
    const on = switchMarkdown(many, true);
    expect(on.readOtherwise).toHaveLength(count);
    reads = 0;
    expect(stillReadOtherwise(on)).toBe("translation");
    expect(reads).toBeLessThanOrEqual(count);
  });

  it("says nothing of Markdown typed after it was switched on", () => {
    const on = switchMarkdown(written("a", "b", false), true);
    expect(on.readOtherwise).toEqual([]);
    expect(
      stillReadOtherwise({ ...on, front: [{ id: 0, value: "**a**", tag: "en" }] }),
    ).toBeUndefined();
  });
});

describe("textFormatOfDraft", () => {
  it("states Markdown switched on, and plain text switched off a card in Markdown", () => {
    expect(textFormatOfDraft({ ...draftOf(plain, []), markdown: true }, plain)).toBe(SM.markdown);
    expect(textFormatOfDraft({ ...draftOf(unknown, []), markdown: true }, unknown)).toBe(
      SM.markdown,
    );
    expect(textFormatOfDraft({ ...draftOf(marked, []), markdown: false }, marked)).toBe(
      SM.plainText,
    );
    expect(textFormatOfDraft({ ...newDraft({}), markdown: true })).toBe(SM.markdown);
  });

  it("states none when it is as the card has it, which keeps the card's: absent, or one this app does not know", () => {
    expect(textFormatOfDraft(draftOf(plain, []), plain)).toBeUndefined();
    expect(textFormatOfDraft(draftOf(marked, []), marked)).toBeUndefined();
    expect(textFormatOfDraft(draftOf(unknown, []), unknown)).toBeUndefined();
    expect(textFormatOfDraft(newDraft({}))).toBeUndefined();
  });
});

describe("checkDraft", () => {
  it("keeps the spaces a Markdown text starts with, a code block, and states its format", () => {
    expect(checkDraft(written("\n    git diff\n", " b ", true))).toEqual({
      ok: true,
      content: { front: { en: "    git diff" }, back: { en: " b" }, textFormat: SM.markdown },
    });
  });

  it("trims the label of a card in Markdown, a single line that never holds a block", () => {
    const draft = {
      ...written("a", "b", true),
      backLabel: [{ id: 0, value: " Replaced by ", tag: "en" }],
    };
    expect(checkDraft(draft)).toEqual({
      ok: true,
      content: {
        front: { en: "a" },
        back: { en: "b" },
        backLabel: { en: "Replaced by" },
        textFormat: SM.markdown,
      },
    });
  });

  it("trims plain text, and states no format for a new card", () => {
    expect(checkDraft(written("\n    git diff\n", " b ", false))).toEqual({
      ok: true,
      content: { front: { en: "git diff" }, back: { en: "b" } },
    });
  });

  it("trims a card in Markdown switched off, saying it is plain text", () => {
    const draft = {
      ...draftOf(marked, []),
      front: [{ id: 0, value: "  a", tag: "en" }],
      markdown: false,
    };
    expect(checkDraft(draft, marked)).toEqual({
      ok: true,
      content: { front: { en: "a" }, back: { en: "b" }, textFormat: SM.plainText },
    });
  });
});

describe("draftChanged", () => {
  const from = draftOf({ ...plain, frontNote: { en: "n" } }, ["en"]);

  it("says a draft as it was is unchanged, though a text was touched and changed back", () => {
    expect(
      draftChanged(
        { ...from, front: [{ ...from.front[0]!, value: "a" }], touched: ["front"] },
        from,
      ),
    ).toBe(false);
  });

  it.each<[string, Partial<CardDraft>]>([
    ["a word", { back: [{ ...from.back[0]!, value: "c" }] }],
    ["a language", { back: [{ ...from.back[0]!, tag: "sv" }] }],
    ["a translation added", { frontNote: [...from.frontNote, { id: 9, value: "m", tag: "sv" }] }],
    ["the front's picture", { frontImageUrl: "https://img.example/a.png" }],
    ["the back's picture", { backImageUrl: "https://img.example/b.png" }],
    ["Markdown", { markdown: true }],
  ])("says a draft is changed by %s", (_, change) => {
    expect(draftChanged({ ...from, ...change }, from)).toBe(true);
  });
});

describe("cardLanguageHints", () => {
  it("suggests the side's language, then at most LANGUAGE_CHOICE_LIMIT of the deck name's", () => {
    const title = Object.fromEntries(
      Array.from({ length: LANGUAGE_CHOICE_LIMIT + 50 }, (_, i) => [`x-t${1000 + i}`, "a"]),
    );
    const { suggestions } = cardLanguageHints(
      { front: "fi", own: "sv", unstatedCounts: { front: 0, back: 0 } },
      { ...title, "": "b" },
      UNKEPT_VALUES,
    );
    expect(suggestions.front).toHaveLength(1 + LANGUAGE_CHOICE_LIMIT);
    expect(suggestions.front.slice(0, 2)).toEqual(["fi", "x-t1000"]);
    expect(suggestions.own[0]).toBe("sv");
    expect(suggestions.back).not.toContain("x-t1100");
  });
});
