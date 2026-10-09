import { describe, expect, it } from "vitest";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import { publishedDistractorIds } from "./deckRelease";

const card = { id: "q", distractors: [{ id: "q-d1" }, { id: "q-d2" }] };

describe("publishedDistractorIds", () => {
  it("is none for a deck not from the library, or a card its release lacks", () => {
    expect(publishedDistractorIds(null, card)).toEqual(new Set());
    expect(publishedDistractorIds({ cards: [] } as unknown as LibraryDeckContent, card)).toEqual(new Set());
    expect(publishedDistractorIds({ cards: [{ id: "q" }] } as unknown as LibraryDeckContent, card)).toEqual(new Set());
  });

  it("is the release's distractors of the card", () => {
    const release = { cards: [{ id: "q", distractors: [{ id: "q-d1" }] }] } as unknown as LibraryDeckContent;
    expect(publishedDistractorIds(release, card)).toEqual(new Set(["q-d1"]));
  });

  it("is every one the card has while the release is not known", () => {
    expect(publishedDistractorIds(undefined, card)).toEqual(new Set(["q-d1", "q-d2"]));
    expect(publishedDistractorIds(undefined, { id: "q" })).toEqual(new Set());
  });
});
