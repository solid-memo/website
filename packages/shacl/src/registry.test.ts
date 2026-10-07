import { describe, expect, it } from "vitest";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { pickShape } from "./registry";
import { CARD_V1, CARD_V2, CATALOG_V1, DECK_GROUP_V1, DECK_V2, DECK_V6, LIBRARY_DECK_V1, LIBRARY_DECK_V5, SHAPES } from "@solid-memo/vocab/descriptors.generated";

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

  it("picks deck format 6 in a pod and library deck format 5 in the library, from separate shape documents", () => {
    expect(pickShape([SM.Deck], 6, "pod")).toEqual({ kind: "shape", descriptor: DECK_V6 });
    expect(pickShape([SM.Deck], 5, "library")).toEqual({ kind: "shape", descriptor: LIBRARY_DECK_V5 });
    expect(LIBRARY_DECK_V5.shapeDocument).toBe("library-deck/v5.ttl");
    expect(pickShape([SM.Deck], 6, "library")).toEqual({
      kind: "unknown-version",
      shape: "libraryDeck",
      version: 6,
      latest: 5,
    });
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
