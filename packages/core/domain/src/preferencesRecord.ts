// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  conceptOfPolicy,
  conceptOfScheduler,
  conceptOfTextSize,
  conceptOfTheme,
  policyOfConcept,
  schedulerOfConcept,
  textSizeOfConcept,
  themeOfConcept,
} from "./concepts";
import { usableDesiredRetention } from "./fsrs";
import { DEFAULT_PREFERENCES, isDailyLimit, type StudyPreferences } from "./preferences";
import type { PreferencesV6 } from "@solid-memo/vocab/types.generated";

/**
 * Preferences between their latest shape record and the model: the same
 * fields, the invalid data policy, the theme, the scheduler and the text
 * size as concepts in the record and by their notations in the model.
 * The palette is the concept's IRI in both, so one this version does not
 * know is kept as it is. A desired retention, a day boundary or a daily
 * limit outside the range the shape allows reads as its default:
 * preferences that do not fit their shape are still used, FSRS-6 has no
 * interval for such a share, and a day boundary that is not an hour of
 * the day moves the study day out of the calendar.
 */
export function preferencesFromRecord(data: PreferencesV6): StudyPreferences {
  return {
    newCardsPerDay: usableCount(data.newCardsPerDay, DEFAULT_PREFERENCES.newCardsPerDay),
    maxReviewsPerDay: usableCount(data.maxReviewsPerDay, DEFAULT_PREFERENCES.maxReviewsPerDay),
    dayBoundaryHour: usableDayBoundaryHour(data.dayBoundaryHour),
    answerScale: data.answerScale,
    developerMode: data.developerMode,
    invalidDataPolicy: policyOfConcept(data.invalidDataPolicy)!,
    theme: themeOfConcept(data.theme)!,
    scheduler: schedulerOfConcept(data.scheduler)!,
    desiredRetention: usableDesiredRetention(data.desiredRetention),
    schedulerInvitationDismissed: data.schedulerInvitationDismissed,
    palette: data.palette,
    textSize: textSizeOfConcept(data.textSize)!,
  };
}

/** A day boundary as stored when it is an hour of the day, 0 to 23; otherwise the default. */
function usableDayBoundaryHour(stored: number): number {
  return Number.isInteger(stored) && stored >= 0 && stored <= 23
    ? stored
    : DEFAULT_PREFERENCES.dayBoundaryHour;
}

/** A daily limit as stored when it is a count, 0 or more; otherwise the default. */
function usableCount(stored: number, fallback: number): number {
  return isDailyLimit(stored) ? stored : fallback;
}

export function preferencesToRecord(preferences: StudyPreferences): PreferencesV6 {
  return {
    newCardsPerDay: preferences.newCardsPerDay,
    maxReviewsPerDay: preferences.maxReviewsPerDay,
    dayBoundaryHour: preferences.dayBoundaryHour,
    answerScale: preferences.answerScale,
    developerMode: preferences.developerMode,
    invalidDataPolicy: conceptOfPolicy(preferences.invalidDataPolicy),
    theme: conceptOfTheme(preferences.theme),
    scheduler: conceptOfScheduler(preferences.scheduler),
    desiredRetention: preferences.desiredRetention,
    schedulerInvitationDismissed: preferences.schedulerInvitationDismissed,
    palette: preferences.palette,
    textSize: conceptOfTextSize(preferences.textSize),
  };
}
