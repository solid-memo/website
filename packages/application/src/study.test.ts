// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createUseCases } from "./useCases";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";
import { sm2s, promptOf, instance, deck, card, makeDeps } from "./testing/fakePorts";

describe("study", () => {
  it("getStudyQueue draws new cards with the injected random source", async () => {
    const deps = makeDeps();
    const newCards = ["n1", "n2", "n3"].map((id) => ({
      ...card,
      id,
      url: `${deck.cardsDocumentUrl}#${id}`,
    }));
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue(newCards);
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(sm2s([]));
    const useCases = createUseCases({ ...deps, random: () => 0 });

    const queue = await useCases.getStudyQueue(instance.url, deck, new Date(2026, 8, 21, 12, 0));
    expect(queue.newPrompts.map((p) => p.card.id)).toEqual(["n2", "n3", "n1"]);
  });
  it("getStudyQueue composes cards, review states and preferences", async () => {
    const deps = makeDeps();
    const dueCard = { ...card, id: "card-due", url: `${deck.cardsDocumentUrl}#card-due` };
    const newCard = { ...card, id: "card-new", url: `${deck.cardsDocumentUrl}#card-new` };
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([dueCard, newCard]);
    const states: ReviewState[] = [
      {
        cardId: "card-due",
        direction: "front-to-back",
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-09-20",
        firstReviewedAt: "2026-09-19T10:00:00.000Z",
        lastReviewedAt: "2026-09-19T10:00:00.000Z",
        formatVersion: 2,
      },
    ];
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(sm2s(states));
    const useCases = createUseCases(deps);

    const queue = await useCases.getStudyQueue(instance.url, deck, new Date(2026, 8, 21, 12, 0));
    expect(queue.due.map((p) => p.card.id)).toEqual(["card-due"]);
    expect(queue.newPrompts.map((p) => p.card.id)).toEqual(["card-new"]);
    // What grading them takes besides: the instance's preferences.
    expect(queue.prefs).toEqual(await useCases.getPreferences(instance.url));
    // The states it was built from, which the grades' intervals are shown from: no read of their own.
    expect(queue.states).toEqual(states);
    expect(deps.reviewStateRepository.listReviewStates).toHaveBeenCalledOnce();

    const capped = await useCases.getStudyQueue(
      instance.url,
      { ...deck, newCardsPerDay: 0, maxReviewsPerDay: 0 },
      new Date(2026, 8, 21, 12, 0),
    );
    expect(capped.due).toEqual([]);
    expect(capped.newPrompts).toEqual([]);
  });
  it("getStudyQueue goes by FSRS-6's due days when the preferences name it, else SM-2's", async () => {
    const deps = makeDeps();
    const dueCard = { ...card, id: "card-due", url: `${deck.cardsDocumentUrl}#card-due` };
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([dueCard]);
    const sm2: ReviewState = {
      cardId: "card-due",
      direction: "front-to-back",
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      due: "2026-09-20",
      firstReviewedAt: "2026-09-19T10:00:00.000Z",
      lastReviewedAt: "2026-09-19T10:00:00.000Z",
      formatVersion: 2,
    };
    const fsrs: FsrsState = {
      cardId: "card-due",
      direction: "front-to-back",
      stability: 12,
      difficulty: 4,
      due: "2026-10-01",
      firstReviewedAt: sm2.firstReviewedAt,
      lastReviewedAt: sm2.lastReviewedAt,
      formatVersion: 1,
    };
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue({
      sm2: [sm2],
      fsrs: [fsrs],
    });
    const at = new Date(2026, 8, 21, 12, 0);
    const useCases = createUseCases(deps);
    expect((await useCases.getStudyQueue(instance.url, deck, at)).due).toHaveLength(1);
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" },
      formatVersion: 5,
    });
    const queue = await useCases.getStudyQueue(instance.url, deck, at);
    expect(queue.due).toEqual([]);
    expect(queue.states).toEqual([sm2]);
    expect(queue.fsrsStates).toEqual([fsrs]);
  });
  it("recordReview starts fresh for a never-reviewed card", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const now = new Date(2026, 8, 21, 12, 0);

    const { state } = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      5,
      now,
    );

    expect(state).toEqual({
      cardId: card.id,
      direction: "front-to-back",
      easeFactor: 2.6,
      intervalDays: 1,
      repetitions: 1,
      due: "2026-09-22",
      firstReviewedAt: now.toISOString(),
      lastReviewedAt: now.toISOString(),
      formatVersion: 2,
    });
    expect(deps.reviewStateRepository.gradeReviewState).toHaveBeenCalledWith(
      deck,
      { cardId: card.id, direction: "front-to-back" },
      expect.any(Function),
    );
  });
  it("recordReview transitions an existing state and keeps firstReviewedAt", async () => {
    const deps = makeDeps();
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue(
      promptOf({
        cardId: card.id,
        direction: "front-to-back",
        easeFactor: 2.5,
        intervalDays: 6,
        repetitions: 2,
        due: "2026-09-21",
        firstReviewedAt: "2026-09-10T10:00:00.000Z",
        lastReviewedAt: "2026-09-15T10:00:00.000Z",
        formatVersion: 2,
      }),
    );
    const useCases = createUseCases(deps);
    const now = new Date(2026, 8, 21, 12, 0);

    const { state } = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      4,
      now,
    );

    expect(state.easeFactor).toBeCloseTo(2.5);
    expect(state.repetitions).toBe(3);
    expect(state.intervalDays).toBe(15);
    expect(state.due).toBe("2026-10-06");
    expect(state.firstReviewedAt).toBe("2026-09-10T10:00:00.000Z");
    expect(state.lastReviewedAt).toBe(now.toISOString());
    expect(state.previous).toEqual({
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-09-21",
      lastReviewedAt: "2026-09-15T10:00:00.000Z",
    });
  });
  it("recordReview grades the state the reviews document holds when written, with the preferences it is given (known)", async () => {
    const deps = makeDeps();
    const stored = {
      cardId: card.id,
      direction: "front-to-back" as const,
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-09-21",
      firstReviewedAt: "2026-09-10T10:00:00.000Z",
      lastReviewedAt: "2026-09-15T10:00:00.000Z",
      formatVersion: 2,
    };
    vi.mocked(deps.reviewStateRepository.gradeReviewState).mockImplementation(
      async (_deck, _key, grade) => ({
        state: grade(promptOf(stored)),
        current: promptOf(stored),
      }),
    );
    const useCases = createUseCases(deps);
    const now = new Date(2026, 8, 21, 12, 0);

    const { state, undo } = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      4,
      now,
      {},
      // A boundary past noon: the grade counts for the 20th.
      { prefs: { ...DEFAULT_PREFERENCES, dayBoundaryHour: 13 } },
    );

    expect(deps.preferencesRepository.getPreferences).not.toHaveBeenCalled();
    expect(deps.reviewStateRepository.gradeReviewState).toHaveBeenCalledWith(
      deck,
      { cardId: card.id, direction: "front-to-back" },
      expect.any(Function),
    );
    expect(state.repetitions).toBe(3);
    expect(state.firstReviewedAt).toBe(stored.firstReviewedAt);
    expect(state.due).toBe("2026-10-05");
    // Undoing it writes back the state the grade was applied to, as the document held it.
    expect(undo.before).toBe(stored);
  });
  it("recordReview stores no snapshot for a never-reviewed card", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const { state } = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      4,
      new Date(2026, 8, 21, 12, 0),
    );
    expect(state).not.toHaveProperty("previous");
  });
  describe("resetStudyDay", () => {
    const now = new Date(2026, 8, 21, 12, 0);
    const earlier = new Date(2026, 8, 15, 12, 0).toISOString();
    const morning = {
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-09-21",
      lastReviewedAt: earlier,
    };

    it("restores reviewed cards and forgets cards introduced today, in one write", async () => {
      const deps = makeDeps();
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(
        sm2s([
          {
            cardId: "reviewed",
            direction: "front-to-back",
            easeFactor: 2.6,
            intervalDays: 15,
            repetitions: 3,
            due: "2026-10-06",
            firstReviewedAt: earlier,
            lastReviewedAt: now.toISOString(),
            formatVersion: 2,
            previous: morning,
          },
          {
            cardId: "introduced",
            direction: "front-to-back",
            easeFactor: 2.5,
            intervalDays: 1,
            repetitions: 1,
            due: "2026-09-22",
            firstReviewedAt: now.toISOString(),
            lastReviewedAt: now.toISOString(),
            formatVersion: 2,
          },
          {
            cardId: "untouched",
            direction: "front-to-back",
            easeFactor: 2.5,
            intervalDays: 6,
            repetitions: 2,
            due: "2026-09-30",
            firstReviewedAt: earlier,
            lastReviewedAt: earlier,
            formatVersion: 2,
          },
        ]),
      );
      const fsrsMorning = {
        stability: 6,
        difficulty: 5,
        due: "2026-09-21",
        lastReviewedAt: earlier,
      };
      const fsrsOf = (cardId: string, firstReviewedAt: string, previous?: typeof fsrsMorning) => ({
        cardId,
        direction: "front-to-back" as const,
        stability: 20,
        difficulty: 4.8,
        due: "2026-10-12",
        firstReviewedAt,
        lastReviewedAt: now.toISOString(),
        formatVersion: 1,
        ...(previous === undefined ? {} : { previous }),
      });
      const listed = await deps.reviewStateRepository.listReviewStates(deck);
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue({
        ...listed,
        fsrs: [fsrsOf("reviewed", earlier, fsrsMorning), fsrsOf("introduced", now.toISOString())],
      });
      const useCases = createUseCases(deps);

      await expect(useCases.resetStudyDay(instance.url, deck, now)).resolves.toBe(2);

      expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledExactlyOnceWith(deck, {
        save: [
          {
            cardId: "reviewed",
            direction: "front-to-back",
            firstReviewedAt: earlier,
            formatVersion: 2,
            ...morning,
          },
        ],
        remove: [{ cardId: "introduced", direction: "front-to-back" }],
        fsrs: {
          save: [
            {
              cardId: "reviewed",
              direction: "front-to-back",
              firstReviewedAt: earlier,
              formatVersion: 1,
              ...fsrsMorning,
            },
          ],
          remove: [{ cardId: "introduced", direction: "front-to-back" }],
        },
      });
    });

    it("writes nothing when nothing was studied today", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      await expect(useCases.resetStudyDay(instance.url, deck, now)).resolves.toBe(0);
      expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
    });

    it("uses the instance's day boundary", async () => {
      const deps = makeDeps();
      const lateNight = new Date(2026, 8, 21, 3, 0).toISOString();
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(
        sm2s([
          {
            cardId: "night-owl",
            direction: "front-to-back",
            easeFactor: 2.5,
            intervalDays: 1,
            repetitions: 1,
            due: "2026-09-22",
            firstReviewedAt: lateNight,
            lastReviewedAt: lateNight,
            formatVersion: 2,
          },
        ]),
      );
      const useCases = createUseCases(deps);
      await expect(useCases.resetStudyDay(instance.url, deck, now)).resolves.toBe(0);

      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
        preferences: {
          newCardsPerDay: 20,
          maxReviewsPerDay: 200,
          dayBoundaryHour: 0,
          answerScale: "sm2",
          developerMode: false,
          invalidDataPolicy: "block-instance" as const,
          theme: "system" as const,
          scheduler: "sm2" as const,
          desiredRetention: 0.9,
          schedulerInvitationDismissed: false,
          palette: DEFAULT_PREFERENCES.palette,
          textSize: "default" as const,
        },
        formatVersion: 2,
      });
      await expect(useCases.resetStudyDay(instance.url, deck, now)).resolves.toBe(1);
    });
  });
  it("recordReview resets on a lapse and reschedules for tomorrow", async () => {
    const deps = makeDeps();
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue(
      promptOf({
        cardId: card.id,
        direction: "front-to-back",
        easeFactor: 2.2,
        intervalDays: 30,
        repetitions: 5,
        due: "2026-09-21",
        firstReviewedAt: "2026-08-01T10:00:00.000Z",
        lastReviewedAt: "2026-09-15T10:00:00.000Z",
        formatVersion: 2,
      }),
    );
    const useCases = createUseCases(deps);

    const { state } = await useCases.recordReview(
      instance.url,
      deck,
      { card, direction: "front-to-back" },
      0,
      new Date(2026, 8, 21, 12, 0),
    );

    expect(state.repetitions).toBe(0);
    expect(state.intervalDays).toBe(1);
    expect(state.easeFactor).toBeCloseTo(2.2);
    expect(state.due).toBe("2026-09-22");
  });
});
