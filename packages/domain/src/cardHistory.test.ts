// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { Answer } from "./answer";
import {
  cardAnswers,
  confusionsOf,
  deckAnswers,
  distractorPicksOf,
  hardestCardsOf,
  lapseIndex,
} from "./cardHistory";
import { fragmentIdOf } from "./subjectUrl";
import { growth } from "./testing/growth";

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
      answer(1, {
        cardUrl: `${upgraded.cardsDocumentUrl}#c-1`,
        chosenDistractor: `${upgraded.cardsDocumentUrl}#c-1-d1`,
      }),
      answer(2, { cardUrl: `${upgraded.cardsDocumentUrl}#c-1` }),
    ]);
  });
});

describe("cardAnswers", () => {
  it("lists one card's answers, newest first", () => {
    const answers = [
      answer(1),
      answer(3),
      answer(2, { cardUrl: `${CARDS}#c-2` }),
      answer(4, { id: "answer-0", answeredAt: answer(3).answeredAt }),
    ];
    expect(cardAnswers(answers, `${CARDS}#c-1`).map((each) => each.id)).toEqual([
      "answer-3",
      "answer-0",
      "answer-1",
    ]);
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
      ["d1", 2],
      ["d2", 1],
    ]);
  });
});

describe("lapseIndex", () => {
  it("counts each card's reviews below grade 3, in either direction, from the first month answered in", () => {
    const index = lapseIndex([
      answer(5, { grade: 2, priorIntervalDays: 6 }),
      answer(2, {
        grade: 0,
        priorIntervalDays: 1,
        answeredAt: "2025-03-14T10:00:00.000Z",
        studyDay: "2025-03-14",
      }),
      answer(3, { grade: 3, priorIntervalDays: 1 }),
      answer(4, { grade: 1, priorIntervalDays: 6, direction: "back-to-front" }),
      answer(4, { grade: 1, priorIntervalDays: 1, cardUrl: `${CARDS}#c-2` }),
      answer(6, { grade: 5, priorIntervalDays: 1, cardUrl: `${CARDS}#c-3` }),
    ]);
    expect([...index.lapses]).toEqual([
      ["c-1", 3],
      ["c-2", 1],
    ]);
    expect(index.since).toBe("2025-03");
  });

  it("counts no first answer, repeat the same day or course answer as a lapse", () => {
    const index = lapseIndex([
      answer(1, { id: "answer-1a", grade: 1 }),
      answer(1, { id: "answer-1b", grade: 1, priorIntervalDays: 1 }),
      answer(2, { grade: 1, priorIntervalDays: 1, mode: "multiple-choice" }),
    ]);
    expect(index.lapses.size).toBe(0);
  });

  it("knows no month without answers", () => {
    expect(lapseIndex([])).toEqual({ lapses: new Map(), since: null });
  });

  it("reads the answers in one pass, however many years they cover", () => {
    // A year of 200 answers a day, over 2,000 cards.
    const answers = (count: number) =>
      Array.from({ length: count }, (_, n): Answer => {
        const day = Math.floor(n / 200);
        const studyDay = new Date(Date.UTC(2021, 0, 1 + day)).toISOString().slice(0, 10);
        return answer(1, {
          id: `answer-${n}`,
          cardUrl: `${CARDS}#c-${(day * 7 + n) % 2_000}`,
          grade: (n % 6) as Answer["grade"],
          answeredAt: `${studyDay}T10:00:00.000Z`,
          studyDay,
          priorIntervalDays: 1,
        });
      });
    const years = answers(365 * 200);
    const index = lapseIndex(years);
    expect(index.since).toBe("2021-01");
    expect(index.lapses.size).toBe(2_000);
    // Eight times the answers take about as long as an eighth of them eight
    // times over; work per answer that grew with the answers would take
    // eight times as long.
    const ratio = growth(
      (count) => {
        const some = years.slice(0, count);
        return () => lapseIndex(some);
      },
      years.length / 16,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("hardestCardsOf", () => {
  const card = (id: string) => ({ url: `${CARDS}#${id}` });
  const reviewed = (n: number, id: string, grade: Answer["grade"], extra: Partial<Answer> = {}) =>
    answer(n, {
      id: `answer-${id}-${n}`,
      cardUrl: `${CARDS}#${id}`,
      grade,
      priorIntervalDays: 1,
      ...extra,
    });

  it("ranks the cards in use by their lapses, then by the share of their reviews forgotten", () => {
    const hardest = hardestCardsOf(
      [
        // c-1: 2 lapses of 4 reviews; c-2: 2 of 2; c-3: 1 of 1; c-4: none; c-5 retired.
        reviewed(1, "c-1", 1),
        reviewed(2, "c-1", 4),
        reviewed(3, "c-1", 0),
        reviewed(4, "c-1", 3, { direction: "back-to-front" }),
        reviewed(1, "c-2", 2),
        reviewed(2, "c-2", 1),
        reviewed(1, "c-3", 0),
        reviewed(1, "c-4", 5),
        reviewed(1, "c-5", 0),
        reviewed(1, "c-6", 0),
      ],
      [card("c-1"), card("c-2"), card("c-4"), card("c-6"), card("c-3")],
    );
    expect(hardest.reviews).toBe(10);
    expect(hardest.cards).toEqual([
      { card: card("c-2"), lapses: 2, reviews: 2 },
      { card: card("c-1"), lapses: 2, reviews: 4 },
      { card: card("c-3"), lapses: 1, reviews: 1 },
      { card: card("c-6"), lapses: 1, reviews: 1 },
    ]);
  });

  it("counts no first answer, repeat the same day or course answer, as a lapse or a review", () => {
    expect(
      hardestCardsOf(
        [
          answer(1, { id: "answer-1a", grade: 1 }),
          answer(1, { id: "answer-1b", grade: 1, priorIntervalDays: 1 }),
          answer(2, { grade: 1, priorIntervalDays: 1, mode: "multiple-choice" }),
        ],
        [card("c-1")],
      ),
    ).toEqual({ reviews: 0, cards: [] });
  });

  it("reads the answers in one pass, however many there are", () => {
    const cards = Array.from({ length: 2_000 }, (_, n) => card(`c-${n}`));
    const answers = (count: number) =>
      Array.from({ length: count }, (_, n): Answer => {
        const studyDay = new Date(Date.UTC(2021, 0, 1 + Math.floor(n / 200)))
          .toISOString()
          .slice(0, 10);
        return answer(1, {
          id: `answer-${n}`,
          cardUrl: `${CARDS}#c-${n % 2_000}`,
          grade: (n % 6) as Answer["grade"],
          answeredAt: `${studyDay}T10:00:00.000Z`,
          studyDay,
          priorIntervalDays: 1,
        });
      });
    const all = answers(365 * 200);
    expect(hardestCardsOf(all, cards).cards).toHaveLength(2_000);
    const ratio = growth(
      (count) => {
        const some = all.slice(0, count);
        return () => hardestCardsOf(some, cards);
      },
      all.length / 16,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("confusionsOf", () => {
  const option = (id: string) => ({ id, text: { en: id } });
  const asked = (id: string, ...distractors: string[]) => ({
    url: `${CARDS}#${id}`,
    distractors: distractors.map(option),
  });

  it("names each wrong option chosen by the card that has it, the most chosen first", () => {
    const chose = (n: number, id: string, extra: Partial<Answer> = {}) =>
      answer(n, {
        grade: 1,
        mode: "multiple-choice",
        chosenDistractor: `${CARDS}#${id}`,
        ...extra,
      });
    const first = asked("c-1", "c-1-d1", "c-1-d2");
    const second = asked("c-2", "c-2-d1");
    expect(
      confusionsOf(
        [
          chose(1, "c-1-d2"),
          chose(1, "c-1-d2", { id: "answer-1b" }),
          chose(2, "c-2-d1", { cardUrl: second.url }),
          chose(3, "c-1-d1"),
          chose(4, "c-1-d1"),
          // An option no card in use has.
          chose(5, "c-9-d1"),
          answer(6),
        ],
        [first, second, { url: `${CARDS}#c-3` }],
      ),
    ).toEqual([
      { card: first, distractor: option("c-1-d1"), picks: 2 },
      { card: first, distractor: option("c-1-d2"), picks: 2 },
      { card: second, distractor: option("c-2-d1"), picks: 1 },
    ]);
  });
});

describe("the answers of a deck, their card and wrong option names as long as a term may be", () => {
  // The longest term the read limits accept (MAX_TERM_CHARACTERS, with
  // its <>): a short document and the rest its fragment, so that the IRI
  // in the deck's cards document is past the bound on a term.
  const deck = { url: DECK, cardsDocumentUrl: CARDS };
  const term = (pad: string, n: number) =>
    `https://a.b/#${pad.repeat(16_381 - 13 - 6)}${String(n).padStart(6, "0")}`;
  const logOf = (count: number) =>
    deckAnswers(
      Array.from({ length: count }, (_, n) =>
        answer(1, {
          id: `answer-${n}`,
          cardUrl: term("c", n),
          chosenDistractor: term("d", n),
          grade: 0,
          priorIntervalDays: 3,
        }),
      ),
      deck,
    );

  it("are counted by their fragment ids, the same as shorter ones", () => {
    const log = logOf(2);
    const ids = log.map((one) => fragmentIdOf(one.cardUrl));
    expect(log[0]!.cardUrl.length).toBeGreaterThan(16_383);
    expect([...lapseIndex(log).lapses]).toEqual(ids.map((id) => [id, 1]));
    expect([...distractorPicksOf(log).keys()]).toEqual(
      log.map((one) => fragmentIdOf(one.chosenDistractor!)),
    );
    const cards = log.map((one) => ({ url: one.cardUrl }));
    expect(hardestCardsOf(log, cards)).toEqual({
      reviews: 2,
      cards: cards.map((card) => ({ card, lapses: 1, reviews: 1 })),
    });
  });

  it("key no map by a string past the bound on a term", () => {
    // V8 hashes a longer string by its length alone (domain/pathKeys.ts).
    const longest = { key: 0 };
    const seen = (key: unknown) => {
      if (typeof key === "string") longest.key = Math.max(longest.key, key.length);
    };
    const spies = (["get", "set", "has"] as const).map((name) => {
      const original = Map.prototype[name] as (
        this: Map<unknown, unknown>,
        ...args: unknown[]
      ) => unknown;
      return vi.spyOn(Map.prototype, name).mockImplementation(function (
        this: Map<unknown, unknown>,
        ...args: unknown[]
      ) {
        seen(args[0]);
        return original.apply(this, args);
      } as never);
    });
    try {
      const log = logOf(2);
      const cards = log.map((one, n) => ({
        url: one.cardUrl,
        distractors: [{ id: fragmentIdOf(log[n]!.chosenDistractor!), text: { en: "No" } }],
      }));
      lapseIndex(log);
      distractorPicksOf(log);
      hardestCardsOf(log, cards);
      expect(confusionsOf(log, cards)).toHaveLength(2);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(longest.key).toBeGreaterThan(0);
    expect(longest.key).toBeLessThanOrEqual(16_383);
  });

  // The linear check the advisory's case calls for; the guard against
  // keys joined past the term bound is the key-length test above.
  it("are counted in one pass, however many there are", () => {
    const ratio = growth(
      (count) => {
        const log = logOf(count);
        // No cards given: what is timed is the counting, not the sort.
        return () => {
          lapseIndex(log);
          distractorPicksOf(log);
          hardestCardsOf(log, []);
        };
      },
      500,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
