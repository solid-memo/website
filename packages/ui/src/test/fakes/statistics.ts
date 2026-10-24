// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { DeckProgress, StatisticsReport } from "@solid-memo/application/statistics";
import type { Answer } from "@solid-memo/domain/answer";
import type { Deck } from "@solid-memo/domain/deck";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { statisticsOf } from "@solid-memo/domain/statistics";
import type { TodayFigures } from "@solid-memo/domain/studyDigest";
import { easeHistogram, intervalHistogram } from "@solid-memo/domain/scheduleInsight";
import type { StatisticsUseCases } from "@solid-memo/application/statistics";

/**
 * The statistics of the answers given up to `today`, as getStatistics
 * reports them: by default of a log that covers its range and begins
 * with the answers' first month (none without answers), its days
 * beginning at the default hour.
 */
export function statisticsReportOf(
  answers: readonly Answer[],
  today: string,
  coverage: string | null = null,
  logBegins = answers.map((answer) => answer.studyDay.slice(0, 7)).sort()[0] ?? null,
): StatisticsReport {
  return {
    ...statisticsOf(answers, today),
    coverage,
    logBegins,
    dayBoundaryHour: DEFAULT_PREFERENCES.dayBoundaryHour,
  };
}

/** The today strip's figures (getTodayFigures) of the answers given, as statisticsOf makes them. */
export function todayFiguresFrom(answers: readonly Answer[], today: string): TodayFigures {
  const { days, streaks, week, retention, studyTime } = statisticsOf(answers, today);
  return {
    today,
    days,
    streaks,
    week,
    young: retention.young,
    medianAnswerMs: studyTime.medianAnswerMs,
  };
}

/**
 * A deck's figures in the cards' progress (getCardProgress): nothing
 * studied and nothing hard, unless given.
 */
export function deckProgressOf(deck: Deck, extra: Partial<DeckProgress> = {}): DeckProgress {
  return {
    deck,
    progress: { new: 0, relearning: 0, young: 0, mature: 0 },
    forecast: [],
    intervals: intervalHistogram([]),
    eases: easeHistogram([]),
    overdue: 0,
    daysToClear: 0,
    newCardsPerDay: 5,
    introducedToday: 0,
    hardest: { reviews: 0, cards: [] },
    courseAnswers: 0,
    confusions: [],
    ...extra,
  };
}

/**
 * The use cases of the statistics, faked (a `vi.fn` each), as the real
 * ones relate to one another; `overrides` replace any of them. They are
 * made in `fake`, the object a test calls, and call one another through
 * it, so a method a test replaces is the one the others call.
 */
export function makeStatisticsUseCasesFake(
  overrides: Partial<StatisticsUseCases> = {},
  fake: StatisticsUseCases = {} as StatisticsUseCases,
): StatisticsUseCases {
  return Object.assign(
    fake,
    {
      getStatistics: vi.fn(async () => statisticsReportOf([], "2026-09-21")),
      getTodayFigures: vi.fn(async () => todayFiguresFrom([], "2026-09-21")),
      saveAnswers: vi.fn(async () => undefined),
      loadAnswerLog: vi.fn(async () => []),
      cardAnswers: vi.fn(async () => []),
      deckInsight: vi.fn(async () => ({
        today: "2026-09-21",
        maxReviewsPerDay: DEFAULT_PREFERENCES.maxReviewsPerDay,
        forecast: [],
        scheduled: 0,
        intervals: intervalHistogram([]),
        eases: easeHistogram([]),
        lapses: { lapses: new Map(), since: null },
        leeches: [],
      })),
      getCardProgress: vi.fn(async () => ({ today: "2026-09-21", decks: [] })),
      getCourseStatistics: vi.fn(async () => []),
    } satisfies StatisticsUseCases,
    overrides,
  );
}
