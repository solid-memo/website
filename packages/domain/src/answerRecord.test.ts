import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import { answerFromRecord, answerToRecord } from "./answerRecord";

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const first: Answer = {
  id: "answer-1",
  deckUrl: "https://pod.example/i/catalog.ttl#deck-1",
  cardUrl: "https://pod.example/i/decks/deck-1.ttl#se",
  direction: "front-to-back",
  grade: 4,
  answeredAt: "2026-10-03T08:15:30.123Z",
  studyDay: "2026-10-03",
  nextIntervalDays: 1,
};

describe("answer records", () => {
  it("name the direction by its concept and leave out the prior interval of a first answer", () => {
    expect(answerToRecord(first)).toEqual({
      deck: first.deckUrl,
      card: first.cardUrl,
      direction: `${SM}frontToBack`,
      grade: 4,
      answeredAt: first.answeredAt,
      studyDay: "2026-10-03",
      nextIntervalDays: 1,
    });
  });

  it("read back what was written, the id from the subject", () => {
    const review: Answer = { ...first, direction: "back-to-front", priorIntervalDays: 6, nextIntervalDays: 15 };
    expect(answerFromRecord("answer-1", answerToRecord(review))).toEqual(review);
    expect(answerFromRecord("answer-1", answerToRecord(first))).toEqual(first);
  });
});
