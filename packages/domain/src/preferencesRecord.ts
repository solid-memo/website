// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  conceptOfPolicy,
  conceptOfScheduler,
  conceptOfTheme,
  policyOfConcept,
  schedulerOfConcept,
  themeOfConcept,
} from "./concepts";
import type { StudyPreferences } from "./preferences";
import type { PreferencesV5 } from "@solid-memo/vocab/types.generated";

/**
 * Preferences between their latest shape record and the model: the same
 * fields, the invalid data policy, the theme and the scheduler as concepts in the record
 * and by their notations in the model.
 */
export function preferencesFromRecord(data: PreferencesV5): StudyPreferences {
  return {
    newCardsPerDay: data.newCardsPerDay,
    maxReviewsPerDay: data.maxReviewsPerDay,
    dayBoundaryHour: data.dayBoundaryHour,
    answerScale: data.answerScale,
    developerMode: data.developerMode,
    invalidDataPolicy: policyOfConcept(data.invalidDataPolicy)!,
    theme: themeOfConcept(data.theme)!,
    scheduler: schedulerOfConcept(data.scheduler)!,
    desiredRetention: data.desiredRetention,
  };
}

export function preferencesToRecord(preferences: StudyPreferences): PreferencesV5 {
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
  };
}
