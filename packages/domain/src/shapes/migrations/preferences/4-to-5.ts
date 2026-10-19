// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { conceptOfScheduler } from "../../../concepts";
import { DEFAULT_DESIRED_RETENTION } from "../../../fsrs";
import type { MigrationStep } from "../step";

/**
 * Preferences format 5 states the scheduler, the desired retention and
 * whether the invitation to FSRS-6 was dismissed; preferences saved
 * before there was a choice schedule with SM-2, as they always did, keep
 * FSRS-6's default retention for a switch, and have not seen the
 * invitation yet.
 */
export const PREFERENCES_4_TO_5: MigrationStep<"preferences", 4, 5> = {
  shape: "preferences",
  from: 4,
  to: 5,
  up: (data) => ({
    ...data,
    scheduler: conceptOfScheduler("sm2"),
    desiredRetention: DEFAULT_DESIRED_RETENTION,
    schedulerInvitationDismissed: false,
  }),
};
