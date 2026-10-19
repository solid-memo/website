// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { AnswerScale } from "./answerScale";
import { DEFAULT_DESIRED_RETENTION, type Scheduler } from "./fsrs";
import { DEFAULT_INVALID_DATA_POLICY, type InvalidDataPolicy } from "./invalidDataPolicy";
import { DEFAULT_THEME_CHOICE, type ThemeChoice } from "./theme";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";

/**
 * Format version written on every preferences document this app saves.
 * Format 5 adds the scheduler and the desired retention; format 4 the theme; format 3 the invalid data policy; format 2 states every field;
 * format 1 is whatever the unversioned era wrote, each missing field
 * meaning its default.
 */
export const PREFERENCES_FORMAT_VERSION: number = LATEST_VERSION.preferences;

export interface StudyPreferences {
  /** Maximum unseen cards introduced per study day. */
  newCardsPerDay: number;
  /** Maximum due-card reviews per study day. */
  maxReviewsPerDay: number;
  /**
   * Local hour at which the study day rolls over (Anki-style: with 4,
   * reviewing at 03:00 still counts as the previous day).
   */
  dayBoundaryHour: number;
  /** Which grading buttons a session shows. */
  answerScale: AnswerScale;
  /**
   * Developer settings: reveals diagnostic views (the raw WebID
   * document) that ordinary study has no use for.
   */
  developerMode: boolean;
  /** What the app does when data in the instance does not conform to its shapes. */
  invalidDataPolicy: InvalidDataPolicy;
  /**
   * How the app is shown. Kept on the device too, which is all there is
   * before an instance has preferences (and before login).
   */
  theme: ThemeChoice;
  /**
   * The scheduler whose review states set the due days. SM-2's states
   * are kept up to date whichever it is, so switching back loses nothing.
   */
  scheduler: Scheduler;
  /** The chance of recall FSRS-6 aims at when a card falls due, as a share (0.9 is 90%). */
  desiredRetention: number;
}

/** Preferences as a pod holds them, with the format they are stored in. */
export interface StoredPreferences {
  preferences: StudyPreferences;
  formatVersion: number;
}

/**
 * A few new cards a day: each comes back for reviews in the days after,
 * so a small, steady pace keeps the reviews to come manageable.
 */
export const DEFAULT_PREFERENCES: StudyPreferences = {
  newCardsPerDay: 5,
  maxReviewsPerDay: 200,
  dayBoundaryHour: 4,
  answerScale: "sm2",
  developerMode: false,
  invalidDataPolicy: DEFAULT_INVALID_DATA_POLICY,
  theme: DEFAULT_THEME_CHOICE,
  scheduler: "sm2",
  desiredRetention: DEFAULT_DESIRED_RETENTION,
};

/**
 * The grading buttons a session shows: the stored answer scale under
 * SM-2; under FSRS-6 always Again, Hard, Good and Easy, the four ratings
 * it knows. The stored scale is kept for switching back.
 */
export function effectiveAnswerScale(
  prefs: Pick<StudyPreferences, "answerScale" | "scheduler">,
): AnswerScale {
  return prefs.scheduler === "fsrs6" ? "minimal" : prefs.answerScale;
}
