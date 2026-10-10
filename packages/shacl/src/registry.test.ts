import { describe, expect, it } from "vitest";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { pickShape } from "./registry";
import { AGENT_V1, CARD_V1, CARD_V2, CARD_V5, CATALOG_V1, CHAPTER_V1, DECK_GROUP_V1, DECK_V2, DECK_V6, DISTRACTOR_V1, DRAFT_CHAPTER_V1, DRAFT_DECK_V1, DRAFT_STEP_V1, LIBRARY_DECK_V1, LIBRARY_DECK_V5, LIBRARY_DECK_V6, SHAPES, STEP_V1 } from "@solid-memo/vocab/descriptors.generated";

const DCAT_CATALOG = "http://www.w3.org/ns/dcat#Catalog";
const DCAT_DATASET = "http://www.w3.org/ns/dcat#Dataset";

describe("the generated registry", () => {
  it("has every version from 1 to the latest of each kind", () => {
    for (const [shape, latest] of Object.entries(LATEST_VERSION)) {
      const versions = Object.values(SHAPES[shape as keyof typeof SHAPES]);
      expect(versions.map((d) => d.version), shape).toEqual(
        Array.from({ length: latest }, (_, i) => i + 1),
      );
      expect(versions.every((d) => d.shape === shape), shape).toBe(true);
    }
  });
});

describe("pickShape", () => {
  it("picks the shape by class, version and context", () => {
    expect(pickShape([SM.Card], 2, "pod")).toEqual({ kind: "shape", descriptor: CARD_V2 });
    expect(pickShape([SM.Card], 1, "library")).toEqual({ kind: "shape", descriptor: CARD_V1 });
    expect(pickShape(["https://other.example/#Thing", SM.Deck], 2, "pod")).toEqual({
      kind: "shape",
      descriptor: DECK_V2,
    });
    expect(pickShape([SM.Deck], 1, "library")).toEqual({
      kind: "shape",
      descriptor: LIBRARY_DECK_V1,
    });
  });

  it("picks deck format 6 in a pod and library deck formats 5 and 6 in the library, from separate shape documents", () => {
    expect(pickShape([SM.Deck], 6, "pod")).toEqual({ kind: "shape", descriptor: DECK_V6 });
    expect(pickShape([SM.Deck], 5, "library")).toEqual({ kind: "shape", descriptor: LIBRARY_DECK_V5 });
    expect(pickShape([SM.Deck], 6, "library")).toEqual({ kind: "shape", descriptor: LIBRARY_DECK_V6 });
    expect(LIBRARY_DECK_V5.shapeDocument).toBe("library-deck/v5.ttl");
    expect(LIBRARY_DECK_V6.shapeDocument).toBe("library-deck/v6.ttl");
    expect(pickShape([SM.Deck], 7, "library")).toEqual({
      kind: "unknown-version",
      shape: "libraryDeck",
      version: 7,
      latest: 6,
    });
  });

  it("picks the draft shapes in a draft, and the shapes every context shares for what a draft holds", () => {
    expect(pickShape([SM.Deck], 1, "draft")).toEqual({ kind: "shape", descriptor: DRAFT_DECK_V1 });
    expect(pickShape([SM.Chapter], 1, "draft")).toEqual({ kind: "shape", descriptor: DRAFT_CHAPTER_V1 });
    expect(pickShape([SM.Step], 1, "draft")).toEqual({ kind: "shape", descriptor: DRAFT_STEP_V1 });
    expect(pickShape([SM.Card], 5, "draft")).toEqual({ kind: "shape", descriptor: CARD_V5 });
    expect(pickShape([SM.Distractor], 1, "draft")).toEqual({ kind: "shape", descriptor: DISTRACTOR_V1 });
    expect(pickShape(["http://xmlns.com/foaf/0.1/Agent"], 1, "draft")).toEqual({ kind: "shape", descriptor: AGENT_V1 });
    expect(DRAFT_DECK_V1.shapeDocument).toBe("draft-deck/v1.ttl");
    // A release's chapters and steps are checked as the release's, a draft's as the draft's.
    expect(pickShape([SM.Chapter], 1, "library")).toEqual({ kind: "shape", descriptor: CHAPTER_V1 });
    expect(pickShape([SM.Step], 1, "library")).toEqual({ kind: "shape", descriptor: STEP_V1 });
    expect(pickShape([SM.Deck], 6, "draft")).toEqual({ kind: "unknown-version", shape: "draftDeck", version: 6, latest: 1 });
    expect(pickShape([SM.Chapter], 1, "pod")).toEqual({ kind: "untyped" });
  });

  it("reports a version it does not know, with the latest it does", () => {
    expect(pickShape([SM.Card], 6, "pod")).toEqual({
      kind: "unknown-version",
      shape: "card",
      version: 6,
      latest: 5,
    });
    expect(pickShape([SM.Instance], 0, "pod")).toEqual({
      kind: "unknown-version",
      shape: "instance",
      version: 0,
      latest: 2,
    });
  });

  it("leaves subjects without a Solid Memo class alone", () => {
    expect(pickShape([], 1, "pod")).toEqual({ kind: "untyped" });
    expect(pickShape(["https://other.example/#Thing"], 1, "library")).toEqual({
      kind: "untyped",
    });
  });

  it("checks a deck group as a deck group, not as the catalogue it also is", () => {
    for (const types of [[SM.DeckGroup, DCAT_CATALOG], [DCAT_CATALOG, SM.DeckGroup]]) {
      expect(pickShape(types, 1, "pod"), types.join(" ")).toEqual({ kind: "shape", descriptor: DECK_GROUP_V1 });
    }
    expect(pickShape([DCAT_CATALOG], 1, "pod")).toEqual({ kind: "shape", descriptor: CATALOG_V1 });
    expect(pickShape([DCAT_CATALOG, SM.DeckGroup], 2, "pod")).toEqual({
      kind: "unknown-version",
      shape: "deckGroup",
      version: 2,
      latest: 1,
    });
    expect(pickShape([SM.Deck, DCAT_DATASET], 6, "pod")).toEqual({ kind: "shape", descriptor: DECK_V6 });
  });
});
