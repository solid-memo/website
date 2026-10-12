// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  isRecalled,
  MATURE_INTERVAL_DAYS,
  monthOfStudyDay,
  shiftStudyDay,
  type Answer,
} from "./answer";
import {
  chainIndexOf,
  isIntroduction,
  isLapse,
  isRepeat,
  isScoredReview,
  type ChainIndex,
} from "./answerChain";
import {
  daysStudiedOf,
  firstTrySuccessOf,
  gradeGroupsOf,
  intakeVsLoadOf,
  periodToDateOf,
  retentionByDirection,
  weekdayRhythmOf,
  type AnswerButtons,
  type DirectionRecall,
  type FirstTry,
  type PeriodToDate,
  type WeekdayRhythm,
  type WeekLoad,
} from "./studyPatterns";
import { fragmentIdOf } from "./subjectUrl";

/**
 * Study statistics, computed from the answer log (domain/answer.ts):
 * activity by study day, streaks, totals, how well reviewed cards were
 * remembered, and how course questions were answered, with how the
 * learner answers and studies (studyPatterns.ts). Recall counts
 * scored reviews only (answerChain.ts): not first answers, repeats the
 * same day, or course answers, which are counted apart. Pure; the use
 * case reads the months it needs.
 */

/** What happened on one study day. */
export interface DayActivity {
  /** "YYYY-MM-DD". */
  studyDay: string;
  answers: number;
  /** Prompts introduced that day (answerChain.ts isIntroduction). */
  introduced: number;
  /** Scored reviews (answerChain.ts isScoredReview). */
  reviews: number;
  /** Scored reviews below grade 3 (answerChain.ts isLapse). */
  lapses: number;
  /** Answers that repeat one to the same prompt that day. */
  repeats: number;
}

/** Scored reviews (answerChain.ts isScoredReview), and how many of them were remembered. */
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

/**
 * How well the reviews of one study month were remembered (a month of
 * first answers only has none), and its first answers.
 */
export interface MonthRetention {
  /** "YYYY-MM". */
  month: string;
  retention: Retention;
  firstTry: FirstTry;
}

/** The prompts introduced up to and including one study day. */
export interface IntroducedTotal {
  /** "YYYY-MM-DD". */
  studyDay: string;
  introduced: number;
}

/**
 * Course questions answered, and how many of them right: the first answer
 * to a prompt each day, chosen among options. Practice answers, and right
 * ones to a card already graded that day, are not logged, so this is not
 * every answer given in a course.
 */
export interface Quiz {
  answers: number;
  right: number;
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
  /** Prompts introduced: first answers. */
  introduced: number;
  /** Scored reviews below grade 3. */
  lapses: number;
  quiz: Quiz;
  firstTry: FirstTry;
  /** Recall in each direction with a review (studyPatterns.ts retentionByDirection). */
  directions: DirectionRecall[];
}

export interface Statistics {
  /** The study day the statistics run up to. */
  today: string;
  totals: { answers: number; studyDays: number; cards: number };
  /** Every study day with answers, oldest first. */
  days: DayActivity[];
  streaks: Streaks;
  retention: Retention;
  quiz: Quiz;
  /** Every study month with answers, oldest first, with how well its reviews were remembered. */
  months: MonthRetention[];
  /** Every deck answered in, most answers first. */
  decks: DeckStatistics[];
  /** The answer buttons pressed. */
  buttons: AnswerButtons;
  firstTry: FirstTry;
  /** Recall in each direction with a review. */
  directions: DirectionRecall[];
  /** How many of the last RECENT_DAYS study days were studied. */
  recentStudyDays: number;
  /** This week so far, beside the same days of last week. */
  week: PeriodToDate;
  /** This month so far, beside the same days of last month. */
  month: PeriodToDate;
  /** Each weekday's study, Monday first. */
  weekdays: WeekdayRhythm[];
  /** The new cards and the reviews of each of the last INTAKE_WEEKS weeks. */
  intake: WeekLoad[];
}

/** Every study day with answers, oldest first; `index` holds the answers' chains. */
export function dailyActivity(answers: readonly Answer[], index: ChainIndex): DayActivity[] {
  const byDay = new Map<string, DayActivity>();
  for (const answer of answers) {
    const day = byDay.get(answer.studyDay) ?? {
      studyDay: answer.studyDay,
      answers: 0,
      introduced: 0,
      reviews: 0,
      lapses: 0,
      repeats: 0,
    };
    day.answers += 1;
    if (isIntroduction(answer, index)) day.introduced += 1;
    if (isScoredReview(answer, index)) day.reviews += 1;
    if (isLapse(answer, index)) day.lapses += 1;
    if (isRepeat(answer, index)) day.repeats += 1;
    byDay.set(answer.studyDay, day);
  }
  return [...byDay.values()].sort((a, b) => a.studyDay.localeCompare(b.studyDay));
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

/**
 * How well reviewed prompts were remembered, young and mature apart, by
 * prior interval: scored reviews only, of the answers given, whose chains
 * `index` holds.
 */
export function retentionOf(answers: readonly Answer[], index: ChainIndex): Retention {
  const retention: Retention = {
    young: { reviews: 0, recalled: 0 },
    mature: { reviews: 0, recalled: 0 },
  };
  for (const answer of answers) {
    if (!isScoredReview(answer, index)) continue;
    const group =
      answer.priorIntervalDays! >= MATURE_INTERVAL_DAYS ? retention.mature : retention.young;
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

/** Course questions answered and answered right, of the answers given, whose chains `index` holds. */
export function quizAccuracyOf(answers: readonly Answer[], index: ChainIndex): Quiz {
  const quiz: Quiz = { answers: 0, right: 0 };
  for (const answer of answers) {
    if (answer.mode !== "multiple-choice" || isRepeat(answer, index)) continue;
    quiz.answers += 1;
    if (isRecalled(answer)) quiz.right += 1;
  }
  return quiz;
}

/** The answers given, grouped by `key`, each group filled in place. */
function groupBy(
  answers: readonly Answer[],
  key: (answer: Answer) => string,
): Map<string, Answer[]> {
  const groups = new Map<string, Answer[]>();
  for (const answer of answers) {
    const group = groups.get(key(answer));
    if (group === undefined) groups.set(key(answer), [answer]);
    else group.push(answer);
  }
  return groups;
}

/**
 * How well reviews were remembered, month by month, oldest first; every
 * month with answers has an entry. `index` holds the answers' chains.
 */
export function monthlyRetention(answers: readonly Answer[], index: ChainIndex): MonthRetention[] {
  return [...groupBy(answers, (answer) => monthOfStudyDay(answer.studyDay))]
    .map(([month, monthAnswers]) => ({
      month,
      retention: retentionOf(monthAnswers, index),
      firstTry: firstTrySuccessOf(monthAnswers, index),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Everything the statistics screens show, of the answers given (in any order) up to `today`. */
export function statisticsOf(answers: readonly Answer[], today: string): Statistics {
  const index = chainIndexOf(answers);
  const days = dailyActivity(answers, index);
  return {
    today,
    totals: {
      answers: answers.length,
      studyDays: days.length,
      // A card is its deck's and its id: an upgrade moves a deck's cards into a new document.
      cards: new Set(answers.map((answer) => `${answer.deckUrl}\n${fragmentIdOf(answer.cardUrl)}`))
        .size,
    },
    days,
    streaks: streaksOf(
      days.map((day) => day.studyDay),
      today,
    ),
    retention: retentionOf(answers, index),
    quiz: quizAccuracyOf(answers, index),
    months: monthlyRetention(answers, index),
    decks: [...groupBy(answers, (answer) => answer.deckUrl)]
      .map(([deckUrl, deckAnswers]) => {
        const retention = retentionOf(deckAnswers, index);
        return {
          deckUrl,
          answers: deckAnswers.length,
          lastStudyDay: deckAnswers.reduce(
            (last, answer) => (answer.studyDay > last ? answer.studyDay : last),
            deckAnswers[0]!.studyDay,
          ),
          retention,
          introduced: deckAnswers.filter((answer) => isIntroduction(answer, index)).length,
          lapses:
            retention.young.reviews -
            retention.young.recalled +
            retention.mature.reviews -
            retention.mature.recalled,
          quiz: quizAccuracyOf(deckAnswers, index),
          firstTry: firstTrySuccessOf(deckAnswers, index),
          directions: retentionByDirection(deckAnswers, index),
        };
      })
      .sort((a, b) => b.answers - a.answers || a.deckUrl.localeCompare(b.deckUrl)),
    buttons: gradeGroupsOf(answers, index),
    firstTry: firstTrySuccessOf(answers, index),
    directions: retentionByDirection(answers, index),
    recentStudyDays: daysStudiedOf(days, today),
    week: periodToDateOf(days, today, "week"),
    month: periodToDateOf(days, today, "month"),
    weekdays: weekdayRhythmOf(days, today),
    intake: intakeVsLoadOf(days, today),
  };
}

/** What today's study came to, for a word of encouragement after it. */
export interface TodaySummary {
  answers: number;
  /** Cards met for the first time today. */
  introduced: number;
  /** Today's scored reviews, and how many were remembered: not first answers, repeats or course answers. */
  recall: Recall;
  /** Study days in a row, today included. */
  streak: number;
  /** The longest run of study days there has been, today's included. */
  longestStreak: number;
  /** This week's answers so far, and those of the same days last week. */
  week: { answers: number; previous: number };
}

/** Today's study, or null while nothing is studied today. */
export function todayOf(statistics: Statistics): TodaySummary | null {
  const day = statistics.days.find((activity) => activity.studyDay === statistics.today);
  if (day === undefined) return null;
  return {
    answers: day.answers,
    introduced: day.introduced,
    recall: { reviews: day.reviews, recalled: day.reviews - day.lapses },
    streak: statistics.streaks.current,
    longestStreak: statistics.streaks.longest,
    week: {
      answers: statistics.week.current.answers,
      previous: statistics.week.previous.answers,
    },
  };
}
