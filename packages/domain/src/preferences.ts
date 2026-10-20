// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { AnswerScale } from "./answerScale";
import { conceptOfPalette, paletteOfConcept } from "./concepts";
import { DEFAULT_DESIRED_RETENTION, type Scheduler } from "./fsrs";
import { DEFAULT_INVALID_DATA_POLICY, type InvalidDataPolicy } from "./invalidDataPolicy";
import { DEFAULT_PALETTE, type Palette } from "./palette";
import { DEFAULT_TEXT_SIZE, type TextSize } from "./textSize";
import { DEFAULT_THEME_CHOICE, type ThemeChoice } from "./theme";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";

/**
 * Format version written on every preferences document this app saves.
 * Format 6 adds the palette and the text size; format 5 the scheduler, the desired retention and the dismissed invitation to FSRS-6; format 4 the theme; format 3 the invalid data policy; format 2 states every field;
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
  /**
   * The learner answered "Not now" to the deck list's invitation to
   * switch from SM-2 to FSRS-6, so it is not shown again.
   */
  schedulerInvitationDismissed: boolean;
  /**
   * The colors the app is shown in: the IRI of a concept of
   * solid-memo:Palettes, or of a palette this version does not know (a
   * later version's, or one of the user's own), which is kept as it is
   * and shown as Standard (shownPalette). Kept on the device too, as
   * the theme is.
   */
  palette: string;
  /** How large the text is shown. Kept on the device too, as the theme is. */
  textSize: TextSize;
}

/** Preferences as a pod holds them, with the format they are stored in. */
export interface StoredPreferences {
  preferences: StudyPreferences;
  formatVersion: number;
}

/**
 * What an instance's preferences mean when it has none stored: an
 * instance made before this version, which never saved them, and whose
 * review states are SM-2's. So SM-2, as it always was: a default never
 * changes anyone's scheduler. A new instance states its own
 * (NEW_INSTANCE_PREFERENCES).
 *
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
  schedulerInvitationDismissed: false,
  palette: conceptOfPalette(DEFAULT_PALETTE),
  textSize: DEFAULT_TEXT_SIZE,
};

/**
 * The preferences a new instance is made with, a guest's and a trial's
 * among them: the defaults, but with FSRS-6, the recommended scheduler,
 * as there is no SM-2 history yet to replay.
 */
export const NEW_INSTANCE_PREFERENCES: StudyPreferences = {
  ...DEFAULT_PREFERENCES,
  scheduler: "fsrs6",
};

/**
 * Whether the deck list invites the learner to switch to FSRS-6: while
 * SM-2 sets the due days and the learner has not answered "Not now".
 */
export function invitesToFsrs(
  prefs: Pick<StudyPreferences, "scheduler" | "schedulerInvitationDismissed">,
): boolean {
  return prefs.scheduler === "sm2" && !prefs.schedulerInvitationDismissed;
}

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

/** The palette preferences are shown in: theirs, or Standard for one this version does not know. */
export function shownPalette(prefs: Pick<StudyPreferences, "palette">): Palette {
  return paletteOfConcept(prefs.palette) ?? DEFAULT_PALETTE;
}

/**
 * The palette preferences keep when the app is shown in `palette`: the
 * one they hold while it shows as that, so a palette this version does
 * not know outlives a save, else the concept of the one shown.
 */
export function keptPalette(prefs: Pick<StudyPreferences, "palette">, palette: Palette): string {
  return shownPalette(prefs) === palette ? prefs.palette : conceptOfPalette(palette);
}
