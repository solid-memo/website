// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { conceptOfScheduler } from "../../../concepts";
import type { MigrationStep } from "../step";

/**
 * Deck schedule format 2 states the scheduler whose due days it counts;
 * a schedule computed before there was a choice counts SM-2's, the only
 * scheduler there was.
 */
export const DECK_SCHEDULE_1_TO_2: MigrationStep<"deckSchedule", 1, 2> = {
  shape: "deckSchedule",
  from: 1,
  to: 2,
  up: (data) => ({ ...data, scheduler: conceptOfScheduler("sm2") }),
};
