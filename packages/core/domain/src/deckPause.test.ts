// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import { backlogDayOf, isPaused, storedPause, withPause, withResume } from "./deckPause";

const deck = { id: "deck-a", url: "https://pod.example/catalog.ttl#deck-a" } as Deck;
const pausedAt = "2026-03-01T12:00:00.000Z";

describe("storedPause", () => {
  it("keeps a start of the years a grade carries over, and a resume day that is a day", () => {
    expect(storedPause(pausedAt, "2026-03-09")).toEqual({ pausedAt, resumesOn: "2026-03-09" });
    expect(storedPause(pausedAt, null)).toEqual({ pausedAt });
    expect(storedPause(pausedAt, "2026-02-30")).toEqual({ pausedAt });
    expect(storedPause(pausedAt, "0001-01-01")).toEqual({ pausedAt });
    expect(storedPause(null, "2026-03-09")).toBeUndefined();
    expect(storedPause("+012026-03-01T00:00:00.000Z", null)).toBeUndefined();
  });
});

describe("isPaused and backlogDayOf", () => {
  it("tells a paused deck from one that resumed, by the study day", () => {
    const open = { pause: { pausedAt } };
    const until = { pause: { pausedAt, resumesOn: "2026-03-09" } };
    expect(isPaused({}, "2026-03-05")).toBe(false);
    expect(isPaused(open, "2030-01-01")).toBe(true);
    expect(isPaused(until, "2026-03-08")).toBe(true);
    expect(isPaused(until, "2026-03-09")).toBe(false);
    expect(backlogDayOf({}, "2026-03-09")).toBeUndefined();
    expect(backlogDayOf(open, "2026-03-09")).toBeUndefined();
    expect(backlogDayOf(until, "2026-03-08")).toBeUndefined();
    expect(backlogDayOf(until, "2026-03-20")).toBe("2026-03-09");
  });
});

describe("withPause and withResume", () => {
  const now = new Date(pausedAt);

  it("pause from now, until resumed or a later day, replacing an earlier pause", () => {
    const earlier = {
      ...deck,
      pause: { pausedAt: "2026-01-01T00:00:00.000Z", resumesOn: "2026-01-05" },
    };
    expect(withPause(earlier, now, null, "2026-03-01").pause).toEqual({ pausedAt });
    expect(withPause(deck, now, "2026-03-02", "2026-03-01").pause).toEqual({
      pausedAt,
      resumesOn: "2026-03-02",
    });
  });

  it("refuses a resume day that is no day, today or earlier", () => {
    for (const day of ["2026-03-01", "2026-02-28", "2026-02-30", "tomorrow"])
      expect(() => withPause(deck, now, day, "2026-03-01")).toThrow(
        expect.objectContaining({ code: "resumeDayInvalid" }),
      );
  });

  it("resume today, keeping the start; a deck not paused comes back as it is", () => {
    const paused = withPause(deck, now, null, "2026-03-01");
    expect(withResume(paused, "2026-03-04").pause).toEqual({ pausedAt, resumesOn: "2026-03-04" });
    expect(withResume(deck, "2026-03-04")).toBe(deck);
    const resumed = withResume(paused, "2026-03-04");
    expect(withResume(resumed, "2026-03-05")).toBe(resumed);
  });
});
