// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { pickShapes } from "./registry";
import {
  AGENT_V1,
  ALL_SHAPES,
  ANSWER_V1,
  CARD_V1,
  CARD_V2,
  CARD_V5,
  CARD_V6,
  CARD_V7,
  CATALOG_V1,
  CHAPTER_V1,
  DECK_GROUP_V1,
  DECK_V2,
  DECK_V6,
  DISTRACTOR_V1,
  DISTRIBUTION_V1,
  DRAFT_CHAPTER_V1,
  DRAFT_DECK_V1,
  DRAFT_STEP_V1,
  FSRS_REVIEW_STATE_V1,
  INSTANCE_V1,
  LIBRARY_DECK_SERIES_V1,
  LIBRARY_DECK_SERIES_V2,
  LIBRARY_DECK_V1,
  LIBRARY_DECK_V5,
  LIBRARY_DECK_V6,
  PREFERENCES_V1,
  REVIEW_STATE_V1,
  REVIEW_STATE_V2,
  SHAPES,
  STEP_V1,
} from "@solid-memo/vocab/descriptors.generated";

/** pickShapes for a subject with the given values of the predicates shapes fix, none by default. */
const pick = (
  types: readonly string[],
  version: number,
  context: "pod" | "library" | "draft",
  values: Record<string, readonly string[]> = {},
) => pickShapes(types, version, context, (predicate) => values[predicate] ?? []);

/** What a subject of one class, with a shape at its version, is checked against. */
const one = (descriptor: ShapeDescriptor) => ({
  kind: "shapes",
  descriptors: [descriptor],
  unknown: [],
});

const DCAT_CATALOG = "http://www.w3.org/ns/dcat#Catalog";
const DCAT_DATASET = "http://www.w3.org/ns/dcat#Dataset";
const DCAT_DISTRIBUTION = "http://www.w3.org/ns/dcat#Distribution";
const DCAT_SERIES = "http://www.w3.org/ns/dcat#DatasetSeries";
const FOAF_AGENT = "http://xmlns.com/foaf/0.1/Agent";

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

describe("pickShapes", () => {
  it("picks the shape by class, version and context", () => {
    expect(pick([SM.Card], 2, "pod")).toEqual(one(CARD_V2));
    expect(pick([SM.Card], 1, "library")).toEqual(one(CARD_V1));
    expect(pick(["https://other.example/#Thing", SM.Deck], 2, "pod")).toEqual(one(DECK_V2));
    expect(pick([SM.Deck], 1, "library")).toEqual(one(LIBRARY_DECK_V1));
  });

  it("picks deck format 6 in a pod and library deck formats 5 and 6 in the library, from separate shape documents", () => {
    expect(pick([SM.Deck], 6, "pod")).toEqual(one(DECK_V6));
    expect(pick([SM.Deck], 5, "library")).toEqual(one(LIBRARY_DECK_V5));
    expect(pick([SM.Deck], 6, "library")).toEqual(one(LIBRARY_DECK_V6));
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
    expect(pick([SM.Deck], 1, "draft")).toEqual(one(DRAFT_DECK_V1));
    expect(pick([SM.Chapter], 1, "draft")).toEqual(one(DRAFT_CHAPTER_V1));
    expect(pick([SM.Step], 1, "draft")).toEqual(one(DRAFT_STEP_V1));
    expect(pick([SM.Card], 5, "draft")).toEqual(one(CARD_V5));
    expect(pick([SM.Distractor], 1, "draft")).toEqual(one(DISTRACTOR_V1));
    expect(pick(["http://xmlns.com/foaf/0.1/Agent"], 1, "draft")).toEqual(one(AGENT_V1));
    expect(DRAFT_DECK_V1.shapeDocument).toBe("draft-deck/v1.ttl");
    // A release's chapters and steps are checked as the release's, a draft's as the draft's.
    expect(pick([SM.Chapter], 1, "library")).toEqual(one(CHAPTER_V1));
    expect(pick([SM.Step], 1, "library")).toEqual(one(STEP_V1));
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
      expect(pick(types, 1, "pod"), types.join(" ")).toEqual(one(DECK_GROUP_V1));
    }
    expect(pick([DCAT_CATALOG], 1, "pod")).toEqual(one(CATALOG_V1));
    expect(pick([DCAT_CATALOG, SM.DeckGroup], 2, "pod")).toEqual({
      kind: "unknown-version",
      shape: "deckGroup",
      version: 2,
      latest: 1,
    });
    expect(pick([SM.Deck, DCAT_DATASET], 6, "pod")).toEqual(one(DECK_V6));
    // There is no deck group in a release, so nothing there passes for one.
    expect(pick([DCAT_CATALOG], 1, "library")).toEqual(one(CATALOG_V1));
  });

  it("holds a subject to a standard class's shape beside a Solid Memo class, in whatever order it names them", () => {
    for (const types of [
      [FOAF_AGENT, SM.Preferences],
      [SM.Preferences, FOAF_AGENT],
    ]) {
      expect(pick(types, 1, "pod"), types.join(" ")).toEqual({
        kind: "shapes",
        descriptors: [PREFERENCES_V1, AGENT_V1],
        unknown: [],
      });
    }
    expect(pick([DCAT_SERIES, SM.Card], 1, "library")).toEqual({
      kind: "shapes",
      descriptors: [CARD_V1, LIBRARY_DECK_SERIES_V1],
      unknown: [],
    });
    expect(pick([DCAT_DISTRIBUTION, SM.Deck], 1, "library")).toEqual({
      kind: "shapes",
      descriptors: [LIBRARY_DECK_V1, DISTRIBUTION_V1],
      unknown: [],
    });
    expect(pick([DCAT_CATALOG, SM.Instance], 1, "pod")).toEqual({
      kind: "shapes",
      descriptors: [INSTANCE_V1, CATALOG_V1],
      unknown: [],
    });
    // A standard class has no format of a Solid Memo class's later version.
    expect(pick([FOAF_AGENT, SM.Card], 7, "library")).toEqual({
      kind: "shapes",
      descriptors: [CARD_V7],
      unknown: ["agent"],
    });
    expect(pick([FOAF_AGENT, SM.Card], 9, "library")).toEqual({
      kind: "unknown-version",
      shape: "card",
      version: 9,
      latest: 7,
    });
  });

  it("names a Solid Memo class's shape first, as a report names the first, whichever a standard class's would sort before", () => {
    const first = (types: readonly string[], version: number, context: "pod" | "library") => {
      const found = pick(types, version, context);
      return found.kind === "shapes" ? found.descriptors[0].shape : found.kind;
    };
    expect(first([SM.Deck, FOAF_AGENT], 1, "pod")).toBe("deck");
    expect(first([FOAF_AGENT, SM.Deck], 1, "library")).toBe("libraryDeck");
    expect(first([SM.DeckGroup, FOAF_AGENT], 1, "pod")).toBe("deckGroup");
    // A class with no shape at this version is no shape to name: the standard class's is what ran.
    expect(pick([DCAT_SERIES, SM.Chapter], 2, "library")).toEqual({
      kind: "shapes",
      descriptors: [LIBRARY_DECK_SERIES_V2],
      unknown: ["chapter"],
    });
  });

  it("has no shape a release could pick by a fixed value, so a release's check asks for none", () => {
    const fixing = ALL_SHAPES.filter((d) => d.fixedValues.length > 0);
    expect(fixing).not.toEqual([]);
    for (const { targetClass, version } of fixing) {
      expect(pick([targetClass], version, "library").kind, targetClass).toBe("refused");
    }
  });

  it("refuses in a release a Solid Memo class only a pod holds, at any version and beside any class", () => {
    const refused = (shape: string, ...more: string[]) => ({
      kind: "refused",
      shapes: [shape, ...more],
    });
    expect(pick([SM.Preferences], 1, "library")).toEqual(refused("preferences"));
    expect(pick([SM.Palette], 99, "library")).toEqual(refused("palette"));
    expect(pick([FOAF_AGENT, SM.Preferences], 1, "library")).toEqual(refused("preferences"));
    expect(pick([SM.Deck, SM.Answer], 6, "library")).toEqual(refused("answer"));
    expect(pick([DCAT_CATALOG, SM.DeckGroup], 1, "library")).toEqual(refused("deckGroup"));
    expect(pick([SM.ReviewState], 1, "library")).toEqual(refused("fsrsReviewState", "reviewState"));
    for (const type of [
      SM.ColorSet,
      SM.DeckSchedule,
      SM.DocumentReceipt,
      SM.Instance,
      SM.MonthSummary,
    ]) {
      expect(pick([type], 1, "library").kind, type).toBe("refused");
    }
    // What a release holds stays, and elsewhere the classes are what they are.
    for (const type of [SM.Deck, SM.Card, SM.Distractor, SM.Chapter, SM.Step]) {
      expect(pick([type], 1, "library").kind, type).toBe("shapes");
    }
    expect(pick([SM.Preferences], 1, "pod").kind).toBe("shapes");
    expect(pick([SM.Preferences], 1, "draft").kind).toBe("shapes");
  });

  it("tells an FSRS-6 review state from an SM-2 one by its scheduler, the shape that fixes it first", () => {
    const fsrs6 = { [SM.scheduler]: [SM.fsrs6] };
    expect(pick([SM.ReviewState], 1, "pod", fsrs6)).toEqual(one(FSRS_REVIEW_STATE_V1));
    // Every place that holds one shares the shape, as it does the review-state shapes.
    expect(pick([SM.ReviewState], 1, "draft", fsrs6)).toEqual(one(FSRS_REVIEW_STATE_V1));
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
      expect(pick([SM.ReviewState], 1, "pod", values)).toEqual(one(REVIEW_STATE_V1));
      expect(pick([SM.ReviewState], 2, "pod", values)).toEqual(one(REVIEW_STATE_V2));
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

  it("checks a subject of several Solid Memo classes against the shape of each, in whatever order it names them", () => {
    for (const types of [
      [SM.Deck, DCAT_DATASET, SM.Card],
      [SM.Card, SM.Deck],
    ]) {
      expect(pick(types, 6, "library"), types.join(" ")).toEqual({
        kind: "shapes",
        descriptors: [CARD_V6, LIBRARY_DECK_V6],
        unknown: [],
      });
    }
    expect(pick([SM.Card, SM.Answer], 1, "pod")).toEqual({
      kind: "shapes",
      descriptors: [ANSWER_V1, CARD_V1],
      unknown: [],
    });
    expect(pick([SM.Deck, SM.Card], 6, "pod")).toEqual({
      kind: "shapes",
      descriptors: [CARD_V6, DECK_V6],
      unknown: [],
    });
    // Each class keeps its own choice of the shape with fixed values.
    expect(pick([SM.ReviewState, SM.Card], 1, "pod", { [SM.scheduler]: [SM.fsrs6] })).toEqual({
      kind: "shapes",
      descriptors: [CARD_V1, FSRS_REVIEW_STATE_V1],
      unknown: [],
    });
  });

  it("names a class with no shape at the version when another class has one, and reports newer data only when none has", () => {
    expect(pick([SM.Card, SM.Answer], 7, "pod")).toEqual({
      kind: "shapes",
      descriptors: [CARD_V7],
      unknown: ["answer"],
    });
    expect(pick([SM.Deck, SM.Card], 7, "library")).toEqual({
      kind: "shapes",
      descriptors: [CARD_V7],
      unknown: ["libraryDeck"],
    });
    expect(pick([SM.Card, SM.Answer], 9, "pod")).toEqual({
      kind: "unknown-version",
      shape: "answer",
      version: 9,
      latest: 1,
    });
    // A class with no shape where the subject is is no class of it there.
    expect(pick([SM.Chapter, SM.Card], 2, "pod")).toEqual(one(CARD_V2));
  });
});
