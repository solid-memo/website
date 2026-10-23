// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createUseCases, type UseCases } from "./useCases";
import {
  courseDraft,
  deckDraft,
  DRAFT,
  playableCourseDraft,
} from "@solid-memo/domain/testing/releaseDraft";
import { TRIAL_INSTANCE_URL, TRIAL_SESSION } from "@solid-memo/domain/release/trial";
import type { Instance } from "@solid-memo/domain/instance";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { fsrsInterval } from "@solid-memo/domain/fsrs";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";

import {
  session,
  sm2s,
  promptOf,
  instance,
  deck,
  card,
  makeDeps,
  memoryLog,
} from "./testing/fakePorts";
import { now, RULES, review, setup, learned } from "./testing/digestWorld";

describe("the instance digest", () => {
  it("counts today's study from the documents the first time, and keeps the deck's schedule", async () => {
    const { useCases, stored, digestRepository } = setup();
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledOnce());
    expect(stored()!.schedules[deck.url]).toMatchObject({
      cardsVersion: "c1",
      reviewsVersion: "r1",
    });
    expect(stored()!.receipts[deck.cardsDocumentUrl]).toEqual({
      document: deck.cardsDocumentUrl,
      version: "c1",
      latestFormat: true,
    });
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toEqual({
      document: deck.reviewsDocumentUrl,
      version: "r1",
      latestFormat: true,
    });
  });

  it("counts from the schedule while neither document changed", async () => {
    const { deps, useCases } = setup(await learned());
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    expect(deps.deckRepository.readCardsSince).toHaveBeenCalledExactlyOnceWith(deck, "c1");
    expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledExactlyOnceWith(
      deck,
      "r1",
    );
  });

  it("counts from the documents again when one changed, or the deck is studied another way", async () => {
    const digest = await learned();
    const changed = setup({
      ...digest,
      schedules: { [deck.url]: { ...digest.schedules[deck.url]!, cardsVersion: "c0" } },
    });
    await expect(changed.useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    expect(changed.deps.deckRepository.readCardsSince).toHaveBeenCalledExactlyOnceWith(deck, "c0");

    const otherWay = setup(digest);
    await expect(
      otherWay.useCases.getStudyCounts(instance.url, { ...deck, direction: "bidirectional" }, now),
    ).resolves.toEqual({
      dueCount: 1,
      newCount: 3,
    });
    expect(otherWay.deps.deckRepository.readCardsSince).toHaveBeenLastCalledWith(
      expect.anything(),
      undefined,
    );
  });

  it("counts from the documents again once the instance schedules with another scheduler, and keeps which", async () => {
    const digest = await learned();
    expect(digest.schedules[deck.url]!.schedule.scheduler).toBe("sm2");
    const switched = setup(digest);
    vi.mocked(switched.deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" },
      formatVersion: 5,
    });
    await expect(switched.useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    expect(switched.deps.deckRepository.readCardsSince).toHaveBeenLastCalledWith(
      expect.anything(),
      undefined,
    );
    await vi.waitFor(() => expect(switched.digestRepository.updateDigest).toHaveBeenCalled());
    expect(switched.stored()!.schedules[deck.url]!.schedule.scheduler).toBe("fsrs6");
  });

  it("counts, forecasts and spreads intervals by FSRS-6's due days under FSRS-6, eases by SM-2's", async () => {
    const { deps, useCases } = setup();
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" },
      formatVersion: 5,
    });
    const fsrs: FsrsState = {
      cardId: review.cardId,
      direction: review.direction,
      stability: 40,
      difficulty: 3,
      due: "2026-10-26",
      firstReviewedAt: review.firstReviewedAt,
      lastReviewedAt: review.lastReviewedAt,
      formatVersion: 1,
    };
    deps.reviewStateRepository.readReviewStatesSince = vi.fn(async () => ({
      unchanged: false as const,
      value: { sm2: [review], fsrs: [fsrs] },
      version: "r1",
    }));
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 0,
      newCount: 1,
    });
    const [progress] = (await useCases.getCardProgress(instance.url, now, { deck })).decks;
    // Thirty days from its last review on the 26th: mature, and not overdue.
    expect(progress!.progress).toEqual({ new: 1, relearning: 0, young: 0, mature: 1 });
    expect(progress!.intervals.find((bin) => bin.count > 0)!.from).toBeGreaterThan(1);
    expect(progress!.eases.reduce((sum, bin) => sum + bin.count, 0)).toBe(1);
    expect(progress!.overdue).toBe(0);
    const insight = await useCases.deckInsight(instance.url, deck, now, {
      ...DEFAULT_PREFERENCES,
      scheduler: "fsrs6",
    });
    expect(insight.intervals).toEqual(progress!.intervals);
  });

  it("notes no format receipt for a document holding something outdated, and nothing of a document without a version", async () => {
    const outdated = setup();
    outdated.deps.deckRepository.readCardsSince = vi.fn(async () => ({
      unchanged: false as const,
      value: [{ ...card, formatVersion: 0 }],
      version: "c1",
    }));
    outdated.deps.reviewStateRepository.readReviewStatesSince = vi.fn(async () => ({
      unchanged: false as const,
      value: sm2s([{ ...review, formatVersion: 1 }]),
      version: "r1",
    }));
    await outdated.useCases.getStudyCounts(instance.url, deck, now);
    await vi.waitFor(() => expect(outdated.digestRepository.updateDigest).toHaveBeenCalled());
    expect(outdated.stored()!.receipts).toEqual({});

    const unversioned = setup();
    unversioned.deps.deckRepository.readCardsSince = vi.fn(async () => ({
      unchanged: false as const,
      value: [card],
      version: null,
    }));
    await unversioned.useCases.getStudyCounts(instance.url, deck, now);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unversioned.digestRepository.updateDigest).not.toHaveBeenCalled();
  });

  it("goes on without a digest it cannot read or write", async () => {
    const { deps, useCases, digestRepository } = setup();
    vi.mocked(digestRepository.readDigest).mockRejectedValue(new Error("offline"));
    vi.mocked(digestRepository.updateDigest).mockRejectedValue(new Error("offline"));
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    await expect(createUseCases(deps).getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
  });

  it("refuses a read without a version that says unchanged", async () => {
    const { deps, useCases } = setup(await learned());
    deps.deckRepository.readCardsSince = vi.fn(async () => ({ unchanged: true as const }));
    await expect(
      useCases.getStudyCounts(instance.url, { ...deck, direction: "bidirectional" }, now),
    ).rejects.toThrow("came back unchanged");
    await expect(useCases.refreshStudyDigest(instance.url, deck)).resolves.toBeUndefined();
  });

  it("keeps the schedule and checks the reviews document when a study session ends", async () => {
    const { useCases, stored, digestRepository } = setup();
    await useCases.refreshStudyDigest(instance.url, deck);
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledTimes(2));
    expect(stored()!.schedules[deck.url]).toMatchObject({
      cardsVersion: "c1",
      reviewsVersion: "r1",
    });
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toEqual({
      document: deck.reviewsDocumentUrl,
      version: `v-${deck.reviewsDocumentUrl}`,
      conformedTo: RULES,
    });
  });

  it("keeps no receipt of a reviews document that does not conform, or has no version", async () => {
    const { deps, useCases, stored, digestRepository } = setup();
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url: string) => ({
      unchanged: false as const,
      value: {
        url,
        status: "checked" as const,
        subjects: [
          {
            url: `${url}#x`,
            status: "checked" as const,
            shape: "reviewState" as const,
            version: 2,
            violations: [
              { message: { en: "no" }, severity: "violation" as const, constraint: "MinCount" },
            ],
          },
        ],
      },
      version: "r1",
    }));
    await useCases.refreshStudyDigest(instance.url, deck);
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledOnce());
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toEqual({
      document: deck.reviewsDocumentUrl,
      version: "r1",
      latestFormat: true,
    });
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url: string) => ({
      unchanged: false as const,
      value: { url, status: "checked" as const, subjects: [] },
      version: null,
    }));
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(stored()!.receipts[deck.reviewsDocumentUrl]!.conformedTo).toBeUndefined();
  });

  it("keeps no drafts without a repository of them", async () => {
    const useCases = createUseCases(makeDeps());
    await expect(useCases.listReleaseDrafts(instance.url)).resolves.toEqual([]);
    await expect(
      useCases.getReleaseDraft(`${instance.url}drafts/a/v1/release.ttl`),
    ).rejects.toThrow("This app keeps no drafts.");
    await expect(useCases.listPublishedReleases(instance.url)).resolves.toEqual([]);
    await expect(
      useCases.makeReleasePublic(instance.url, `${instance.url}releases/a/v1.ttl`, session.webId),
    ).rejects.toThrow("This app keeps no drafts.");
  });

  it("reads no document of an instance as a graph without a reader of them", async () => {
    const useCases = createUseCases(makeDeps());
    const graph = await useCases.readInstanceGraph(instance.url, session.webId);
    const documents = graph.nodes.filter((node) => node.kind === "document");
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.every((node) => node.unreadable === true)).toBe(true);
  });

  it("plans the format update without reading again documents with nothing outdated, and writes no digest", async () => {
    const { deps, useCases, digestRepository } = setup(await learned());
    const plan = await useCases.planMigration(instance.url);
    expect(plan.cardCount).toBe(0);
    expect(deps.deckRepository.readCardsSince).toHaveBeenCalledWith(deck, "c1");
    expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledWith(deck, "r1");
    expect(digestRepository.updateDigest).not.toHaveBeenCalled();
  });
});

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

describe("openTrial", () => {
  const trialInstance: Instance = { url: TRIAL_INSTANCE_URL, name: "Trial" };
  function sandbox() {
    const trialUseCases = {
      createInstance: vi.fn(async () => trialInstance),
      switchScheduler: vi.fn(async () => undefined),
      startCourse: vi.fn(async () => deck),
      importLibraryDeck: vi.fn(async () => deck),
    };
    const pod = { exists: vi.fn(), start: vi.fn(async () => undefined), discard: vi.fn() };
    return { useCases: trialUseCases as unknown as UseCases, pod, trialUseCases };
  }
  function withSandbox() {
    const deps = makeDeps();
    const made = sandbox();
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: {
        ...DEFAULT_PREFERENCES,
        answerScale: "minimal",
        dayBoundaryHour: 2,
        newCardsPerDay: 1,
        scheduler: "fsrs6",
        desiredRetention: 0.85,
      },
      formatVersion: 5,
    });
    const trialSandbox = vi.fn(() => made);
    return { deps, made, trialSandbox, useCases: createUseCases({ ...deps, trialSandbox }) };
  }

  it("starts a course draft in a sandbox of its own, as a learner with the user's answer scale, study day and scheduler", async () => {
    const { made, trialSandbox, useCases } = withSandbox();
    const draft = playableCourseDraft();
    const opened = await useCases.openTrial(draft, instance.url);
    expect(opened).toEqual({
      ok: true,
      trial: { useCases: made.useCases, instance: trialInstance, deck },
    });
    expect(trialSandbox).toHaveBeenCalledWith(draft);
    expect(made.pod.start).toHaveBeenCalled();
    expect(made.trialUseCases.createInstance).toHaveBeenCalledWith(TRIAL_SESSION, {
      containerUrl: TRIAL_INSTANCE_URL,
      name: "Trial",
      registrationTarget: "private",
    });
    expect(made.trialUseCases.switchScheduler).toHaveBeenCalledWith(TRIAL_INSTANCE_URL, {
      ...DEFAULT_PREFERENCES,
      answerScale: "minimal",
      dayBoundaryHour: 2,
      scheduler: "fsrs6",
      desiredRetention: 0.85,
    });
    expect(made.trialUseCases.startCourse).toHaveBeenCalledWith(
      TRIAL_INSTANCE_URL,
      expect.objectContaining({ url: DRAFT, isCourse: true }),
    );
    expect(made.trialUseCases.importLibraryDeck).not.toHaveBeenCalled();
  });

  it("imports a deck draft as a library deck", async () => {
    const { made, useCases } = withSandbox();
    await useCases.openTrial(deckDraft(), instance.url);
    expect(made.trialUseCases.importLibraryDeck).toHaveBeenCalledWith(
      TRIAL_INSTANCE_URL,
      expect.objectContaining({ url: DRAFT }),
    );
    expect(made.trialUseCases.startCourse).not.toHaveBeenCalled();
  });

  it("refuses a draft that cannot be played, with what keeps it from it, making nothing", async () => {
    const { trialSandbox, useCases } = withSandbox();
    const opened = await useCases.openTrial(courseDraft(), instance.url);
    expect(opened.ok).toBe(false);
    expect(!opened.ok && opened.problems.map((problem) => problem.code)).toEqual([
      "fewDistractors",
      "fewDistractors",
      "chapterWithoutStep",
    ]);
    expect(trialSandbox).not.toHaveBeenCalled();
  });

  it("plays no trial unless given a sandbox", async () => {
    await expect(createUseCases(makeDeps()).openTrial(deckDraft(), instance.url)).rejects.toThrow(
      "plays no trials",
    );
  });
});
