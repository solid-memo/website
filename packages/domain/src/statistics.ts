import { isRecalled, monthOfStudyDay, type Answer } from "./answer";
import { fragmentIdOf } from "./subjectUrl";

/**
 * Study statistics, computed from the answer log (domain/answer.ts):
 * activity by study day, streaks, totals, and how well reviewed cards
 * were remembered. Pure; the use case reads the months it needs.
 */

/** A prompt reviewed at an interval of this many days or more is mature; below, young. */
export const MATURE_INTERVAL_DAYS = 21;

/** What happened on one study day. */
export interface DayActivity {
  /** "YYYY-MM-DD". */
  studyDay: string;
  answers: number;
  /** Prompts answered for the first time: introduced that day. */
  introduced: number;
  /** Answers below grade 3: the card was forgotten. */
  forgotten: number;
}

/** Reviews of prompts already introduced, and how many of them were remembered. */
export interface Recall {
  reviews: number;
  recalled: number;
}

export interface Retention {
  /** Reviews at an interval below MATURE_INTERVAL_DAYS. */
  young: Recall;
  /** Reviews at an interval of MATURE_INTERVAL_DAYS or more. */
  mature: Recall;
}

/** How well the reviews of one study month were remembered; a month of first answers only has none. */
export interface MonthRetention {
  /** "YYYY-MM". */
  month: string;
  retention: Retention;
}

/** The prompts introduced up to and including one study day. */
export interface IntroducedTotal {
  /** "YYYY-MM-DD". */
  studyDay: string;
  introduced: number;
}

export interface Streaks {
  /** Study days in a row up to today, or up to yesterday while today is not studied yet. */
  current: number;
  longest: number;
}

export interface DeckStatistics {
  deckUrl: string;
  answers: number;
  lastStudyDay: string;
  retention: Retention;
}

export interface Statistics {
  /** The study day the statistics run up to. */
  today: string;
  totals: { answers: number; studyDays: number; cards: number };
  /** Every study day with answers, oldest first. */
  days: DayActivity[];
  streaks: Streaks;
  retention: Retention;
  /** Every study month with answers, oldest first, with how well its reviews were remembered. */
  months: MonthRetention[];
  /** Every deck answered in, most answers first. */
  decks: DeckStatistics[];
}

/** Every study day with answers, oldest first. */
export function dailyActivity(answers: readonly Answer[]): DayActivity[] {
  const byDay = new Map<string, DayActivity>();
  for (const answer of answers) {
    const day = byDay.get(answer.studyDay) ?? { studyDay: answer.studyDay, answers: 0, introduced: 0, forgotten: 0 };
    day.answers += 1;
    if (answer.priorIntervalDays === undefined) day.introduced += 1;
    if (!isRecalled(answer)) day.forgotten += 1;
    byDay.set(answer.studyDay, day);
  }
  return [...byDay.values()].sort((a, b) => a.studyDay.localeCompare(b.studyDay));
}

/** The study day `days` after (or before, when negative) another, by the calendar. */
export function shiftStudyDay(studyDay: string, days: number): string {
  const [year, month, day] = studyDay.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

/** Runs of consecutive study days: the one alive today, and the longest. */
export function streaksOf(studyDays: readonly string[], today: string): Streaks {
  const studied = new Set(studyDays);
  let longest = 0;
  for (const day of studied) {
    if (studied.has(shiftStudyDay(day, -1))) continue;
    let run = 1;
    while (studied.has(shiftStudyDay(day, run))) run += 1;
    longest = Math.max(longest, run);
  }
  let current = 0;
  let day = studied.has(today) ? today : shiftStudyDay(today, -1);
  while (studied.has(day)) {
    current += 1;
    day = shiftStudyDay(day, -1);
  }
  return { current, longest };
}

/** How well reviewed prompts were remembered, young and mature apart; first answers are not reviews. */
export function retentionOf(answers: readonly Answer[]): Retention {
  const retention: Retention = { young: { reviews: 0, recalled: 0 }, mature: { reviews: 0, recalled: 0 } };
  for (const answer of answers) {
    if (answer.priorIntervalDays === undefined) continue;
    const group = answer.priorIntervalDays >= MATURE_INTERVAL_DAYS ? retention.mature : retention.young;
    group.reviews += 1;
    if (isRecalled(answer)) group.recalled += 1;
  }
  return retention;
}

/**
 * The running total of prompts introduced, by study day, of the days
 * given (oldest first): first answers within the months read, those of
 * removed decks and retired cards included.
 */
export function introducedOverTime(days: readonly DayActivity[]): IntroducedTotal[] {
  let introduced = 0;
  return days.map((day) => {
    introduced += day.introduced;
    return { studyDay: day.studyDay, introduced };
  });
}

/** How well reviews were remembered, month by month, oldest first; every month with answers has an entry. */
export function monthlyRetention(answers: readonly Answer[]): MonthRetention[] {
  const byMonth = new Map<string, Answer[]>();
  for (const answer of answers) {
    const month = monthOfStudyDay(answer.studyDay);
    byMonth.set(month, [...(byMonth.get(month) ?? []), answer]);
  }
  return [...byMonth]
    .map(([month, monthAnswers]) => ({ month, retention: retentionOf(monthAnswers) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Everything the statistics screens show, of the answers given (in any order) up to `today`. */
export function statisticsOf(answers: readonly Answer[], today: string): Statistics {
  const days = dailyActivity(answers);
  const byDeck = new Map<string, Answer[]>();
  for (const answer of answers) byDeck.set(answer.deckUrl, [...(byDeck.get(answer.deckUrl) ?? []), answer]);
  return {
    today,
    totals: {
      answers: answers.length,
      studyDays: days.length,
      // A card is its deck's and its id: an upgrade moves a deck's cards into a new document.
      cards: new Set(answers.map((answer) => `${answer.deckUrl}\n${fragmentIdOf(answer.cardUrl)}`)).size,
    },
    days,
    streaks: streaksOf(
      days.map((day) => day.studyDay),
      today,
    ),
    retention: retentionOf(answers),
    months: monthlyRetention(answers),
    decks: [...byDeck]
      .map(([deckUrl, deckAnswers]) => ({
        deckUrl,
        answers: deckAnswers.length,
        lastStudyDay: deckAnswers.map((answer) => answer.studyDay).sort().at(-1)!,
        retention: retentionOf(deckAnswers),
      }))
      .sort((a, b) => b.answers - a.answers || a.deckUrl.localeCompare(b.deckUrl)),
  };
}

/** What today's study came to, for a word of encouragement after it. */
export interface TodaySummary {
  answers: number;
  /** Cards met for the first time today. */
  introduced: number;
  /** Answers today that remembered the card. */
  recalled: number;
  /** Study days in a row, today included. */
  streak: number;
  /** The longest run of study days there has been, today's included. */
  longestStreak: number;
}

/** Today's study, or null while nothing is studied today. */
export function todayOf(statistics: Statistics): TodaySummary | null {
  const day = statistics.days.find((activity) => activity.studyDay === statistics.today);
  if (day === undefined) return null;
  return {
    answers: day.answers,
    introduced: day.introduced,
    recalled: day.answers - day.forgotten,
    streak: statistics.streaks.current,
    longestStreak: statistics.streaks.longest,
  };
}

