// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { pickShape } from "./registry";
import {
  AGENT_V1,
  CARD_V1,
  CARD_V2,
  CARD_V5,
  CATALOG_V1,
  CHAPTER_V1,
  DECK_GROUP_V1,
  DECK_V2,
  DECK_V6,
  DISTRACTOR_V1,
  DRAFT_CHAPTER_V1,
  DRAFT_DECK_V1,
  DRAFT_STEP_V1,
  FSRS_REVIEW_STATE_V1,
  LIBRARY_DECK_V1,
  LIBRARY_DECK_V5,
  LIBRARY_DECK_V6,
  REVIEW_STATE_V1,
  REVIEW_STATE_V2,
  SHAPES,
  STEP_V1,
} from "@solid-memo/vocab/descriptors.generated";

/** pickShape for a subject with the given values of the predicates shapes fix, none by default. */
const pick = (
  types: readonly string[],
  version: number,
  context: "pod" | "library" | "draft",
  values: Record<string, readonly string[]> = {},
) => pickShape(types, version, context, (predicate) => values[predicate] ?? []);

const DCAT_CATALOG = "http://www.w3.org/ns/dcat#Catalog";
const DCAT_DATASET = "http://www.w3.org/ns/dcat#Dataset";

describe("the generated registry", () => {
  it("has every version from 1 to the latest of each kind", () => {
    for (const [shape, latest] of Object.entries(LATEST_VERSION)) {
      const versions = Object.values(SHAPES[shape as keyof typeof SHAPES]);
      expect(
        versions.map((d) => d.version),
        shape,
      ).toEqual(Array.from({ length: latest }, (_, i) => i + 1));
      expect(
        versions.every((d) => d.shape === shape),
        shape,
      ).toBe(true);
    }
  });
});

describe("pickShape", () => {
  it("picks the shape by class, version and context", () => {
    expect(pick([SM.Card], 2, "pod")).toEqual({ kind: "shape", descriptor: CARD_V2 });
    expect(pick([SM.Card], 1, "library")).toEqual({ kind: "shape", descriptor: CARD_V1 });
    expect(pick(["https://other.example/#Thing", SM.Deck], 2, "pod")).toEqual({
      kind: "shape",
      descriptor: DECK_V2,
    });
    expect(pick([SM.Deck], 1, "library")).toEqual({
      kind: "shape",
      descriptor: LIBRARY_DECK_V1,
    });
  });

  it("picks deck format 6 in a pod and library deck formats 5 and 6 in the library, from separate shape documents", () => {
    expect(pick([SM.Deck], 6, "pod")).toEqual({ kind: "shape", descriptor: DECK_V6 });
    expect(pick([SM.Deck], 5, "library")).toEqual({
      kind: "shape",
      descriptor: LIBRARY_DECK_V5,
    });
    expect(pick([SM.Deck], 6, "library")).toEqual({
      kind: "shape",
      descriptor: LIBRARY_DECK_V6,
    });
    expect(LIBRARY_DECK_V5.shapeDocument).toBe("library-deck/v5.ttl");
    expect(LIBRARY_DECK_V6.shapeDocument).toBe("library-deck/v6.ttl");
    expect(pick([SM.Deck], 7, "library")).toEqual({
      kind: "unknown-version",
      shape: "libraryDeck",
      version: 7,
      latest: 6,
    });
  });

  it("picks the draft shapes in a draft, and the shapes every context shares for what a draft holds", () => {
    expect(pick([SM.Deck], 1, "draft")).toEqual({ kind: "shape", descriptor: DRAFT_DECK_V1 });
    expect(pick([SM.Chapter], 1, "draft")).toEqual({
      kind: "shape",
      descriptor: DRAFT_CHAPTER_V1,
    });
    expect(pick([SM.Step], 1, "draft")).toEqual({ kind: "shape", descriptor: DRAFT_STEP_V1 });
    expect(pick([SM.Card], 5, "draft")).toEqual({ kind: "shape", descriptor: CARD_V5 });
    expect(pick([SM.Distractor], 1, "draft")).toEqual({
      kind: "shape",
      descriptor: DISTRACTOR_V1,
    });
    expect(pick(["http://xmlns.com/foaf/0.1/Agent"], 1, "draft")).toEqual({
      kind: "shape",
      descriptor: AGENT_V1,
    });
    expect(DRAFT_DECK_V1.shapeDocument).toBe("draft-deck/v1.ttl");
    // A release's chapters and steps are checked as the release's, a draft's as the draft's.
    expect(pick([SM.Chapter], 1, "library")).toEqual({
      kind: "shape",
      descriptor: CHAPTER_V1,
    });
    expect(pick([SM.Step], 1, "library")).toEqual({ kind: "shape", descriptor: STEP_V1 });
    expect(pick([SM.Deck], 6, "draft")).toEqual({
      kind: "unknown-version",
      shape: "draftDeck",
      version: 6,
      latest: 1,
    });
    expect(pick([SM.Chapter], 1, "pod")).toEqual({ kind: "untyped" });
  });

  it("reports a version it does not know, with the latest it does", () => {
    expect(pick([SM.Card], 8, "pod")).toEqual({
      kind: "unknown-version",
      shape: "card",
      version: 8,
      latest: 7,
    });
    expect(pick([SM.Instance], 0, "pod")).toEqual({
      kind: "unknown-version",
      shape: "instance",
      version: 0,
      latest: 2,
    });
  });

  it("leaves subjects without a Solid Memo class alone", () => {
    expect(pick([], 1, "pod")).toEqual({ kind: "untyped" });
    expect(pick(["https://other.example/#Thing"], 1, "library")).toEqual({
      kind: "untyped",
    });
  });

  it("checks a deck group as a deck group, not as the catalog it also is", () => {
    for (const types of [
      [SM.DeckGroup, DCAT_CATALOG],
      [DCAT_CATALOG, SM.DeckGroup],
    ]) {
      expect(pick(types, 1, "pod"), types.join(" ")).toEqual({
        kind: "shape",
        descriptor: DECK_GROUP_V1,
      });
    }
    expect(pick([DCAT_CATALOG], 1, "pod")).toEqual({ kind: "shape", descriptor: CATALOG_V1 });
    expect(pick([DCAT_CATALOG, SM.DeckGroup], 2, "pod")).toEqual({
      kind: "unknown-version",
      shape: "deckGroup",
      version: 2,
      latest: 1,
    });
    expect(pick([SM.Deck, DCAT_DATASET], 6, "pod")).toEqual({
      kind: "shape",
      descriptor: DECK_V6,
    });
  });

  it("tells an FSRS-6 review state from an SM-2 one by its scheduler, the shape that fixes it first", () => {
    const fsrs6 = { [SM.scheduler]: [SM.fsrs6] };
    expect(pick([SM.ReviewState], 1, "pod", fsrs6)).toEqual({
      kind: "shape",
      descriptor: FSRS_REVIEW_STATE_V1,
    });
    // Every place shares the shape, as it does the review-state shapes.
    expect(pick([SM.ReviewState], 1, "library", fsrs6)).toEqual({
      kind: "shape",
      descriptor: FSRS_REVIEW_STATE_V1,
    });
    expect(pick([SM.ReviewState], 2, "pod", fsrs6)).toEqual({
      kind: "unknown-version",
      shape: "fsrsReviewState",
      version: 2,
      latest: 1,
    });
    // Without the fixed value, never the FSRS-6 shape: SM-2's, another
    // scheduler's or none named.
    for (const values of [
      {} as Record<string, readonly string[]>,
      { [SM.scheduler]: [SM.sm2] },
      { [SM.scheduler]: ["https://scheduler.example/ns#fsrs"] },
    ]) {
      expect(pick([SM.ReviewState], 1, "pod", values)).toEqual({
        kind: "shape",
        descriptor: REVIEW_STATE_V1,
      });
      expect(pick([SM.ReviewState], 2, "pod", values)).toEqual({
        kind: "shape",
        descriptor: REVIEW_STATE_V2,
      });
      expect(pick([SM.ReviewState], 3, "pod", values)).toEqual({
        kind: "unknown-version",
        shape: "reviewState",
        version: 3,
        latest: 2,
      });
    }
    expect(FSRS_REVIEW_STATE_V1.fixedValues).toEqual([
      { predicate: SM.scheduler, value: SM.fsrs6 },
    ]);
  });
});
