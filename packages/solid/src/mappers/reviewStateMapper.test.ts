import { describe, expect, it } from "vitest";
import { toReviewState, toReviewStateThing } from "./reviewStateMapper";
import type { ReviewState } from "@solid-memo/domain/review";

const REVIEWS_DOC = "https://pod.example/solid-memo/a/reviews/deck-1.ttl";

const state: ReviewState = {
  cardId: "card-1",
  direction: "front-to-back",
  easeFactor: 2.36,
  intervalDays: 6,
  repetitions: 2,
  due: "2026-09-27",
  firstReviewedAt: "2026-09-15T08:00:00.000Z",
  lastReviewedAt: "2026-09-21T08:12:00.000Z",
  formatVersion: 2,
};

describe("review state mapping", () => {
  it("round-trips a review state through a Thing", () => {
    const thing = toReviewStateThing(REVIEWS_DOC, state);
    expect(toReviewState(thing)).toEqual(state);
  });

  it("keeps the two directions of a card under subjects of their own", () => {
    const reverse: ReviewState = { ...state, direction: "back-to-front" };
    const forwardThing = toReviewStateThing(REVIEWS_DOC, state);
    const reverseThing = toReviewStateThing(REVIEWS_DOC, reverse);
    expect(forwardThing.url).toBe(`${REVIEWS_DOC}#card-1`);
    expect(reverseThing.url).toBe(`${REVIEWS_DOC}#card-1@back-to-front`);
    expect(toReviewState(reverseThing)).toEqual(reverse);
  });

  it("rejects subjects that are not sm:ReviewState", () => {
    const thing = toReviewStateThing(REVIEWS_DOC, state);
    const wrongType = {
      ...thing,
      predicates: {
        ...thing.predicates,
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type": {
          namedNodes: ["https://pod.solid-memo.com/vocab/v1#Card"],
        },
      },
    };
    expect(toReviewState(wrongType)).toBeNull();
  });

  it.each([
    "easeFactor",
    "intervalDays",
    "repetitions",
    "due",
    "firstReviewedAt",
    "lastReviewedAt",
  ])("rejects a subject missing sm:%s", (field) => {
    const thing = toReviewStateThing(REVIEWS_DOC, state);
    const withoutField = {
      ...thing,
      predicates: Object.fromEntries(
        Object.entries(thing.predicates).filter(
          ([predicate]) =>
            predicate !== `https://pod.solid-memo.com/vocab/v1#${field}`,
        ),
      ),
    };
    expect(toReviewState(withoutField)).toBeNull();
  });

  const snapshot = {
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    due: "2026-09-21",
    lastReviewedAt: "2026-09-20T08:00:00.000Z",
  };

  it("round-trips the snapshot a day reset restores", () => {
    const withSnapshot: ReviewState = { ...state, previous: snapshot };
    const thing = toReviewStateThing(REVIEWS_DOC, withSnapshot);
    expect(toReviewState(thing)).toEqual(withSnapshot);
  });

  it("reads states written before snapshots existed", () => {
    const thing = toReviewStateThing(REVIEWS_DOC, state);
    expect(toReviewState(thing)).not.toHaveProperty("previous");
  });

  it.each([
    "previousEaseFactor",
    "previousIntervalDays",
    "previousRepetitions",
    "previousDue",
    "previousLastReviewedAt",
  ])("treats a snapshot missing sm:%s as absent, keeping the state", (field) => {
    const thing = toReviewStateThing(REVIEWS_DOC, {
      ...state,
      previous: snapshot,
    });
    const partial = {
      ...thing,
      predicates: Object.fromEntries(
        Object.entries(thing.predicates).filter(
          ([predicate]) =>
            predicate !== `https://pod.solid-memo.com/vocab/v1#${field}`,
        ),
      ),
    };
    expect(toReviewState(partial)).toEqual(state);
  });
});
