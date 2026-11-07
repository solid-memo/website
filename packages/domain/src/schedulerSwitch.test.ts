// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import { effectiveStates, memoryFromSm2, nextMemory } from "./fsrs";
import type { ReviewState } from "./review";
import { switchedStates } from "./schedulerSwitch";
import { studyDayOf } from "./scheduling";
import { daysBetween } from "./studyPatterns";

const DECK = "https://pod.example/i/catalog.ttl#deck-1";
const NOW = new Date("2026-11-06T12:00:00.000Z");
const CARDS = "https://pod.example/i/decks/deck-1.ttl";

function answer(at: string, extra: Partial<Answer> = {}): Answer {
  return {
    id: `answer-${at}`,
    deckUrl: DECK,
    cardUrl: `${CARDS}#c-1`,
    direction: "front-to-back",
    grade: 4,
    answeredAt: at,
    studyDay: at.slice(0, 10),
    priorIntervalDays: 1,
    nextIntervalDays: 6,
    ...extra,
  };
}

/** c-1 introduced on the 1st (Again, then Good the same day), reviewed Good on the 2nd and Hard on the 8th. */
const history: Answer[] = [
  answer("2026-09-01T10:00:00.000Z", { grade: 1, priorIntervalDays: undefined }),
  answer("2026-09-01T10:05:00.000Z", { priorIntervalDays: 1 }),
  answer("2026-09-02T10:00:00.000Z"),
  answer("2026-09-08T10:00:00.000Z", { grade: 3 }),
];

const state: ReviewState = {
  cardId: "c-1",
  direction: "front-to-back",
  easeFactor: 2.36,
  intervalDays: 14,
  repetitions: 3,
  due: "2026-09-22",
  firstReviewedAt: "2026-09-01T10:00:00.000Z",
  lastReviewedAt: "2026-09-08T10:00:00.000Z",
  formatVersion: 2,
  previous: {
    easeFactor: 2.5,
    intervalDays: 6,
    repetitions: 2,
    due: "2026-09-08",
    lastReviewedAt: "2026-09-02T10:00:00.000Z",
  },
};

/** The memory the history leaves, stepped by hand: Again, Good the same day, Good a day later, Hard six days later. */
function byHand() {
  let memory = nextMemory(null, 1, 0);
  memory = nextMemory(memory, 3, 0);
  memory = nextMemory(memory, 3, 1);
  return nextMemory(memory, 2, 6);
}

describe("switchedStates", () => {
  it("replays a prompt whose whole history the log holds, keeping its due day and reviews", () => {
    // Out of order, and with another deck's and another prompt's answers among them.
    const answers = [
      history[3]!,
      answer("2026-09-03T10:00:00.000Z", { deckUrl: `${DECK}-other` }),
      history[1]!,
      answer("2026-09-03T10:00:00.000Z", { direction: "back-to-front" }),
      history[0]!,
      history[2]!,
    ];
    const { stability, difficulty } = byHand();
    expect(switchedStates(DECK, [state], answers, NOW)).toEqual({
      fsrs: [
        {
          cardId: "c-1",
          direction: "front-to-back",
          stability,
          difficulty,
          due: "2026-09-22",
          firstReviewedAt: state.firstReviewedAt,
          lastReviewedAt: state.lastReviewedAt,
          formatVersion: 1,
        },
      ],
      replayed: 1,
      estimated: 0,
    });
  });

  it("replays from the last introduction, as a forgotten card starts over", () => {
    const forgotten = [
      answer("2026-08-01T10:00:00.000Z", { grade: 5, priorIntervalDays: undefined }),
      answer("2026-08-10T10:00:00.000Z", { grade: 5 }),
    ];
    const switched = switchedStates(DECK, [state], [...forgotten, ...history], NOW);
    expect(switched.replayed).toBe(1);
    expect(switched.fsrs[0]!.stability).toBe(byHand().stability);
  });

  it("reads a right multiple-choice answer as Good", () => {
    const course = history.map((given) => ({
      ...given,
      mode: "multiple-choice" as const,
      grade: 3 as const,
    }));
    let memory = nextMemory(null, 3, 0);
    memory = nextMemory(memory, 3, 0);
    memory = nextMemory(memory, 3, 1);
    memory = nextMemory(memory, 3, 6);
    expect(switchedStates(DECK, [state], course, NOW).fsrs[0]!.stability).toBe(memory.stability);
  });

  it("estimates from SM-2 a prompt whose history the log does not hold whole", () => {
    const estimate = memoryFromSm2(state);
    const cases: Answer[][] = [
      // No answers at all.
      [],
      // No introduction: a card moved in with its progress.
      history.slice(1),
      // The introduction is another than the state's.
      [answer("2026-08-31T10:00:00.000Z", { priorIntervalDays: undefined }), ...history.slice(1)],
      // The last review is missing.
      history.slice(0, 3),
    ];
    for (const answers of cases) {
      const switched = switchedStates(DECK, [state], answers, NOW);
      expect(switched).toMatchObject({ replayed: 0, estimated: 1 });
      expect(switched.fsrs[0]).toMatchObject({ ...estimate, due: state.due });
      expect(switched.fsrs[0]!.previous).toBeUndefined();
    }
  });

  it.each(["+012000-01-01T00:00:00Z", "-0500-01-01T00:00:00Z", "not a date"])(
    "writes now for a first review of %s, and the state stays fresh",
    (reviewed) => {
      const dated = { ...state, firstReviewedAt: reviewed };
      const made = switchedStates(DECK, [dated], [], NOW).fsrs;
      expect(made[0]).toMatchObject({
        due: state.due,
        firstReviewedAt: NOW.toISOString(),
        lastReviewedAt: state.lastReviewedAt,
      });
      // FSRS-6's own view of the prompt, which the SM-2 state's fields would fail.
      expect(effectiveStates([dated], made, "fsrs6", 4)).toEqual([
        {
          cardId: state.cardId,
          direction: state.direction,
          due: state.due,
          intervalDays: daysBetween(studyDayOf(new Date(state.lastReviewedAt), 4), state.due),
          firstReviewedAt: reviewed,
          lastReviewedAt: state.lastReviewedAt,
        },
      ]);
    },
  );

  it.each(["+012000-01-01T00:00:00Z", "-0500-01-01T00:00:00Z", "not a date"])(
    "writes now for a last review of %s, and SM-2 keeps setting the due day",
    (reviewed) => {
      const dated = { ...state, lastReviewedAt: reviewed };
      const made = switchedStates(DECK, [dated], [], NOW).fsrs;
      expect(made[0]).toMatchObject({
        due: state.due,
        firstReviewedAt: state.firstReviewedAt,
        lastReviewedAt: NOW.toISOString(),
      });
      expect(effectiveStates([dated], made, "fsrs6", 4)).toEqual([dated]);
    },
  );

  it("gives a deck without SM-2 states none", () => {
    expect(switchedStates(DECK, [], history, NOW)).toEqual({ fsrs: [], replayed: 0, estimated: 0 });
  });
});
