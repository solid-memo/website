// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { conceptOfScheduler } from "../../../concepts";
import { DEFAULT_DESIRED_RETENTION } from "../../../fsrs";
import type { MigrationStep } from "../step";

/**
 * Preferences format 5 states the scheduler and the desired retention;
 * preferences saved before there was a choice schedule with SM-2, as
 * they always did, and keep FSRS-6's default retention for a switch.
 */
export const PREFERENCES_4_TO_5: MigrationStep<"preferences", 4, 5> = {
  shape: "preferences",
  from: 4,
  to: 5,
  up: (data) => ({
    ...data,
    scheduler: conceptOfScheduler("sm2"),
    desiredRetention: DEFAULT_DESIRED_RETENTION,
  }),
};
