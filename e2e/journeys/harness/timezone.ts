// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A time zone in which `now` is about noon, for the browser: the app's
 * study day turns over in the early morning (preferences' day boundary),
 * so a journey run near that hour in the runner's zone could see its
 * study split over two days. Fixed-offset zones, as the IANA names them:
 * Etc/GMT-2 is two hours ahead of UTC.
 */
export function noonTimeZone(now: Date): string {
  const ahead = 12 - now.getUTCHours();
  if (ahead === 0) return "Etc/GMT";
  return `Etc/GMT${ahead > 0 ? "-" : "+"}${Math.abs(ahead)}`;
}

/** The most an answer may record of the device's offset from UTC, in minutes (sm:utcOffsetMinutes). */
const MOST_OFFSET = 14 * 60;
const MINUTES_A_DAY = 24 * 60;

/**
 * A zone `minutes` ahead of UTC (behind, below 0), as ICU names a fixed
 * offset ("GMT+05:30", "GMT-11:00"): Chromium takes any such zone, to the
 * minute, which the IANA's whole hours are not. Within the 14 hours either
 * way that an answer may record of the device's offset.
 */
export function fixedOffsetZone(minutes: number): string {
  if (!Number.isInteger(minutes) || Math.abs(minutes) > MOST_OFFSET)
    throw new RangeError(
      `No zone is ${minutes} minutes from UTC: at most ${MOST_OFFSET} either way.`,
    );
  const sign = minutes < 0 ? "-" : "+";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `GMT${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

/**
 * How many minutes ahead of UTC a zone is in which `now` is `hour`
 * o'clock (and as many seconds past it as `now` is past its minute): the
 * furthest behind such zone, from 14 hours behind UTC to under 10 ahead,
 * so that a zone up to 4 hours further on is one too (fixedOffsetZone). A
 * journey moves its study day on that way: from before the day's turn
 * (preferences' day boundary, 4 by default) to after it.
 */
export function offsetWhereItIs(now: Date, hour: number): number {
  const utc = now.getUTCHours() * 60 + now.getUTCMinutes();
  const ahead = (((hour * 60 - utc) % MINUTES_A_DAY) + MINUTES_A_DAY) % MINUTES_A_DAY;
  return ahead - MINUTES_A_DAY >= -MOST_OFFSET ? ahead - MINUTES_A_DAY : ahead;
}
