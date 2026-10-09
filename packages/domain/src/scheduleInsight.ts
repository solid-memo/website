import { LEECH_LAPSES, type LapseIndex } from "./cardHistory";
import { activeCards, studyDirections, type Card, type DeckDirection } from "./deck";
import { reviewKeyOf, type ReviewState } from "./review";
import { shiftStudyDay } from "./statistics";
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
 * null one never matches), with the deck's direction and the day
 * boundary, on a study day no later than `today`. Null when it does not.
 */
export function freshSchedule(
  stored: StoredSchedule | undefined,
  versions: { cards: string | null; reviews: string | null },
  input: { direction: DeckDirection; dayBoundaryHour: number; today: string },
): DeckSchedule | null {
  if (stored === undefined || versions.cards === null || versions.reviews === null) return null;
  const { schedule } = stored;
  const holds =
    stored.cardsVersion === versions.cards &&
    stored.reviewsVersion === versions.reviews &&
    schedule.direction === input.direction &&
    schedule.dayBoundaryHour === input.dayBoundaryHour &&
    schedule.studyDay <= input.today;
  return holds ? schedule : null;
}

/**
 * The reviews of the `days` study days from `today` on, from the
 * prompts' due days (the digest's sm:dueOnDay): each day what falls due,
 * and what the cap of reviews a day lets through, the rest carried over
 * to the next day, as a learner who studies each day would meet them.
 * Today's cap is what is left of it after the reviews made today.
 */
export function forecastOf(
  schedule: DeckSchedule,
  input: { today: string; days: number; maxReviewsPerDay: number },
): ForecastDay[] {
  const { today, days, maxReviewsPerDay } = input;
  const reviewedToday = schedule.studyDay === today ? schedule.reviewedOnDay : 0;
  let waiting = 0;
  return Array.from({ length: days }, (_, offset) => {
    const studyDay = shiftStudyDay(today, offset);
    const due = Object.entries(schedule.dueByDay)
      .filter(([day]) => (offset === 0 ? day <= today : day === studyDay))
      .reduce((sum, [, count]) => sum + count, 0);
    const cap = offset === 0 ? Math.max(0, maxReviewsPerDay - reviewedToday) : maxReviewsPerDay;
    const reviews = Math.min(waiting + due, cap);
    waiting += due - reviews;
    return { studyDay, due, reviews };
  });
}

/** The review states the deck schedules: of its cards in use, in the directions it studies. */
export function scheduledStates(cards: readonly Card[], direction: DeckDirection, states: readonly ReviewState[]): ReviewState[] {
  const byKey = new Map(states.map((state) => [reviewKeyOf(state), state]));
  return activeCards(cards).flatMap((card) =>
    studyDirections(direction).flatMap((each) => byKey.get(reviewKeyOf({ cardId: card.id, direction: each })) ?? []),
  );
}

/** A bar of a histogram: the values from `from` up to, not including, `to` (none: no end), and how many there are. */
export interface Bin {
  from: number;
  to?: number;
  count: number;
}

/** How many values fall in each bin; `bounds`, ascending, start them. A value below the first counts in the first. */
function histogram(values: readonly number[], bounds: readonly number[]): Bin[] {
  const bins: Bin[] = bounds.map((from, i) => ({ from, ...(i + 1 < bounds.length ? { to: bounds[i + 1] } : {}), count: 0 }));
  for (const value of values) {
    const above = bounds.filter((bound) => value >= bound).length;
    bins[Math.max(0, above - 1)]!.count += 1;
  }
  return bins;
}

/** Where the intervals' bins start, in days: one day, a few, a week, two, a month, a quarter, half a year, a year and more. */
export const INTERVAL_BOUNDS: readonly number[] = [1, 2, 4, 8, 15, 31, 91, 181, 366];

/** Where the eases' bins start: SM-2's least, 1.3, then a bin each 0.2, the last from 2.7 up. */
export const EASE_BOUNDS: readonly number[] = [1.3, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7];

/** How the states' intervals are spread, in days (INTERVAL_BOUNDS). */
export function intervalHistogram(states: readonly ReviewState[]): Bin[] {
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
  ).map((bin) => ({ ...bin, from: bin.from / 100, ...(bin.to === undefined ? {} : { to: bin.to / 100 }) }));
}

/** A card forgotten often, and how often. */
export interface Leech {
  cardUrl: string;
  lapses: number;
}

/** The cards forgotten `minLapses` times or more (LEECH_LAPSES by default), the most forgotten first. */
export function leechesOf(index: LapseIndex, { minLapses = LEECH_LAPSES }: { minLapses?: number } = {}): Leech[] {
  return [...index.lapses]
    .filter(([, lapses]) => lapses >= minLapses)
    .map(([cardUrl, lapses]) => ({ cardUrl, lapses }))
    .sort((a, b) => b.lapses - a.lapses || a.cardUrl.localeCompare(b.cardUrl));
}
