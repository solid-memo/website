// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createUseCases } from "./useCases";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { fsrsInterval } from "@solid-memo/domain/fsrs";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";
import { sm2s, promptOf, instance, deck, card, makeDeps, memoryLog } from "./testing/fakePorts";

describe("the answer log", () => {
  const noon = new Date(2026, 8, 21, 12, 0);
  const setup = () => {
    const deps = makeDeps();
    const { log, byMonth } = memoryLog();
    let id = 0;
    const useCases = createUseCases({
      ...deps,
      answerLog: log,
      newId: () => `id${++id}-0000-0000`,
    });
    return { deps, log, byMonth, useCases };
  };

  it("keeps every answer with what the statistics need, the prior interval and due day from the second on", async () => {
    const { deps, byMonth, useCases } = setup();
    const offset = 0 - noon.getTimezoneOffset();
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon, {
      recallMillis: 2400.4,
      gradeMillis: 800,
    });
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue(
      promptOf({
        cardId: card.id,
        direction: "back-to-front",
        easeFactor: 2.5,
        intervalDays: 6,
        repetitions: 2,
        due: "2026-09-21",
        firstReviewedAt: "2026-09-01T10:00:00.000Z",
        lastReviewedAt: "2026-09-15T10:00:00.000Z",
        formatVersion: 2,
      }),
    );
    // Eleven minutes to recall: the learner was away, so it is not kept.
    await useCases.recordReview(instance.url, deck, { card, direction: "back-to-front" }, 1, noon, {
      recallMillis: 11 * 60_000,
      gradeMillis: 500,
    });
    await useCases.recordReview(instance.url, deck, { card, direction: "back-to-front" }, 4, noon);
    await useCases.getStatistics(instance.url, noon);
    expect(byMonth.get("2026-09")).toEqual([
      {
        id: `answer-${noon.toISOString().replace(/[-:.]/g, "")}-id1-0000`,
        deckUrl: deck.url,
        cardUrl: card.url,
        direction: "front-to-back",
        grade: 4,
        answeredAt: noon.toISOString(),
        studyDay: "2026-09-21",
        nextIntervalDays: 1,
        recallMillis: 2400,
        gradeMillis: 800,
        utcOffsetMinutes: offset,
      },
      {
        id: `answer-${noon.toISOString().replace(/[-:.]/g, "")}-id2-0000`,
        deckUrl: deck.url,
        cardUrl: card.url,
        direction: "back-to-front",
        grade: 1,
        answeredAt: noon.toISOString(),
        studyDay: "2026-09-21",
        priorIntervalDays: 6,
        nextIntervalDays: 1,
        gradeMillis: 500,
        priorDue: "2026-09-21",
        utcOffsetMinutes: offset,
      },
      // A review timed by no screen, as the Studio's trial gives it: no times.
      expect.not.objectContaining({ recallMillis: expect.anything() }),
    ]);
    expect(byMonth.get("2026-09")![2]).not.toHaveProperty("gradeMillis");
  });

  it("keeps an answer it could not add for later, in order, and does not fail the review", async () => {
    const { log, byMonth, useCases } = setup();
    log.append
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("still offline"));
    await expect(
      useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon),
    ).resolves.toBeDefined();
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(byMonth.size).toBe(0);
    await useCases.recordReview(instance.url, deck, { card, direction: "back-to-front" }, 5, noon);
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(byMonth.get("2026-09")!.map((answer) => [answer.direction, answer.grade])).toEqual([
      ["front-to-back", 4],
      ["back-to-front", 5],
    ]);
  });

  it("forgets a reset day's answers of the deck, those still on their way too", async () => {
    const { deps, log, byMonth, useCases } = setup();
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon);
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(
      sm2s([
        {
          cardId: card.id,
          direction: "front-to-back",
          easeFactor: 2.6,
          intervalDays: 1,
          repetitions: 1,
          due: "2026-09-22",
          firstReviewedAt: noon.toISOString(),
          lastReviewedAt: noon.toISOString(),
          formatVersion: 2,
        },
      ]),
    );
    await expect(useCases.resetStudyDay(instance.url, deck, noon)).resolves.toBe(1);
    expect(log.removeDay).toHaveBeenCalledWith(instance.url, deck.url, "2026-09-21");
    expect(log.append.mock.invocationCallOrder[0]).toBeLessThan(
      log.removeDay.mock.invocationCallOrder[0]!,
    );
    expect(byMonth.get("2026-09")).toEqual([]);
  });

  it("undoes a second answer of the day: the state just before it written back, not the morning's, the answer out of the log", async () => {
    const { deps, log, byMonth, useCases } = setup();
    const morning: ReviewState = {
      cardId: card.id,
      direction: "back-to-front",
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-09-21",
      firstReviewedAt: "2026-09-01T10:00:00.000Z",
      lastReviewedAt: "2026-09-15T10:00:00.000Z",
      formatVersion: 2,
    };
    // The document holds the morning's state, then what the first answer left.
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValueOnce(promptOf(morning));
    const first = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "back-to-front" },
      5,
      noon,
    );
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValueOnce(
      promptOf(first.state),
    );
    const { undo } = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "back-to-front" },
      1,
      noon,
    );
    expect(undo.before).toBe(first.state);
    await useCases.getStatistics(instance.url, noon);
    expect(byMonth.get("2026-09")).toHaveLength(2);
    await expect(useCases.undoReview(instance.url, deck, undo)).resolves.toBe(first.state);
    expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledWith(deck, {
      save: [first.state],
      remove: [],
    });
    expect(log.removeAnswer).toHaveBeenCalledWith(instance.url, "2026-09-21", undo.answer.id);
    expect(byMonth.get("2026-09")!.map((answer) => answer.grade)).toEqual([5]);
  });

  describe("under FSRS-6", () => {
    const fsrsPrefs = { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" as const };
    const morning: ReviewState = {
      cardId: card.id,
      direction: "front-to-back",
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-09-21",
      firstReviewedAt: "2026-09-01T10:00:00.000Z",
      lastReviewedAt: "2026-09-15T10:00:00.000Z",
      formatVersion: 2,
    };
    const fresh: FsrsState = {
      cardId: card.id,
      direction: "front-to-back",
      stability: 10,
      difficulty: 5,
      due: "2026-09-25",
      firstReviewedAt: morning.firstReviewedAt,
      lastReviewedAt: morning.lastReviewedAt,
      formatVersion: 1,
    };

    it("grades both states in one edit, logs what FSRS-6 set, and undoes both in one save", async () => {
      const { deps, byMonth, useCases } = setup();
      vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue({
        sm2: morning,
        fsrs: fresh,
      });
      const recorded = await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "front-to-back" },
        4,
        noon,
        {},
        { prefs: fsrsPrefs },
      );
      // One edit, with no read of the preferences or the log.
      expect(deps.reviewStateRepository.gradeReviewState).toHaveBeenCalledOnce();
      expect(deps.preferencesRepository.getPreferences).not.toHaveBeenCalled();
      expect(recorded.state).toMatchObject({ repetitions: 3, intervalDays: 15 });
      expect(recorded.fsrs).toMatchObject({
        lastReviewedAt: noon.toISOString(),
        firstReviewedAt: morning.firstReviewedAt,
        previous: {
          stability: 10,
          difficulty: 5,
          due: "2026-09-25",
          lastReviewedAt: morning.lastReviewedAt,
        },
      });
      expect(recorded.fsrs!.stability).toBeGreaterThan(10);
      const nextInterval = fsrsInterval(recorded.fsrs!.stability, fsrsPrefs.desiredRetention);
      await useCases.getStatistics(instance.url, noon);
      expect(byMonth.get("2026-09")).toEqual([
        expect.objectContaining({
          grade: 4,
          // From the FSRS-6 state's last review (the 15th) to its due day.
          priorIntervalDays: 10,
          priorDue: "2026-09-25",
          nextIntervalDays: nextInterval,
        }),
      ]);
      expect(recorded.undo.fsrs).toEqual({ before: fresh });
      await useCases.undoReview(instance.url, deck, recorded.undo);
      expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledExactlyOnceWith(deck, {
        save: [morning],
        remove: [],
        fsrs: { save: [fresh], remove: [] },
      });
    });

    it("logs a prior interval of 0 when the due day was set before the last review", async () => {
      const { deps, byMonth, useCases } = setup();
      // As Set due date leaves it: due the 10th, last reviewed the 15th.
      vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue({
        sm2: { ...morning, due: "2026-09-10" },
        fsrs: { ...fresh, due: "2026-09-10" },
      });
      await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "front-to-back" },
        4,
        noon,
        {},
        { prefs: fsrsPrefs },
      );
      await useCases.getStatistics(instance.url, noon);
      expect(byMonth.get("2026-09")).toEqual([
        expect.objectContaining({ priorIntervalDays: 0, priorDue: "2026-09-10" }),
      ]);
    });

    it("logs SM-2's interval and due day as prior when the FSRS-6 state is stale, and removes both of a new prompt on undo", async () => {
      const { deps, byMonth, useCases } = setup();
      vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValueOnce({
        sm2: morning,
        fsrs: { ...fresh, lastReviewedAt: "2026-09-10T10:00:00.000Z" },
      });
      const stale = await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "front-to-back" },
        4,
        noon,
        {},
        { prefs: fsrsPrefs },
      );
      // Estimated from SM-2: no snapshot of FSRS-6's to restore.
      expect(stale.fsrs).not.toHaveProperty("previous");
      const fresh2 = await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "back-to-front" },
        3,
        noon,
        {},
        { prefs: fsrsPrefs },
      );
      await useCases.getStatistics(instance.url, noon);
      expect(byMonth.get("2026-09")![0]).toMatchObject({
        priorIntervalDays: 6,
        priorDue: "2026-09-21",
      });
      expect(byMonth.get("2026-09")![1]).not.toHaveProperty("priorDue");
      expect(fresh2.undo.fsrs).toEqual({ before: null });
      await useCases.undoReview(instance.url, deck, fresh2.undo);
      expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledWith(deck, {
        save: [],
        remove: [fresh2.undo.key],
        fsrs: { save: [], remove: [fresh2.undo.key] },
      });
    });

    it("leaves FSRS-6's state alone under SM-2, and undoes SM-2's alone", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue({
        sm2: morning,
        fsrs: fresh,
      });
      const recorded = await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "front-to-back" },
        4,
        noon,
      );
      expect(recorded).not.toHaveProperty("fsrs");
      expect(recorded.undo).not.toHaveProperty("fsrs");
    });
  });

  it("undoes a new prompt's answer still on its way to the log: its state goes, the answer never reaches the log", async () => {
    const { deps, log, byMonth, useCases } = setup();
    log.append.mockRejectedValueOnce(new Error("offline"));
    const { undo } = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      0,
      noon,
    );
    expect(undo).toEqual({
      key: { cardId: card.id, direction: "front-to-back" },
      before: null,
      answer: { id: expect.stringMatching(/^answer-/), studyDay: "2026-09-21" },
    });
    await expect(useCases.undoReview(instance.url, deck, undo)).resolves.toBeNull();
    expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledWith(deck, {
      save: [],
      remove: [undo.key],
    });
    expect(log.removeAnswer).not.toHaveBeenCalled();
    await useCases.getStatistics(instance.url, noon);
    expect(byMonth.size).toBe(0);
  });

  it("is checked in the full check, one document a month, and a log with no month has no statistics", async () => {
    const { deps, byMonth, useCases } = setup();
    byMonth.set("2026-09", []);
    await useCases.validateInstance(instance.url);
    expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(
      `${instance.url}history/2026-09.ttl`,
      "pod",
    );
    const plain = createUseCases(makeDeps());
    await expect(plain.getStatistics(instance.url, noon)).resolves.toMatchObject({
      totals: { answers: 0, studyDays: 0, cards: 0 },
    });
  });
});
