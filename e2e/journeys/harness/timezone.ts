// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A time zone in which `now` is about noon, for the browser: the app's
 * study day turns over in the early morning (preferences' day boundary),
 * so a journey run near that hour in the runner's zone could see its
 * study split over two days. Fixed-offset zones, as the IANA names them:
 * Etc/GMT-2 is two hours ahead of UTC. UTC itself is "UTC": Firefox
 * refuses "Etc/GMT", "Etc/UTC" and "GMT".
 */
export function noonTimeZone(now: Date): string {
  return wholeHourZone(12 - now.getUTCHours());
}

/** The IANA's zone `ahead` whole hours ahead of UTC (behind, below 0), its sign inverted: Etc/GMT-2 is two hours ahead. */
function wholeHourZone(ahead: number): string {
  if (ahead === 0) return "UTC";
  return `Etc/GMT${ahead > 0 ? "-" : "+"}${Math.abs(ahead)}`;
}

/** The hours the IANA's whole-hour zones reach: Etc/GMT+12, 12 hours behind UTC, to Etc/GMT-14, 14 ahead. */
const MOST_BEHIND = -12;
const MOST_AHEAD = 14;
/** How far on the second of zonesAcrossTheDayTurn is: from before 3 a.m. to past 4. */
const HOURS_ON = 5;

/**
 * Two of the IANA's whole-hour zones, which every engine takes (WebKit
 * not ICU's to the minute, fixedOffsetZone): one in which `now` is
 * midnight or up to 2 a.m., `before` the study day's turn at 4
 * (preferences' day boundary), and one five hours on, past the turn: a
 * browser opened in the second is in the next study day, its clock
 * still right. Where midnight is too far ahead for a zone five hours
 * on, the zone furthest behind UTC is taken, where it is 1 or 2 a.m.
 */
export function zonesAcrossTheDayTurn(now: Date): { before: string; after: string } {
  // Hours ahead of UTC where it is midnight now, 0 to 23.
  const midnight = (24 - now.getUTCHours()) % 24;
  const before =
    midnight + HOURS_ON <= MOST_AHEAD ? midnight : Math.max(midnight - 24, MOST_BEHIND);
  return { before: wholeHourZone(before), after: wholeHourZone(before + HOURS_ON) };
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
