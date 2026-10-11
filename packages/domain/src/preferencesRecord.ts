// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { conceptOfPolicy, conceptOfTheme, policyOfConcept, themeOfConcept } from "./concepts";
import type { StudyPreferences } from "./preferences";
import type { PreferencesV4 } from "@solid-memo/vocab/types.generated";

/**
 * Preferences between their latest shape record and the model: the same
 * fields, the invalid data policy and the theme as concepts in the record
 * and by their notations in the model.
 */
export function preferencesFromRecord(data: PreferencesV4): StudyPreferences {
  return {
    newCardsPerDay: data.newCardsPerDay,
    maxReviewsPerDay: data.maxReviewsPerDay,
    dayBoundaryHour: data.dayBoundaryHour,
    answerScale: data.answerScale,
    developerMode: data.developerMode,
    invalidDataPolicy: policyOfConcept(data.invalidDataPolicy)!,
    theme: themeOfConcept(data.theme)!,
  };
}

export function preferencesToRecord(preferences: StudyPreferences): PreferencesV4 {
  return {
    newCardsPerDay: preferences.newCardsPerDay,
    maxReviewsPerDay: preferences.maxReviewsPerDay,
    dayBoundaryHour: preferences.dayBoundaryHour,
    answerScale: preferences.answerScale,
    developerMode: preferences.developerMode,
    invalidDataPolicy: conceptOfPolicy(preferences.invalidDataPolicy),
    theme: conceptOfTheme(preferences.theme),
  };
}
