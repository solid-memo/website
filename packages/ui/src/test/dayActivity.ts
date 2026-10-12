// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DayActivity } from "@solid-memo/domain/statistics";

/** A day's activity from its answers, new cards, lapses and repeats; the rest are reviews. */
export const day = (
  studyDay: string,
  answers: number,
  introduced: number,
  lapses: number,
  repeats = 0,
) => ({
  studyDay,
  answers,
  introduced,
  reviews: answers - introduced - repeats,
  lapses,
  repeats,
});

/** Three days of September 2026, the busiest first. */
export const days: DayActivity[] = [
  day("2026-09-14", 40, 10, 4),
  day("2026-09-20", 10, 0, 1),
  day("2026-09-21", 1, 1, 0),
];
