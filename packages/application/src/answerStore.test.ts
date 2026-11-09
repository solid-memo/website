// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createUseCases, type UseCases } from "./useCases";
import { AppError } from "@solid-memo/domain/appError";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { MAX_LOG_MONTHS, type Answer } from "@solid-memo/domain/answer";
import { fsrsInterval, fuzzedInterval, fuzzFactor } from "@solid-memo/domain/fsrs";
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

  it("sets aside only an answer the write check refuses, and those after it go on", async () => {
    const { log, byMonth, useCases } = setup();
    log.append.mockRejectedValueOnce(new AppError("dataNotConforming", { problems: "a date" }));
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon);
    await useCases.recordReview(instance.url, deck, { card, direction: "back-to-front" }, 5, noon);
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(byMonth.get("2026-09")!.map((answer) => [answer.direction, answer.grade])).toEqual([
      ["back-to-front", 5],
    ]);
  });

  it.each(["unwritableTerm", "termTooLong"] as const)(
    "sets aside an answer refused before it is sent (%s), and those after it go on",
    async (code) => {
      const { log, byMonth, useCases } = setup();
      log.append.mockRejectedValueOnce(new AppError(code, { term: "<a>", limit: 16_383 }));
      await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "front-to-back" },
        4,
        noon,
      );
      await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "back-to-front" },
        5,
        noon,
      );
      await useCases.refreshStudyDigest(instance.url, deck);
      expect(byMonth.get("2026-09")!.map((answer) => [answer.direction, answer.grade])).toEqual([
        ["back-to-front", 5],
      ]);
      expect(log.append).toHaveBeenCalledTimes(2);
    },
  );

  it("sets aside an answer the pod refuses as at fault a third time, and those after it go on", async () => {
    const { log, byMonth, useCases } = setup();
    const refused = new AppError("addFailed", { url: "https://pod.example/log", status: 400 });
    log.append
      .mockRejectedValueOnce(refused)
      .mockRejectedValueOnce(new AppError("addFailed", { url: "", status: 503 }))
      .mockRejectedValueOnce(refused)
      .mockRejectedValueOnce(refused);
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon);
    await useCases.refreshStudyDigest(instance.url, deck);
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(byMonth.size).toBe(0);
    await useCases.recordReview(instance.url, deck, { card, direction: "back-to-front" }, 5, noon);
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(byMonth.get("2026-09")!.map((answer) => [answer.direction, answer.grade])).toEqual([
      ["back-to-front", 5],
    ]);
    expect(log.append).toHaveBeenCalledTimes(5);
  });

  it.each([401, 403, 408, 429, 500])(
    "never sets aside an answer the pod refuses with a %s, which says nothing of the answer",
    async (status) => {
      const { log, byMonth, useCases } = setup();
      for (let time = 0; time < 4; time++)
        log.append.mockRejectedValueOnce(new AppError("addFailed", { url: "", status }));
      await useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "front-to-back" },
        4,
        noon,
      );
      for (let time = 0; time < 4; time++) await useCases.refreshStudyDigest(instance.url, deck);
      expect(byMonth.get("2026-09")!.map((answer) => answer.grade)).toEqual([4]);
      expect(log.append).toHaveBeenCalledTimes(5);
    },
  );

  it("never drops an answer for any other failure, an AppError among them", async () => {
    const { log, byMonth, useCases } = setup();
    log.append.mockRejectedValueOnce(new AppError("podNoAnswer"));
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon);
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(byMonth.get("2026-09")!.map((answer) => answer.grade)).toEqual([4]);
    expect(log.append).toHaveBeenCalledTimes(2);
  });

  it("logs no due day of the state before when it is no study day, the answer kept", async () => {
    const { deps, byMonth, useCases } = setup();
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue(
      promptOf({
        cardId: card.id,
        direction: "front-to-back",
        easeFactor: 2.5,
        intervalDays: 6,
        repetitions: 2,
        due: "someday",
        firstReviewedAt: "2026-09-01T10:00:00.000Z",
        lastReviewedAt: "2026-09-15T10:00:00.000Z",
        formatVersion: 2,
      }),
    );
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon);
    await useCases.refreshStudyDigest(instance.url, deck);
    const [answer] = byMonth.get("2026-09")!;
    expect(answer!.priorIntervalDays).toBe(6);
    expect(answer!.priorDue).toBeUndefined();
  });

  describe("of several instances", () => {
    const foreign = "https://other.example/solid-memo/shared/";
    const answer = (instanceUrl: string, grade: 0 | 1 | 2 | 3 | 4 | 5, useCases: UseCases) =>
      useCases.recordReview(instanceUrl, deck, { card, direction: "front-to-back" }, grade, noon);

    it("logs an instance's answers when another instance's log refuses its own, and tries those again later, in order", async () => {
      const { log, byMonth, useCases } = setup();
      const add = log.append.getMockImplementation()!;
      let refusing = true;
      log.append.mockImplementation(async (instanceUrl, given) => {
        if (instanceUrl === foreign && refusing) throw new Error("403");
        await add(instanceUrl, given);
      });
      await answer(foreign, 3, useCases);
      for (const grade of [4, 5] as const) await answer(instance.url, grade, useCases);
      await answer(foreign, 2, useCases);
      await useCases.getStatistics(instance.url, noon);
      expect(byMonth.get("2026-09")!.map((each) => each.grade)).toEqual([4, 5]);
      refusing = false;
      await useCases.getStatistics(foreign, noon);
      expect(byMonth.get("2026-09")!.map((each) => each.grade)).toEqual([4, 5, 3, 2]);
    });

    it("logs, undoes and resets an instance's answers while another instance's log never answers", async () => {
      const { deps, log, byMonth, useCases } = setup();
      const add = log.append.getMockImplementation()!;
      log.append.mockImplementation((instanceUrl, given) =>
        instanceUrl === foreign ? new Promise<void>(() => undefined) : add(instanceUrl, given),
      );
      await answer(foreign, 3, useCases);
      await answer(instance.url, 4, useCases);
      const { undo } = await answer(instance.url, 5, useCases);
      await useCases.undoReview(instance.url, deck, undo);
      await useCases.getStatistics(instance.url, noon);
      expect(byMonth.get("2026-09")!.map((each) => each.grade)).toEqual([4]);
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
      expect(byMonth.get("2026-09")).toEqual([]);
    });
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
      // FSRS-6's interval, fuzzed by the prompt and its last review.
      const nextInterval = fuzzedInterval(
        fsrsInterval(recorded.fsrs!.stability, fsrsPrefs.desiredRetention),
        fuzzFactor(morning, morning.lastReviewedAt),
      );
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

  it("writes a due day that is no date back as a real day when an answer is undone", async () => {
    const { deps, useCases } = setup();
    const key = { cardId: card.id, direction: "front-to-back" } as const;
    const before = {
      ...key,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      due: "1",
      firstReviewedAt: noon.toISOString(),
      lastReviewedAt: noon.toISOString(),
      formatVersion: 2,
    };
    await expect(
      useCases.undoReview(instance.url, deck, {
        key,
        before,
        answer: { id: "answer-1", studyDay: "2026-09-21" },
      }),
    ).resolves.toBe(before);
    expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledWith(deck, {
      save: [{ ...before, due: "2026-09-21" }],
      remove: [],
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

  it("reads a long log's months a few at a time, each once, in the log's order", async () => {
    const { byMonth, log, useCases } = setup();
    for (let year = 2000; year < 2002; year++)
      for (let month = 1; month <= 12; month++) {
        const studyDay = `${year}-${String(month).padStart(2, "0")}-10`;
        byMonth.set(studyDay.slice(0, 7), [
          {
            id: `answer-${studyDay}`,
            deckUrl: deck.url,
            cardUrl: card.url,
            direction: "front-to-back",
            grade: 4,
            answeredAt: `${studyDay}T10:00:00.000Z`,
            studyDay,
            nextIntervalDays: 1,
          },
        ]);
      }
    const read = log.readMonthSince.getMockImplementation()!;
    let reading = 0;
    let most = 0;
    log.readMonthSince.mockImplementation(async (...args) => {
      most = Math.max(most, ++reading);
      await new Promise((resolve) => setTimeout(resolve, 1));
      reading--;
      return read(...args);
    });
    const answers = await useCases.loadAnswerLog(instance.url);
    expect(answers.map((answer) => answer.studyDay.slice(0, 7))).toEqual([...byMonth.keys()]);
    expect(log.readMonthSince).toHaveBeenCalledTimes(24);
    expect(most).toBe(6);
  });

  it("reads no month of the whole log after the day after tomorrow's, which no answer counted can be in", async () => {
    const deps = makeDeps();
    const { log, byMonth } = memoryLog();
    const useCases = createUseCases({
      ...deps,
      answerLog: log,
      newId: () => "id",
      now: () => new Date(2026, 8, 30, 12, 0),
    });
    for (const studyDay of ["2026-09-21", "2026-10-01", "2026-11-01", "9999-12-31"])
      byMonth.set(studyDay.slice(0, 7), [
        {
          id: `answer-${studyDay}`,
          deckUrl: deck.url,
          cardUrl: card.url,
          direction: "front-to-back",
          grade: 4,
          answeredAt: `${studyDay}T10:00:00.000Z`,
          studyDay,
          nextIntervalDays: 1,
        },
      ]);
    const answers = await useCases.loadAnswerLog(instance.url);
    expect(answers.map((answer) => answer.studyDay)).toEqual(["2026-09-21", "2026-10-01"]);
    expect(log.readMonthSince.mock.calls.map(([, month]) => month)).toEqual(["2026-09", "2026-10"]);
  });

  it("reads every month of the whole log however many later months it lists, which none can push out", async () => {
    const deps = makeDeps();
    const { log, byMonth } = memoryLog();
    const useCases = createUseCases({
      ...deps,
      answerLog: log,
      newId: () => "id",
      now: () => new Date(2026, 9, 20, 12, 0),
    });
    const answered = (studyDay: string): Answer => ({
      id: `answer-${studyDay}`,
      deckUrl: deck.url,
      cardUrl: card.url,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`,
      studyDay,
      nextIntervalDays: 1,
    });
    for (const studyDay of ["2026-09-21", "2026-10-01"])
      byMonth.set(studyDay.slice(0, 7), [answered(studyDay)]);
    for (let i = 0; i <= MAX_LOG_MONTHS; i += 1) {
      const month = `${9000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
      byMonth.set(month, [answered(`${month}-01`)]);
    }
    const answers = await useCases.loadAnswerLog(instance.url);
    expect(answers.map((answer) => answer.studyDay)).toEqual(["2026-09-21", "2026-10-01"]);
    expect(log.months).toHaveBeenCalledWith(instance.url, "2026-10");
  });
});
