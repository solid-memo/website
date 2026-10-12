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
