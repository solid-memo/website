// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { LEECH_LAPSES, type LapseIndex } from "./cardHistory";
import { activeCardsOf, studyDirections, type Card, type DeckDirection } from "./deck";
import type { Scheduler } from "./fsrs";
import { reviewKeyOf, type DueState, type ReviewKey, type ReviewState } from "./review";
import { shiftStudyDay } from "./answer";
import { dueBefore, dueOn, dueThrough } from "./dueDays";
import type { DeckSchedule, StoredSchedule } from "./studyDigest";

/**
 * What the Studio's schedule screen shows of a deck (docs/studio.md): the
 * reviews to come, day by day; how its prompts' intervals and eases are
 * spread; and its leeches. Pure; the use case reads the documents.
 */

/** How many study days the forecast covers, today's included. */
export const FORECAST_DAYS = 30;

/** One study day of the forecast. */
export interface ForecastDay {
  /** "YYYY-MM-DD". */
  studyDay: string;
  /** Prompts that fall due that day; today's count every prompt due by today. */
  due: number;
  /** The reviews the daily cap lets through that day: what it holds back waits for the next. */
  reviews: number;
}

/**
 * The deck's schedule as the digest keeps it, while it holds: computed
 * from the very versions of the deck's documents read now (`versions`, a
 * null one never matches), with the deck's direction, the day boundary
 * and the scheduler in use, on a study day no later than `today`. Null
 * when it does not.
 */
export function freshSchedule(
  stored: StoredSchedule | undefined,
  versions: { cards: string | null; reviews: string | null },
  input: { direction: DeckDirection; dayBoundaryHour: number; scheduler: Scheduler; today: string },
): DeckSchedule | null {
  if (stored === undefined || versions.cards === null || versions.reviews === null) return null;
  const { schedule } = stored;
  const holds =
    stored.cardsVersion === versions.cards &&
    stored.reviewsVersion === versions.reviews &&
    schedule.direction === input.direction &&
    schedule.dayBoundaryHour === input.dayBoundaryHour &&
    schedule.scheduler === input.scheduler &&
    schedule.studyDay <= input.today;
  return holds ? schedule : null;
}

/**
 * The reviews of the `days` study days from `today` on, from the
 * prompts' due days (the digest's sm:dueOnDay): each day what falls due,
 * and what the cap of reviews a day lets through, the rest carried over
 * to the next day, as a learner who studies each day would meet them.
 * Today's cap is what is left of it after the reviews made today. A
 * paused deck (`pause`) lets none through before the day it resumes on,
 * or at all when it waits to be resumed (`resumesOn` null): what falls
 * due then waits for that day.
 */
export function forecastOf(
  schedule: DeckSchedule,
  input: {
    today: string;
    days: number;
    maxReviewsPerDay: number;
    pause?: { resumesOn: string | null };
  },
): ForecastDay[] {
  const { today, days, maxReviewsPerDay, pause } = input;
  const held = (day: string) =>
    pause !== undefined && (pause.resumesOn === null || day < pause.resumesOn);
  const reviewedToday = schedule.studyDay === today ? schedule.reviewedOnDay : 0;
  let waiting = 0;
  return Array.from({ length: days }, (_, offset) => {
    const studyDay = shiftStudyDay(today, offset);
    // Looked up, not summed of every due day (dueDays.ts): decks may share one schedule.
    const due =
      offset === 0 ? dueThrough(schedule.dueByDay, today) : dueOn(schedule.dueByDay, studyDay);
    const cap = held(studyDay)
      ? 0
      : offset === 0
        ? Math.max(0, maxReviewsPerDay - reviewedToday)
        : maxReviewsPerDay;
    const reviews = Math.min(waiting + due, cap);
    waiting += due - reviews;
    return { studyDay, due, reviews };
  });
}

/**
 * The prompts due before `today`, from the prompts' due days (the
 * digest's sm:dueOnDay): overdue now. forecastOf's first day counts them
 * with those due today.
 */
export function overdueOf(dueByDay: Readonly<Record<string, number>>, today: string): number {
  return dueBefore(dueByDay, today);
}

/**
 * How many study days after today the daily cap takes to let through
 * every review it holds back over a forecast (forecastOf): 0 when it holds
 * none back, the day after the last that ends with reviews waiting
 * otherwise; null when reviews still wait at the forecast's end. Of one
 * deck, whose cap it is: decks taken together take the latest.
 */
export function daysToClearOf(forecast: readonly ForecastDay[]): number | null {
  let waiting = 0;
  let last = -1;
  forecast.forEach((day, offset) => {
    waiting += day.due - day.reviews;
    if (waiting > 0) last = offset;
  });
  return last >= 0 && last === forecast.length - 1 ? null : last + 1;
}

/**
 * The review states the deck schedules: of its cards in use, in the
 * directions it studies, card by card, the last of each key. Found by
 * the states, not by the cards (activeCardsOf), so that decks which
 * share one cards document each take time by their own states.
 */
export function scheduledStates<T extends ReviewKey>(
  cards: readonly Card[],
  direction: DeckDirection,
  states: readonly T[],
): T[] {
  const { placeOf } = activeCardsOf(cards);
  const directions: readonly string[] = studyDirections(direction);
  const byKey = new Map(states.map((state) => [reviewKeyOf(state), state]));
  const placed: { state: T; at: number }[] = [];
  for (const state of byKey.values()) {
    const place = placeOf.get(state.cardId);
    const turn = directions.indexOf(state.direction);
    if (place !== undefined && turn >= 0)
      placed.push({ state, at: place * directions.length + turn });
  }
  return placed.sort((a, b) => a.at - b.at).map(({ state }) => state);
}

/** A bar of a histogram: the values from `from` up to, not including, `to` (none: no end), and how many there are. */
export interface Bin {
  from: number;
  to?: number;
  count: number;
}

/** How many values fall in each bin; `bounds`, ascending, start them. A value below the first counts in the first. */
function histogram(values: readonly number[], bounds: readonly number[]): Bin[] {
  const bins: Bin[] = bounds.map((from, i) => ({
    from,
    ...(i + 1 < bounds.length ? { to: bounds[i + 1] } : {}),
    count: 0,
  }));
  for (const value of values) {
    const above = bounds.filter((bound) => value >= bound).length;
    bins[Math.max(0, above - 1)]!.count += 1;
  }
  return bins;
}

/** Histograms of the same bounds (each deck's) taken together, bin by bin; none of none. */
export function mergeBins(list: readonly (readonly Bin[])[]): Bin[] {
  const [first, ...rest] = list;
  if (first === undefined) return [];
  return first.map((bin, i) => ({
    ...bin,
    count: rest.reduce((sum, bins) => sum + bins[i]!.count, bin.count),
  }));
}

/** Where the intervals' bins start, in days: one day, a few, a week, two, a month, a quarter, half a year, a year and more. */
export const INTERVAL_BOUNDS: readonly number[] = [1, 2, 4, 8, 15, 31, 91, 181, 366];

/** Where the eases' bins start: SM-2's least, 1.3, then a bin each 0.2, the last from 2.7 up. */
export const EASE_BOUNDS: readonly number[] = [1.3, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7];

/** How the states' intervals are spread, in days (INTERVAL_BOUNDS). */
export function intervalHistogram(states: readonly Pick<DueState, "intervalDays">[]): Bin[] {
  return histogram(
    states.map((state) => state.intervalDays),
    INTERVAL_BOUNDS,
  );
}

/** How the states' eases are spread (EASE_BOUNDS); counted in hundredths, so 2.5 is never just below 2.5. */
export function easeHistogram(states: readonly ReviewState[]): Bin[] {
  const hundredths = (value: number) => Math.round(value * 100);
  return histogram(
    states.map((state) => hundredths(state.easeFactor)),
    EASE_BOUNDS.map(hundredths),
  ).map((bin) => ({
    ...bin,
    from: bin.from / 100,
    ...(bin.to === undefined ? {} : { to: bin.to / 100 }),
  }));
}

/** A card forgotten often, and how often. */
export interface Leech {
  /** The card's fragment id (Card.id), as lapseIndex keys it. */
  cardId: string;
  lapses: number;
}

/** The cards forgotten `minLapses` times or more (LEECH_LAPSES by default), the most forgotten first. */
export function leechesOf(
  index: LapseIndex,
  { minLapses = LEECH_LAPSES }: { minLapses?: number } = {},
): Leech[] {
  return [...index.lapses]
    .filter(([, lapses]) => lapses >= minLapses)
    .map(([cardId, lapses]) => ({ cardId, lapses }))
    .sort((a, b) => b.lapses - a.lapses || a.cardId.localeCompare(b.cardId));
}
