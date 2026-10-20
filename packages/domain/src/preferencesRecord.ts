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
import type { StudyPreferences } from "./preferences";
import type { PreferencesV6 } from "@solid-memo/vocab/types.generated";

/**
 * Preferences between their latest shape record and the model: the same
 * fields, the invalid data policy, the theme, the scheduler and the text
 * size as concepts in the record and by their notations in the model.
 * The palette is the concept's IRI in both, so one this version does not
 * know is kept as it is.
 */
export function preferencesFromRecord(data: PreferencesV6): StudyPreferences {
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
    schedulerInvitationDismissed: data.schedulerInvitationDismissed,
    palette: data.palette,
    textSize: textSizeOfConcept(data.textSize)!,
  };
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
