// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createUseCases } from "./useCases";
import { instance, deck, makeDeps } from "./testing/fakePorts";

describe("deck pauses", () => {
  // 10:00 local: the study day is the calendar's, whatever the day boundary.
  const now = new Date(2026, 2, 1, 10);

  it("pauseDeck keeps the pause on the deck's entry, until resumed or until a later day", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.pauseDeck(instance.url, deck, null, now);
    expect(deps.deckRepository.setPause).toHaveBeenLastCalledWith(deck, {
      pausedAt: now.toISOString(),
    });
    const until = await useCases.pauseDeck(instance.url, deck, "2026-03-09", now);
    expect(until.pause).toEqual({ pausedAt: now.toISOString(), resumesOn: "2026-03-09" });
    // Edited on the entry as it is now, never by a save of the deck as read.
    expect(deps.deckRepository.saveDeck).not.toHaveBeenCalled();
  });

  it("pauseDeck refuses a resume day that is no day, today or earlier, before any write", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    for (const day of ["2026-03-01", "2026-02-20", "soon"])
      await expect(useCases.pauseDeck(instance.url, deck, day, now)).rejects.toMatchObject({
        code: "resumeDayInvalid",
      });
    expect(deps.deckRepository.setPause).not.toHaveBeenCalled();
  });

  it("resumeDeck makes today the resume day, keeping the start, and writes nothing for a deck not paused", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const pausedAt = "2026-02-01T09:00:00.000Z";
    const paused = { ...deck, pause: { pausedAt, resumesOn: "2026-04-01" } };
    const resumed = await useCases.resumeDeck(instance.url, paused, now);
    expect(resumed.pause).toEqual({ pausedAt, resumesOn: "2026-03-01" });
    expect(await useCases.resumeDeck(instance.url, deck, now)).toBe(deck);
    expect(await useCases.resumeDeck(instance.url, resumed, now)).toBe(resumed);
    expect(deps.deckRepository.setPause).toHaveBeenCalledTimes(1);
  });
});
