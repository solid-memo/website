// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { FsrsState, ReviewState } from "./review";
import {
  FSRS6_SCHEDULER,
  fsrsKeyOfLinks,
  fsrsReviewStateFromRecord,
  fsrsReviewStateToRecord,
  namedFsrsSubject,
  namedReviewSubject,
  pickReviewStates,
  reviewFragmentOf,
  reviewKeyOf,
  reviewKeyOfSubject,
  reviewStateFromRecord,
  reviewStateToRecord,
  SM2_SCHEDULER,
} from "./reviewRecord";

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const CARDS = "https://pod.example/a/decks/deck-1.ttl";
const REVIEWS = "https://pod.example/a/reviews/deck-1.ttl";
const DECK = { id: "deck-1", cardsDocumentUrl: CARDS };

const key = { cardId: "card-1", direction: "front-to-back" as const };
const state: ReviewState = {
  ...key,
  easeFactor: 2.36,
  intervalDays: 6,
  repetitions: 2,
  due: "2026-09-27",
  firstReviewedAt: "2026-09-15T08:00:00.000Z",
  lastReviewedAt: "2026-09-21T08:12:00.000Z",
  formatVersion: 2,
};
const snapshot = {
  easeFactor: 2.5,
  intervalDays: 1,
  repetitions: 1,
  due: "2026-09-21",
  lastReviewedAt: "2026-09-20T08:00:00.000Z",
};

describe("review subjects", () => {
  it("name the direction in the fragment", () => {
    expect(reviewFragmentOf(key)).toBe("card-1");
    expect(reviewFragmentOf({ cardId: "card-1", direction: "back-to-front" })).toBe(
      "card-1@back-to-front",
    );
    expect(reviewKeyOf("card-1")).toEqual(key);
    expect(reviewKeyOf("card-1@back-to-front")).toEqual({
      cardId: "card-1",
      direction: "back-to-front",
    });
  });
});

describe("review state records", () => {
  it("round-trip a state without a snapshot", () => {
    const record = reviewStateToRecord(state, CARDS);
    expect(record).toEqual({
      easeFactor: 2.36,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-09-27",
      firstReviewedAt: state.firstReviewedAt,
      lastReviewedAt: state.lastReviewedAt,
      reviewOf: `${CARDS}#card-1`,
      direction: `${SM}frontToBack`,
      scheduler: SM2_SCHEDULER,
    });
    expect(SM2_SCHEDULER).toBe(`${SM}sm2`);
    expect(reviewStateFromRecord(key, 2, record)).toEqual(state);
  });

  it("round-trip the snapshot, keeping the stored version", () => {
    const withSnapshot = { ...state, previous: snapshot, formatVersion: 1 };
    const record = reviewStateToRecord(withSnapshot, CARDS);
    expect(record).toMatchObject({
      previousEaseFactor: 2.5,
      previousIntervalDays: 1,
      previousRepetitions: 1,
      previousDue: "2026-09-21",
      previousLastReviewedAt: snapshot.lastReviewedAt,
    });
    expect(reviewStateFromRecord(key, 1, record)).toEqual(withSnapshot);
  });

  it.each([
    "previousEaseFactor",
    "previousIntervalDays",
    "previousRepetitions",
    "previousDue",
    "previousLastReviewedAt",
  ])("read a snapshot missing %s as no snapshot", (field) => {
    const record = { ...reviewStateToRecord({ ...state, previous: snapshot }, CARDS) };
    delete (record as Record<string, unknown>)[field];
    expect(reviewStateFromRecord(key, 2, record)).toEqual(state);
  });
});

describe("what a stored review state is of", () => {
  const subject = (fragment: string) => `${REVIEWS}#${fragment}`;

  it("goes by the subject's name where the state names nothing", () => {
    expect(reviewKeyOfSubject(subject("card-1@back-to-front"), DECK, {})).toEqual({
      cardId: "card-1",
      direction: "back-to-front",
    });
    expect(reviewKeyOfSubject(subject("card-1"), DECK, { anotherScheduler: false })).toEqual(key);
  });

  it("goes by the card and direction the state names, over its name", () => {
    expect(
      reviewKeyOfSubject(subject("card-1"), DECK, {
        reviewOf: `${CARDS}#card-2`,
        direction: `${SM}backToFront`,
      }),
    ).toEqual({ cardId: "card-2", direction: "back-to-front" });
    expect(
      reviewKeyOfSubject(subject("rs-1@back-to-front"), DECK, { reviewOf: `${CARDS}#card-2` }),
    ).toEqual({
      cardId: "card-2",
      direction: "back-to-front",
    });
    expect(
      reviewKeyOfSubject(subject("card-1@back-to-front"), DECK, { direction: `${SM}frontToBack` }),
    ).toEqual(key);
  });

  it("takes the card from a link to the deck's cards document before an upgrade moved them", () => {
    const upgraded = {
      id: "deck-1",
      cardsDocumentUrl: "https://pod.example/a/decks/deck-1-u2.ttl",
    };
    for (const former of [
      CARDS,
      "https://pod.example/a/decks/deck-1-u1.ttl",
      upgraded.cardsDocumentUrl,
    ]) {
      expect(
        reviewKeyOfSubject(subject("rs-1"), upgraded, { reviewOf: `${former}#card-2` }),
      ).toEqual({
        cardId: "card-2",
        direction: "front-to-back",
      });
    }
  });

  it("is nothing this app schedules for another scheduler, a card elsewhere or another direction", () => {
    expect(reviewKeyOfSubject(subject("card-1"), DECK, { anotherScheduler: true })).toBeNull();
    expect(
      reviewKeyOfSubject(subject("card-1"), DECK, {
        reviewOf: "https://pod.example/a/decks/deck-2.ttl#card-1",
      }),
    ).toBeNull();
    expect(
      reviewKeyOfSubject(subject("card-1"), DECK, {
        reviewOf: "https://pod.example/a/decks/deck-10.ttl#card-1",
      }),
    ).toBeNull();
    expect(
      reviewKeyOfSubject(subject("card-1"), DECK, {
        reviewOf: "https://pod.example/b/decks/deck-1.ttl#card-1",
      }),
    ).toBeNull();
    expect(reviewKeyOfSubject(subject("card-1"), DECK, { reviewOf: CARDS })).toBeNull();
    expect(
      reviewKeyOfSubject(subject("card-1"), DECK, { direction: `${SM}bidirectional` }),
    ).toBeNull();
  });

  it("reads no card from a subject named as an FSRS-6 state's, unless the state names both", () => {
    expect(reviewKeyOfSubject(subject("card-1@fsrs6"), DECK, {})).toBeNull();
    expect(
      reviewKeyOfSubject(subject("card-1@back-to-front@fsrs6"), DECK, {
        reviewOf: `${CARDS}#card-1`,
      }),
    ).toBeNull();
    expect(
      reviewKeyOfSubject(subject("card-1@fsrs6"), DECK, {
        reviewOf: `${CARDS}#card-1`,
        direction: `${SM}frontToBack`,
      }),
    ).toEqual(key);
  });
});

describe("what a stored FSRS-6 state is of", () => {
  const links = { reviewOf: `${CARDS}#card-2`, direction: `${SM}backToFront` };

  it("goes by its links alone", () => {
    expect(fsrsKeyOfLinks(DECK, links)).toEqual({ cardId: "card-2", direction: "back-to-front" });
    expect(fsrsKeyOfLinks(DECK, { anotherScheduler: true, ...links })).toEqual({
      cardId: "card-2",
      direction: "back-to-front",
    });
  });

  it("is nothing without both links, of a card elsewhere or of another direction", () => {
    expect(fsrsKeyOfLinks(DECK, { reviewOf: links.reviewOf })).toBeNull();
    expect(fsrsKeyOfLinks(DECK, { direction: links.direction })).toBeNull();
    expect(
      fsrsKeyOfLinks(DECK, { ...links, reviewOf: "https://pod.example/a/decks/deck-2.ttl#c" }),
    ).toBeNull();
    expect(fsrsKeyOfLinks(DECK, { ...links, direction: `${SM}bidirectional` })).toBeNull();
  });
});

describe("FSRS-6 state records", () => {
  const fsrs: FsrsState = {
    ...key,
    stability: 12.5,
    difficulty: 4.25,
    due: "2026-10-03",
    firstReviewedAt: "2026-09-15T08:00:00.000Z",
    lastReviewedAt: "2026-09-21T08:12:00.000Z",
    formatVersion: 1,
  };
  const previous = {
    stability: 3.2,
    difficulty: 4.5,
    due: "2026-09-21",
    lastReviewedAt: "2026-09-18T08:00:00.000Z",
  };

  it("names the scheduler by its notation", () => {
    expect(FSRS6_SCHEDULER).toBe(`${SM}fsrs6`);
  });

  it("are named after the SM-2 state of the same prompt", () => {
    expect(namedFsrsSubject(REVIEWS, key)).toBe(`${REVIEWS}#card-1@fsrs6`);
    expect(namedFsrsSubject(REVIEWS, { cardId: "card-1", direction: "back-to-front" })).toBe(
      `${REVIEWS}#card-1@back-to-front@fsrs6`,
    );
  });

  it("round-trip a state without a snapshot", () => {
    const record = fsrsReviewStateToRecord(fsrs, CARDS);
    expect(record).toEqual({
      reviewOf: `${CARDS}#card-1`,
      direction: `${SM}frontToBack`,
      stability: 12.5,
      difficulty: 4.25,
      due: "2026-10-03",
      firstReviewedAt: "2026-09-15T08:00:00.000Z",
      lastReviewedAt: "2026-09-21T08:12:00.000Z",
    });
    expect(fsrsReviewStateFromRecord(key, 1, record)).toEqual(fsrs);
  });

  it("round-trip the snapshot, and read a partial one as none", () => {
    const record = fsrsReviewStateToRecord({ ...fsrs, previous }, CARDS);
    expect(record).toMatchObject({
      previousStability: 3.2,
      previousDifficulty: 4.5,
      previousDue: "2026-09-21",
      previousLastReviewedAt: "2026-09-18T08:00:00.000Z",
    });
    expect(fsrsReviewStateFromRecord(key, 1, record)).toEqual({ ...fsrs, previous });
    for (const left of [
      "previousStability",
      "previousDifficulty",
      "previousDue",
      "previousLastReviewedAt",
    ] as const) {
      const { [left]: _gone, ...partial } = record;
      expect(fsrsReviewStateFromRecord(key, 1, partial)).toEqual(fsrs);
    }
  });
});

describe("picking one state per card and direction", () => {
  const at = (
    fragment: string,
    cardId = "card-1",
    direction: "front-to-back" | "back-to-front" = "front-to-back",
  ) => ({
    url: `${REVIEWS}#${fragment}`,
    key: { cardId, direction },
  });

  it("names the subject the fragment rule gives", () => {
    expect(namedReviewSubject(REVIEWS, { cardId: "card-1", direction: "back-to-front" })).toBe(
      `${REVIEWS}#card-1@back-to-front`,
    );
  });

  it("keeps the state named for its card and direction, else the first by IRI, in document order", () => {
    const named = at("card-1");
    const card2 = at("rs-0", "card-2");
    const reverse = at("rs-5", "card-1", "back-to-front");
    expect(pickReviewStates(REVIEWS, [at("rs-2"), card2, named, at("rs-1"), reverse])).toEqual([
      card2,
      named,
      reverse,
    ]);
    const first = at("rs-1");
    expect(pickReviewStates(REVIEWS, [at("rs-3"), first, at("rs-2")])).toEqual([first]);
    expect(pickReviewStates(REVIEWS, [named, at("rs-1")])).toEqual([named]);
  });

  it("keeps the FSRS-6 state at the subject it is named at, given how FSRS-6 states are named", () => {
    const named = at("card-1@fsrs6");
    expect(pickReviewStates(REVIEWS, [at("card-1"), named], namedFsrsSubject)).toEqual([named]);
  });
});
