// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { DeckHealth } from "@solid-memo/domain/deckHealth";
import { createI18n } from "@solid-memo/ui/i18n";
import type { MarkdownProblem } from "@solid-memo/ui/MarkdownEditing";
import { instanceA, invalidReport, makeCard, makeDeck } from "../test/fixtures";
import { deckProblemsOf } from "./WorkspaceProblems";

const en = createI18n("en");
const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const water = makeCard(kanji, "water");
const fire = makeCard(kanji, "fire");

const health = (part: Partial<DeckHealth<MarkdownProblem>>): DeckHealth<MarkdownProblem> => ({
  report: { ...invalidReport([]), violationCount: 0 },
  unstated: [],
  duplicates: [],
  markdown: [],
  ...part,
});

describe("deckProblemsOf", () => {
  it("lists the deck's data in one line at its health, then each spot at its field", () => {
    const found = deckProblemsOf(
      kanji,
      health({
        report: invalidReport([kanji]),
        unstated: [{ card: water, place: { tab: "content", part: "front" } }],
        duplicates: [[fire, water]],
        markdown: [
          {
            card: fire,
            place: { tab: "content", part: "backNote" },
            language: "en",
            finding: { code: "tooLong", length: 9000 },
          },
        ],
      }),
      en,
    );
    expect(found.map((one) => one.text)).toEqual([
      "1 problem in the deck's data",
      "water, front: its language is not stated",
      "fire: says the same as another card",
      "fire, note under the back: Too long to read as Markdown (9,000 characters): it shows as plain text.",
    ]);
    expect(found.map((one) => one.route)).toEqual([
      { screen: "health", instanceUrl: instanceA.url, deckUrl: kanji.url },
      { screen: "card", deckUrl: kanji.url, cardUrl: water.url, tab: "content", field: "front" },
      { screen: "card", deckUrl: kanji.url, cardUrl: fire.url, tab: "content" },
      { screen: "card", deckUrl: kanji.url, cardUrl: fire.url, tab: "content", field: "backNote" },
    ]);
  });

  it("names the cards in the deck's card language first", () => {
    const swedish = { ...kanji, cardLanguage: "sv" };
    const vatten = { ...water, front: { en: "water", sv: "vatten" } };
    const found = deckProblemsOf(swedish, health({ duplicates: [[vatten, fire]] }), en);
    expect(found.map((one) => one.text)).toEqual(["vatten: says the same as another card"]);
  });

  it("lists nothing of a healthy deck, nor of the languages it could not check", () => {
    expect(deckProblemsOf(kanji, health({}), en)).toEqual([]);
    expect(deckProblemsOf(kanji, health({ unstated: null }), en)).toEqual([]);
  });
});
