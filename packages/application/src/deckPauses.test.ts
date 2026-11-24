// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { Card } from "@solid-memo/domain/deck";
import type { ReviewState } from "@solid-memo/domain/review";
import { createUseCases } from "./useCases";
import { instance, deck, card, makeDeps, sm2s } from "./testing/fakePorts";

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
    expect(deps.deckWrites).not.toHaveBeenCalled();
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

  it("reads three resumed decks' documents at once at most, however many decks ask", async () => {
    const deps = makeDeps();
    const reads: (() => void)[] = [];
    deps.deckRepository.listCards = vi.fn(
      () => new Promise<Card[]>((done) => reads.push(() => done([]))),
    );
    const useCases = createUseCases(deps);
    const resumed = Array.from({ length: 10 }, (_, at) => ({
      ...deck,
      url: `${deck.url}-${at}`,
      pause: { pausedAt: "2026-02-01T09:00:00.000Z", resumesOn: "2026-02-28" },
    }));
    const comebacks = Promise.all(
      resumed.map((one) => useCases.getComeback(instance.url, one, now)),
    );
    await vi.waitFor(() => expect(reads).toHaveLength(3));
    while (reads.length > 0) {
      reads.shift()!();
      await new Promise((settle) => setTimeout(settle));
    }
    expect(await comebacks).toEqual(Array.from({ length: 10 }, () => null));
    expect(deps.deckRepository.listCards).toHaveBeenCalledTimes(10);
  });

  describe("what a pause costs, and what is left after it", () => {
    const stateOf = (cardId: string, intervalDays: number, due: string): ReviewState => ({
      cardId,
      direction: "front-to-back",
      easeFactor: 2.5,
      intervalDays,
      repetitions: 3,
      due,
      firstReviewedAt: "2026-02-01T10:00:00.000Z",
      lastReviewedAt: "2026-02-01T10:00:00.000Z",
      formatVersion: 2,
    });
    const cardOf = (id: string, retired = false) => ({
      ...card,
      id,
      url: `${deck.cardsDocumentUrl}#${id}`,
      ...(retired ? { retired: true as const } : {}),
    });
    function world(states: ReviewState[]) {
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([
        cardOf("a"),
        cardOf("b"),
        cardOf("new"),
        cardOf("gone", true),
      ]);
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(sm2s(states));
      return createUseCases(deps);
    }
    const states = [
      stateOf("a", 10, "2026-02-11"),
      stateOf("b", 40, "2026-03-13"),
      // A retired card's state is no prompt of the deck.
      stateOf("gone", 1, "2026-02-02"),
    ];

    it("getPauseOutlook averages the recall of the deck's prompts on the resume day, or after 30 days", async () => {
      const useCases = world(states);
      const onDay = await useCases.getPauseOutlook(instance.url, deck, "2026-03-11", now);
      expect(onDay.day).toBe("2026-03-11");
      const later = await useCases.getPauseOutlook(instance.url, deck, null, now);
      expect(later.day).toBe("2026-03-31");
      expect(onDay.recall!).toBeGreaterThan(later.recall!);
      expect(later.recall!).toBeGreaterThan(0);
      expect(onDay.recall!).toBeLessThan(1);
      const none = await world([]).getPauseOutlook(instance.url, deck, null, now);
      expect(none.recall).toBeNull();
    });

    it("getComeback tells a resumed deck's backlog, the days its limit takes, while it lasts and for 30 days", async () => {
      const useCases = world(states);
      const resumed = {
        ...deck,
        maxReviewsPerDay: 1,
        pause: { pausedAt: "2026-02-01T09:00:00.000Z", resumesOn: "2026-03-01" },
      };
      const comeback = await useCases.getComeback(instance.url, resumed, now);
      // Only "a" fell due before the deck resumed; "gone" is retired.
      expect(comeback).toMatchObject({ waiting: 1, days: 1 });
      expect(comeback!.recall).toBeGreaterThan(0);
      const unlimited = await useCases.getComeback(
        instance.url,
        { ...resumed, maxReviewsPerDay: 0 },
        now,
      );
      expect(unlimited!.days).toBeNull();
      // Nothing of the backlog is due any more, the deck never paused, still paused, or resumed long ago.
      const early = { ...resumed, pause: { ...resumed.pause, resumesOn: "2026-02-05" } };
      expect(await useCases.getComeback(instance.url, early, now)).toBeNull();
      expect(await useCases.getComeback(instance.url, deck, now)).toBeNull();
      const paused = { ...resumed, pause: { pausedAt: resumed.pause.pausedAt } };
      expect(await useCases.getComeback(instance.url, paused, now)).toBeNull();
      expect(
        await useCases.getComeback(instance.url, resumed, new Date(2026, 3, 15, 10)),
      ).toBeNull();
    });
  });
});
