// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { derivedOnce } from "./frozen";

/**
 * Sums of a schedule's prompts by their due days (DeckSchedule's
 * dueByDay): the prompts due on a day, before a day, or by a day. The
 * due days are put in order and summed up once (derivedOnce), so that
 * each sum after that is a lookup, not a pass over every due day: the
 * decks that name the same documents share one schedule, and each asks
 * it for its own sums (forecastOf, overdueOf, studyCountsOf), and
 * whether it has any due day at all (hasDueDay).
 */

/** A schedule's due days in order, and the prompts due by each of them, that day included. */
interface Sums {
  days: readonly string[];
  through: readonly number[];
}

const sums = new WeakMap<Readonly<Record<string, number>>, Sums>();

function sumsOf(dueByDay: Readonly<Record<string, number>>): Sums {
  return derivedOnce(sums, dueByDay, (all) => {
    // In the order of `<`, as days are compared.
    const days = Object.keys(all).sort((a, b) => (a < b ? -1 : 1));
    let sum = 0;
    return { days, through: days.map((day) => (sum += all[day]!)) };
  });
}

/** The prompts due on `day`. */
export function dueOn(dueByDay: Readonly<Record<string, number>>, day: string): number {
  return Object.hasOwn(dueByDay, day) ? dueByDay[day]! : 0;
}

/** The prompts due before `day`, that day left out. */
export function dueBefore(dueByDay: Readonly<Record<string, number>>, day: string): number {
  const { days, through } = sumsOf(dueByDay);
  // The first due day that is not before `day`.
  let low = 0;
  let high = days.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (days[middle]! < day) low = middle + 1;
    else high = middle;
  }
  return low === 0 ? 0 : through[low - 1]!;
}

/** The prompts due by `day`, that day included. */
export function dueThrough(dueByDay: Readonly<Record<string, number>>, day: string): number {
  return dueBefore(dueByDay, day) + dueOn(dueByDay, day);
}

/** Whether any prompt has a due day: one was reviewed. */
export function hasDueDay(dueByDay: Readonly<Record<string, number>>): boolean {
  return sumsOf(dueByDay).days.length > 0;
}
