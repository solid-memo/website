import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import { cardAnswers, deckAnswers, distractorPicksOf, lapseIndex } from "./cardHistory";

const DECK = "https://pod.example/a/catalog.ttl#deck-1";
const CARDS = "https://pod.example/a/decks/deck-1.ttl";

function answer(n: number, extra: Partial<Answer> = {}): Answer {
  return {
    id: `answer-${n}`,
    deckUrl: DECK,
    cardUrl: `${CARDS}#c-1`,
    direction: "front-to-back",
    grade: 4,
    answeredAt: `2026-10-0${n}T10:00:00.000Z`,
    studyDay: `2026-10-0${n}`,
    nextIntervalDays: 1,
    ...extra,
  };
}

describe("deckAnswers", () => {
  it("keeps the deck's answers, naming their cards and wrong options in its cards document as it is now", () => {
    const upgraded = { url: DECK, cardsDocumentUrl: "https://pod.example/a/decks/deck-1-v2.ttl" };
    const answers = [
      answer(1, { chosenDistractor: `${CARDS}#c-1-d1` }),
      answer(2),
      answer(3, { deckUrl: "https://pod.example/a/catalog.ttl#deck-2" }),
    ];
    expect(deckAnswers(answers, upgraded)).toEqual([
      answer(1, { cardUrl: `${upgraded.cardsDocumentUrl}#c-1`, chosenDistractor: `${upgraded.cardsDocumentUrl}#c-1-d1` }),
      answer(2, { cardUrl: `${upgraded.cardsDocumentUrl}#c-1` }),
    ]);
  });
});

describe("cardAnswers", () => {
  it("lists one card's answers, newest first", () => {
    const answers = [answer(1), answer(3), answer(2, { cardUrl: `${CARDS}#c-2` }), answer(4, { id: "answer-0", answeredAt: answer(3).answeredAt })];
    expect(cardAnswers(answers, `${CARDS}#c-1`).map((each) => each.id)).toEqual(["answer-3", "answer-0", "answer-1"]);
  });
});

describe("distractorPicksOf", () => {
  it("counts the wrong options chosen", () => {
    const picks = distractorPicksOf([
      answer(1, { chosenDistractor: `${CARDS}#d1` }),
      answer(2, { chosenDistractor: `${CARDS}#d1` }),
      answer(3, { chosenDistractor: `${CARDS}#d2` }),
      answer(4),
    ]);
    expect([...picks]).toEqual([
      [`${CARDS}#d1`, 2],
      [`${CARDS}#d2`, 1],
    ]);
  });
});

describe("lapseIndex", () => {
  it("counts each card's answers below grade 3, from the first month answered in", () => {
    const index = lapseIndex([
      answer(5, { grade: 2 }),
      answer(2, { grade: 0, studyDay: "2025-03-14" }),
      answer(3, { grade: 3 }),
      answer(4, { grade: 1, cardUrl: `${CARDS}#c-2` }),
      answer(6, { grade: 5, cardUrl: `${CARDS}#c-3` }),
    ]);
    expect([...index.lapses]).toEqual([
      [`${CARDS}#c-1`, 2],
      [`${CARDS}#c-2`, 1],
    ]);
    expect(index.since).toBe("2025-03");
  });

  it("knows no month without answers", () => {
    expect(lapseIndex([])).toEqual({ lapses: new Map(), since: null });
  });

  it("stays fast over years of answers", () => {
    // Five years of 200 answers a day, over 2,000 cards.
    const days = 5 * 365;
    const answers: Answer[] = [];
    for (let day = 0; day < days; day++) {
      const studyDay = new Date(Date.UTC(2021, 0, 1 + day)).toISOString().slice(0, 10);
      for (let i = 0; i < 200; i++) {
        answers.push(answer(1, { id: `answer-${day}-${i}`, cardUrl: `${CARDS}#c-${(day * 7 + i) % 2_000}`, grade: (i % 6) as Answer["grade"], studyDay }));
      }
    }
    const started = performance.now();
    const index = lapseIndex(answers);
    const took = performance.now() - started;
    expect(index.since).toBe("2021-01");
    expect(index.lapses.size).toBe(2_000);
    expect(took).toBeLessThan(500);
  });
});
