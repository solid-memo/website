// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { planCardTransfer, type TransferOptions } from "./cardTransfer";
import type { Card } from "./deck";
import type { FsrsState, ReviewState } from "./review";

const SOURCE = {
  url: "https://pod.example/a/catalog.ttl#source",
  cardsDocumentUrl: "https://pod.example/a/decks/source-cards.ttl",
  reviewsDocumentUrl: "https://pod.example/a/reviews/source.ttl",
};
const TARGET = {
  url: "https://pod.example/a/catalog.ttl#target",
  cardsDocumentUrl: "https://pod.example/a/decks/target-cards.ttl",
  reviewsDocumentUrl: "https://pod.example/a/reviews/target.ttl",
};

function card(id: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    url: `https://pod.example/a/decks/source-cards.ttl#${id}`,
    front: { en: id },
    back: { sv: id },
    createdAt: "2026-10-01T10:00:00.000Z",
    formatVersion: 5,
    ...extra,
  };
}

function state(
  cardId: string,
  direction: ReviewState["direction"] = "front-to-back",
  due = "2026-10-12",
): ReviewState {
  return {
    cardId,
    direction,
    easeFactor: 2.5,
    intervalDays: 6,
    repetitions: 2,
    due,
    firstReviewedAt: "2026-10-01T10:00:00.000Z",
    lastReviewedAt: "2026-10-06T10:00:00.000Z",
    formatVersion: 2,
  };
}

/** A card as the target is to hold it: no url nor format of the source's. */
function written({
  url: _url,
  formatVersion: _formatVersion,
  ...kept
}: Card): Omit<Card, "url" | "formatVersion"> {
  return kept;
}

const move: TransferOptions = { mode: "move", keepProgress: true };
const copy: TransferOptions = { mode: "copy", keepProgress: false };

const a = card("a", {
  distractors: [
    { id: "a-d1", text: { sv: "x" } },
    { id: "a-d3", text: { sv: "y" }, retired: true },
  ],
  subjects: ["http://www.wikidata.org/entity/Q34"],
});
const b = card("b", { retired: true });
const sourceStates = [state("a"), state("a", "back-to-front"), state("b", "back-to-front")];

describe("planCardTransfer", () => {
  it("moves cards under their ids, with their distractors, what they are about and review states, in the source's order", () => {
    const plan = planCardTransfer(
      { ...SOURCE, cards: [a, b, card("c")], states: sourceStates },
      { ...TARGET, cards: [], states: [] },
      ["b", "a", "gone"],
      move,
    );
    expect(plan.cards).toEqual([
      { from: "a", to: "a", present: false },
      { from: "b", to: "b", present: false },
    ]);
    expect(plan.missing).toEqual(["gone"]);
    expect(plan.target).toEqual({
      save: [written(a), written(b)],
      reviewSaves: sourceStates,
      reviewRemovals: [],
      fsrsSaves: [],
      fsrsRemovals: [
        { cardId: "a", direction: "front-to-back" },
        { cardId: "a", direction: "back-to-front" },
        { cardId: "b", direction: "back-to-front" },
      ],
    });
    expect(plan.source).toEqual({
      remove: ["a", "b"],
      reviewRemovals: [
        { cardId: "a", direction: "front-to-back" },
        { cardId: "a", direction: "back-to-front" },
        { cardId: "b", direction: "back-to-front" },
      ],
    });
  });

  it("carries a card's FSRS-6 state with its SM-2 state, under its id in the target", () => {
    const fsrs: FsrsState = {
      cardId: "a",
      direction: "front-to-back",
      stability: 8,
      difficulty: 5,
      due: "2026-10-14",
      firstReviewedAt: "2026-10-01T10:00:00.000Z",
      lastReviewedAt: "2026-10-06T10:00:00.000Z",
      formatVersion: 1,
    };
    const plan = planCardTransfer(
      { ...SOURCE, cards: [a], states: sourceStates, fsrs: [fsrs] },
      { ...TARGET, cards: [card("a", { front: { en: "other" } })], states: [] },
      ["a"],
      move,
    );
    expect(plan.target.fsrsSaves).toEqual([{ ...fsrs, cardId: "a-2" }]);
    expect(plan.target.fsrsRemovals).toEqual([{ cardId: "a-2", direction: "back-to-front" }]);
    const fresh = planCardTransfer(
      { ...SOURCE, cards: [a], states: sourceStates, fsrs: [fsrs] },
      { ...TARGET, cards: [], states: [] },
      ["a"],
      { mode: "copy", keepProgress: false },
    );
    expect(fresh.target.fsrsSaves).toEqual([]);
  });

  it("removes an FSRS-6 state without an SM-2 state beside it with its card, and does not carry it", () => {
    const orphan: FsrsState = {
      cardId: "b",
      direction: "front-to-back",
      stability: 8,
      difficulty: 5,
      due: "2026-10-14",
      firstReviewedAt: "2026-10-01T10:00:00.000Z",
      lastReviewedAt: "2026-10-06T10:00:00.000Z",
      formatVersion: 1,
    };
    const plan = planCardTransfer(
      { ...SOURCE, cards: [b], states: sourceStates, fsrs: [orphan] },
      { ...TARGET, cards: [], states: [], fsrs: [orphan] },
      ["b"],
      move,
    );
    expect(plan.target.fsrsSaves).toEqual([]);
    expect(plan.target.reviewRemovals).toEqual([{ cardId: "b", direction: "front-to-back" }]);
    expect(plan.source.reviewRemovals).toEqual([
      { cardId: "b", direction: "front-to-back" },
      { cardId: "b", direction: "back-to-front" },
    ]);
  });

  it("gives a card whose id the target uses the first free one, its distractors renumbered and states re-keyed", () => {
    const target = [
      card("a", { front: { en: "other" } }),
      card("a-2", { front: { en: "other" } }),
      card("z", { distractors: [{ id: "a-3-d1", text: { sv: "q" } }] }),
    ];
    const plan = planCardTransfer(
      { ...SOURCE, cards: [a], states: sourceStates },
      { ...TARGET, cards: target, states: [] },
      ["a"],
      move,
    );
    expect(plan.cards).toEqual([{ from: "a", to: "a-4", present: false }]);
    expect(plan.target.save).toEqual([
      {
        ...written(a),
        id: "a-4",
        distractors: [
          { id: "a-4-d1", text: { sv: "x" } },
          { id: "a-4-d2", text: { sv: "y" }, retired: true },
        ],
      },
    ]);
    expect(plan.target.reviewSaves.map((s) => [s.cardId, s.direction, s.due])).toEqual([
      ["a-4", "front-to-back", "2026-10-12"],
      ["a-4", "back-to-front", "2026-10-12"],
    ]);
  });

  it("keeps a card's id when only a distractor's is taken… unless its own distractor's is", () => {
    const plan = planCardTransfer(
      { ...SOURCE, cards: [a], states: [] },
      {
        ...TARGET,
        cards: [card("y", { distractors: [{ id: "a-d1", text: { sv: "q" } }] })],
        states: [],
      },
      ["a"],
      copy,
    );
    expect(plan.cards).toEqual([{ from: "a", to: "a-2", present: false }]);
  });

  it("gives two cards of one transfer different ids", () => {
    const plan = planCardTransfer(
      { ...SOURCE, cards: [card("a"), card("a-2")], states: [] },
      { ...TARGET, cards: [card("a", { front: { en: "other" } })], states: [] },
      ["a", "a-2"],
      copy,
    );
    expect(plan.cards.map((c) => c.to)).toEqual(["a-2", "a-2-2"]);
  });

  it("finishes a move stopped after the target was written: the cards are present, the states written once", () => {
    const source = {
      ...SOURCE,
      cards: [card("a"), card("a-2")],
      states: [state("a"), state("a-2")],
    };
    const first = planCardTransfer(
      source,
      { ...TARGET, cards: [card("a", { front: { en: "other" } })], states: [] },
      ["a", "a-2"],
      move,
    );
    expect(first.cards.map((c) => c.to)).toEqual(["a-2", "a-2-2"]);
    const after = [
      card("a", { front: { en: "other" } }),
      ...first.target.save.map((saved) => card(saved.id, { ...saved, retired: undefined })),
    ];

    // The states did not make it: they are written now.
    const retry = planCardTransfer(
      source,
      { ...TARGET, cards: after, states: [] },
      ["a", "a-2"],
      move,
    );
    expect(retry.cards).toEqual([
      { from: "a", to: "a-2", present: true },
      { from: "a-2", to: "a-2-2", present: true },
    ]);
    expect(retry.target.save).toEqual([]);
    expect(retry.target.reviewSaves.map((s) => s.cardId)).toEqual(["a-2", "a-2-2"]);
    expect(retry.source.remove).toEqual(["a", "a-2"]);

    // They did: a card present keeps the state it has there.
    const states = [state("a-2", "front-to-back", "2026-12-01"), state("a-2-2")];
    const again = planCardTransfer(source, { ...TARGET, cards: after, states }, ["a", "a-2"], move);
    expect(again.target).toEqual({
      save: [],
      reviewSaves: [],
      reviewRemovals: [],
      fsrsSaves: [],
      fsrsRemovals: [],
    });
  });

  it("never finds two cards saying the same present at one id", () => {
    const same = { front: { en: "same" }, back: { sv: "samma" } };
    const source = {
      ...SOURCE,
      cards: [card("a", same), card("a-2", same)],
      states: [state("a"), state("a-2", "back-to-front")],
    };
    const first = planCardTransfer(
      source,
      { ...TARGET, cards: [card("a", { front: { en: "other" } })], states: [] },
      ["a", "a-2"],
      move,
    );
    expect(first.cards.map((c) => c.to)).toEqual(["a-2", "a-2-2"]);
    const after = [
      card("a", { front: { en: "other" } }),
      ...first.target.save.map((saved) => card(saved.id, saved)),
    ];

    const retry = planCardTransfer(
      source,
      { ...TARGET, cards: after, states: [] },
      ["a", "a-2"],
      move,
    );
    expect(retry.cards).toEqual([
      { from: "a", to: "a-2", present: true },
      { from: "a-2", to: "a-2-2", present: true },
    ]);
    expect(retry.target.save).toEqual([]);
    expect(
      retry.target.reviewSaves.map(({ cardId, direction }) => ({ cardId, direction })),
    ).toEqual([
      { cardId: "a-2", direction: "front-to-back" },
      { cardId: "a-2-2", direction: "back-to-front" },
    ]);
  });

  it("copies without progress: the source untouched, a state left at a new card's id removed", () => {
    const plan = planCardTransfer(
      { ...SOURCE, cards: [a, b], states: sourceStates },
      { ...TARGET, cards: [], states: [state("a", "back-to-front")] },
      ["a", "b"],
      copy,
    );
    expect(plan.target.reviewSaves).toEqual([]);
    expect(plan.target.reviewRemovals).toEqual([{ cardId: "a", direction: "back-to-front" }]);
    expect(plan.source).toEqual({ remove: [], reviewRemovals: [] });
  });

  it("leaves a card present in the target as it is there without progress", () => {
    const plan = planCardTransfer(
      { ...SOURCE, cards: [b], states: sourceStates },
      { ...TARGET, cards: [card("b")], states: [state("b")] },
      ["b"],
      { mode: "move", keepProgress: false },
    );
    expect(plan.cards).toEqual([{ from: "b", to: "b", present: true }]);
    expect(plan.target).toEqual({
      save: [],
      reviewSaves: [],
      reviewRemovals: [],
      fsrsSaves: [],
      fsrsRemovals: [],
    });
    expect(plan.source).toEqual({
      remove: ["b"],
      reviewRemovals: [{ cardId: "b", direction: "back-to-front" }],
    });
  });

  it("refuses a transfer to the deck the cards are in", () => {
    expect(() =>
      planCardTransfer(
        { ...SOURCE, cards: [a], states: [] },
        { ...SOURCE, cards: [a], states: [] },
        ["a"],
        move,
      ),
    ).toThrow(expect.objectContaining({ code: "cardTransferSameDeck" }));
  });

  // Two entries over one document read the same cards on both sides: a move would find
  // them all in the target, write nothing there, and remove them from the one document.
  it.each([
    ["move", { cardsDocumentUrl: SOURCE.cardsDocumentUrl }],
    ["copy", { cardsDocumentUrl: "https://POD.example/a/decks/../decks/source-cards.ttl" }],
    ["move", { reviewsDocumentUrl: "https://pod.example:443/a/reviews/source.ttl" }],
    ["copy", { reviewsDocumentUrl: SOURCE.reviewsDocumentUrl }],
    ["move", { cardsDocumentUrl: "https://pod.example/a/decks/%73ource-cards.ttl" }],
    ["copy", { cardsDocumentUrl: "https://pod.example/a/de%63ks/source-cards.ttl" }],
    ["copy", { cardsDocumentUrl: "https://pod.example./a/decks/source-cards.ttl" }],
    ["move", { reviewsDocumentUrl: "https://pod.example/a/reviews/source%2Ettl" }],
    ["move", { cardsDocumentUrl: "https://alice:secret@pod.example/a/decks/source-cards.ttl" }],
    ["copy", { reviewsDocumentUrl: "https://alice@pod.example/a/reviews/source.ttl" }],
    ["move", { cardsDocumentUrl: SOURCE.reviewsDocumentUrl }],
    ["copy", { reviewsDocumentUrl: SOURCE.cardsDocumentUrl }],
  ] as const)("refuses a %s to another entry over a document of the source's", (mode, shared) => {
    const cards = [card("c1"), card("c2")];
    const states = [state("c1"), state("c2")];
    expect(() =>
      planCardTransfer(
        { ...SOURCE, cards, states },
        { ...TARGET, ...shared, cards, states },
        ["c1", "c2"],
        { mode, keepProgress: true },
      ),
    ).toThrow(expect.objectContaining({ code: "cardTransferSameDeck" }));
  });

  it("reads an escape that needs one in any case as the same", () => {
    const at = (cardsDocumentUrl: string) => ({
      ...SOURCE,
      cardsDocumentUrl,
      cards: [a],
      states: [],
    });
    expect(() =>
      planCardTransfer(
        at("https://pod.example/a/decks/%c3%a9.ttl"),
        {
          ...at("https://pod.example/a/decks/%C3%A9.ttl"),
          url: TARGET.url,
          reviewsDocumentUrl: TARGET.reviewsDocumentUrl,
        },
        ["a"],
        copy,
      ),
    ).toThrow(expect.objectContaining({ code: "cardTransferSameDeck" }));
  });

  it("compares text that is no URL as it is written", () => {
    expect(() =>
      planCardTransfer(
        { ...SOURCE, cardsDocumentUrl: "not a url", cards: [a], states: [] },
        { ...TARGET, cardsDocumentUrl: "not a url either", cards: [], states: [] },
        ["a"],
        copy,
      ),
    ).not.toThrow();
  });
});
