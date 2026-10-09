import { describe, expect, it } from "vitest";
import { buildThing, createSolidDataset, getThing, removeAll } from "@inrupt/solid-client";
import { namedReviewSubject } from "@solid-memo/domain/reviewRecord";
import { toReviewState, toReviewStateThing, withReviewStates } from "./reviewStateMapper";
import type { ReviewState } from "@solid-memo/domain/review";
import { SM } from "../vocab";

const REVIEWS_DOC = "https://pod.example/solid-memo/a/reviews/deck-1.ttl";
const CARDS_DOC = "https://pod.example/solid-memo/a/decks/deck-1.ttl";
const documents = { id: "deck-1", cardsDocumentUrl: CARDS_DOC, reviewsDocumentUrl: REVIEWS_DOC };
/** The state's Thing at the subject the fragment rule names, as written in a new document. */
const thingOf = (written: ReviewState) =>
  toReviewStateThing(documents, written, null, namedReviewSubject(REVIEWS_DOC, written));

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
    const thing = thingOf(state);
    expect(toReviewState(thing, documents)).toEqual(state);
  });

  it("keeps the two directions of a card under subjects of their own", () => {
    const reverse: ReviewState = { ...state, direction: "back-to-front" };
    const written = withReviewStates(createSolidDataset(), documents, [state, reverse], () => "unused");
    expect(written.subjects).toEqual([`${REVIEWS_DOC}#card-1`, `${REVIEWS_DOC}#card-1@back-to-front`]);
    expect(toReviewState(getThing(written.dataset, `${REVIEWS_DOC}#card-1@back-to-front`)!, documents)).toEqual(reverse);
  });

  it("rejects subjects that are not sm:ReviewState", () => {
    const thing = thingOf(state);
    const wrongType = {
      ...thing,
      predicates: {
        ...thing.predicates,
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type": {
          namedNodes: ["https://solid-memo.com/ns/vocab/v1.ttl#Card"],
        },
      },
    };
    expect(toReviewState(wrongType, documents)).toBeNull();
  });

  it.each([
    "easeFactor",
    "intervalDays",
    "repetitions",
    "due",
    "firstReviewedAt",
    "lastReviewedAt",
  ])("rejects a subject missing sm:%s", (field) => {
    const thing = thingOf(state);
    const withoutField = {
      ...thing,
      predicates: Object.fromEntries(
        Object.entries(thing.predicates).filter(
          ([predicate]) =>
            predicate !== `https://solid-memo.com/ns/vocab/v1.ttl#${field}`,
        ),
      ),
    };
    expect(toReviewState(withoutField, documents)).toBeNull();
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
    const thing = thingOf(withSnapshot);
    expect(toReviewState(thing, documents)).toEqual(withSnapshot);
  });

  it("reads states written before snapshots existed", () => {
    const thing = thingOf(state);
    expect(toReviewState(thing, documents)).not.toHaveProperty("previous");
  });

  it.each([
    "previousEaseFactor",
    "previousIntervalDays",
    "previousRepetitions",
    "previousDue",
    "previousLastReviewedAt",
  ])("treats a snapshot missing sm:%s as absent, keeping the state", (field) => {
    const thing = thingOf({ ...state, previous: snapshot });
    const partial = {
      ...thing,
      predicates: Object.fromEntries(
        Object.entries(thing.predicates).filter(
          ([predicate]) =>
            predicate !== `https://solid-memo.com/ns/vocab/v1.ttl#${field}`,
        ),
      ),
    };
    expect(toReviewState(partial, documents)).toEqual(state);
  });
});

describe("what a review state is of", () => {
  const written = thingOf({ ...state, direction: "back-to-front" });
  const without = (predicate: string) => removeAll(written, predicate);

  it("goes by sm:reviewOf and sm:reviewDirection, whatever the subject", () => {
    const named = toReviewStateThing(documents, { ...state, cardId: "card-2", direction: "back-to-front" }, null, `${REVIEWS_DOC}#card-1`);
    expect(toReviewState(named, documents)).toMatchObject({ cardId: "card-2", direction: "back-to-front" });
  });

  it("falls back to the fragment rule for what a state leaves out", () => {
    expect(toReviewState(without(SM.reviewOf), documents)).toMatchObject({ cardId: "card-1", direction: "back-to-front" });
    expect(toReviewState(without(SM.reviewDirection), documents)).toMatchObject({ direction: "back-to-front" });
    const elsewhere = toReviewStateThing(documents, state, null, `${REVIEWS_DOC}#rs-1`);
    expect(toReviewState(removeAll(elsewhere, SM.reviewDirection), documents)).toMatchObject({
      cardId: "card-1",
      direction: "front-to-back",
    });
  });

  it("reads a state of no scheduler, or SM-2's, and no other's", () => {
    expect(toReviewState(without(SM.scheduler), documents)).not.toBeNull();
    const fsrs = buildThing(without(SM.scheduler)).addUrl(SM.scheduler, "https://fsrs.example/ns#fsrs").build();
    expect(toReviewState(fsrs, documents)).toBeNull();
    // A literal is no SM-2 IRI, even one that spells it.
    for (const literal of ["fsrs", SM.sm2]) {
      const named = buildThing(without(SM.scheduler)).addStringNoLocale(SM.scheduler, literal).build();
      expect(toReviewState(named, documents)).toBeNull();
    }
  });

  it("names its card in a cards document the deck had before an upgrade moved it", () => {
    const upgraded = { ...documents, cardsDocumentUrl: "https://pod.example/solid-memo/a/decks/deck-1-u1.ttl" };
    const elsewhere = toReviewStateThing(documents, { ...state, cardId: "card-2" }, null, `${REVIEWS_DOC}#rs-1`);
    expect(toReviewState(elsewhere, upgraded)).toMatchObject({ cardId: "card-2" });
  });

  it("is no state of the deck's when it names a card of another document, or no card", () => {
    expect(toReviewState(written, { ...documents, id: "deck-2", cardsDocumentUrl: "https://pod.example/solid-memo/a/decks/deck-2.ttl" })).toBeNull();
    const noFragment = buildThing(without(SM.reviewOf)).addUrl(SM.reviewOf, CARDS_DOC).build();
    expect(toReviewState(noFragment, documents)).toBeNull();
  });

  it("is not read with a direction other than front to back or back to front", () => {
    const both = buildThing(without(SM.reviewDirection)).addUrl(SM.reviewDirection, SM.bidirectional).build();
    expect(toReviewState(both, documents)).toBeNull();
  });
});
