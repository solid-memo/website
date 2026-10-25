// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { UseCases } from "@solid-memo/application/useCases";
import { makeSessionUseCasesFake } from "./fakes/session";
import { makeInstanceUseCasesFake } from "./fakes/instances";
import { makePreferenceUseCasesFake } from "./fakes/preferences";
import { makeDeckUseCasesFake } from "./fakes/decks";
import { makeCardUseCasesFake } from "./fakes/cards";
import { makeLibraryUseCasesFake } from "./fakes/library";
import { makeMistakeReportUseCasesFake } from "./fakes/mistakeReports";
import { makeWhatsNewUseCasesFake } from "./fakes/whatsNew";
import { makeCourseUseCasesFake } from "./fakes/courses";
import { makeStudyUseCasesFake } from "./fakes/study";
import { makeStatisticsUseCasesFake } from "./fakes/statistics";
import { makeInstanceCheckUseCasesFake } from "./fakes/instanceChecks";
import { makeReleaseDraftUseCasesFake } from "./fakes/releaseDrafts";
import { makeReleasePublishingUseCasesFake } from "./fakes/releasePublishing";
import { makeInstanceGraphUseCasesFake } from "./fakes/instanceGraph";
import { makeTrialOpeningUseCasesFake } from "./fakes/trial";

/**
 * A complete UseCases fake: every slice's fake (test/fakes/), made in
 * one object, so each calls the others through it. Override the methods
 * a test cares about; a test of a screen that takes one slice can take
 * that slice's fake alone.
 */
export function makeUseCasesFake(overrides: Partial<UseCases> = {}): UseCases {
  const fake = {} as UseCases;
  makeSessionUseCasesFake({}, fake);
  makeInstanceUseCasesFake({}, fake);
  makePreferenceUseCasesFake({}, fake);
  makeDeckUseCasesFake({}, fake);
  makeCardUseCasesFake({}, fake);
  makeLibraryUseCasesFake({}, fake);
  makeMistakeReportUseCasesFake({}, fake);
  makeWhatsNewUseCasesFake({}, fake);
  makeCourseUseCasesFake({}, fake);
  makeStudyUseCasesFake({}, fake);
  makeStatisticsUseCasesFake({}, fake);
  makeInstanceCheckUseCasesFake({}, fake);
  makeReleaseDraftUseCasesFake({}, fake);
  makeReleasePublishingUseCasesFake({}, fake);
  makeInstanceGraphUseCasesFake({}, fake);
  makeTrialOpeningUseCasesFake({}, fake);
  return Object.assign(fake, overrides);
}
