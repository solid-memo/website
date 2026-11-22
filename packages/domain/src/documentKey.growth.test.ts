// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A document's address is keyed (documentKeyOf), and a deck's documents
 * placed (isDeckInPlace), in time that grows with the address, however
 * long a run of dots and spaces a path segment holds before its end:
 * the trailing run is trimmed by a pass from the end
 * (instanceLayout.ts withoutTrailingDotsOrSpaces), not by a pattern
 * tried at each start inside the run. An address eight times as long
 * must take less than four times as long as the short one done eight
 * times over (testing.md); the longest stays within the bound on a term
 * (MAX_TERM_CHARACTERS).
 */
import { describe, expect, it } from "vitest";
import { isDeckInPlace } from "./deckAddress";
import { documentKeyOf } from "./instanceLayout";
import { growth } from "./testing/growth";

const DECKS = "https://pod.example/alice/solid-memo/main/decks/";

describe.each([
  ["spaces", "%20", 675],
  ["dots and spaces", ".%20", 500],
])("a segment of %s before its end", (_, run, size) => {
  /** A deck document's address whose last segment holds `a`, `count` runs, then `x.ttl`. */
  const addressOf = (count: number) => `${DECKS}a${run.repeat(count)}x.ttl`;

  it("is keyed in time that grows with it, not its square", () => {
    const ratio = growth(
      (count) => {
        const url = addressOf(count);
        return () => expect(documentKeyOf(url)).toBe(url);
      },
      size,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  }, 180_000);

  it("is placed as a deck's documents in time that grows with it, not its square", () => {
    const ratio = growth(
      (count) => {
        const url = addressOf(count);
        const deck = {
          url: "https://pod.example/alice/solid-memo/main/catalog.ttl#deck-1",
          cardsDocumentUrl: url,
          reviewsDocumentUrl: url,
        };
        return () => expect(isDeckInPlace(deck)).toBe(true);
      },
      size,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  }, 180_000);
});
