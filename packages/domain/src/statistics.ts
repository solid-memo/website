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
  daysBetween,
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
import {
  memoryOverTime,
  recallByInterval,
  recallByLateness,
  timeToMatureOf,
  weeklyRetention,
  type IntervalRecall,
  type LatenessRecall,
  type MemoryWeek,
  type TimeToMature,
  type WeekRetention,
} from "./memoryCurve";
import { answersByHour, estimateStudyTime, firstTimedOf, type StudyTime } from "./studyTime";
import { fragmentIdOf } from "./subjectUrl";

/**
 * Study statistics, computed from the answer log (domain/answer.ts):
 * activity by study day, streaks, totals, how well reviewed cards were
 * remembered, and how course questions were answered, with how the
 * learner answers and studies (studyPatterns.ts), and when and about
 * how long (studyTime.ts). Recall counts scored reviews only
 * (answerChain.ts): not first answers, repeats the same day, or course
 * answers, which are counted apart. Pure; the use case reads the months
 * it needs.
 */

/** What happened on one study day, as the digest's month summaries keep it (studyDigest.ts). */
export interface DayCounts {
  /** "YYYY-MM-DD". */
  studyDay: string;
  answers: number;
  /** Prompts introduced that day (answerChain.ts isIntroduction). */
  introduced: number;
  /** Scored reviews (answerChain.ts isScoredReview). */
  reviews: number;
  /** Scored reviews below grade 3 (answerChain.ts isLapse). */
  lapses: number;
}

/** What happened on one study day. */
export interface DayActivity extends DayCounts {
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

/** How many prompts were met and grew mature, of the answers given (promptGrowthOf). */
export interface PromptGrowth {
  /** Prompts introduced: with a first answer among those given. */
  introduced: number;
  /** Prompts that reached an interval of MATURE_INTERVAL_DAYS or more. */
  matured: number;
}

export interface Statistics {
  /** The study day the statistics run up to. */
  today: string;
  totals: { answers: number; studyDays: number; cards: number };
  /** The prompts met and grown mature. */
  prompts: PromptGrowth;
  /** Every study day of the range with answers, oldest first. */
  days: DayActivity[];
  /**
   * Every study day with answers of all the answers given, oldest first:
   * the range's and the weeks before it that the calendar and the
   * figures up to today look back over (statisticsOf).
   */
  recentDays: DayActivity[];
  streaks: Streaks;
  retention: Retention;
  quiz: Quiz;
  /** Every study month with answers, oldest first, with how well its reviews were remembered. */
  months: MonthRetention[];
  /** Every week with a scored review, oldest first, with how well its reviews were remembered. */
  weeks: WeekRetention[];
  /** Recall by the interval before the review, a bin each of INTERVAL_BOUNDS. */
  intervals: IntervalRecall[];
  /** Recall by how late the review was (approximate), a lateness each of LATENESSES. */
  lateness: LatenessRecall[];
  /**
   * Where the prompts stood at the end of each week of the range, from
   * every answer given up to then (approximate; memoryOverTime).
   */
  memory: MemoryWeek[];
  /** How long the prompts that grew mature in the range took, of those introduced in the answers given. */
  timeToMature: TimeToMature;
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
  /**
   * About how long the answers took: recorded since the first answer
   * read with a time, estimated before (estimateStudyTime).
   */
  studyTime: StudyTime;
  /** The answers given in each hour of the day, midnight's first, in this device's time zone. */
  hours: number[];
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
    // A run starts on a day without the one before; before 0100-01-04 the same day comes back.
    const before = shiftStudyDay(day, -1);
    if (before < day && studied.has(before)) continue;
    let run = 1;
    // Counted up to the days there are: past the year 9999 the same day comes back too.
    while (run < studied.size && studied.has(shiftStudyDay(day, run))) run += 1;
    longest = Math.max(longest, run);
  }
  let current = 0;
  let day = studied.has(today) ? today : shiftStudyDay(today, -1);
  while (current < studied.size && studied.has(day)) {
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

/**
 * How many distinct prompts of the index were introduced (a first answer
 * among them, a Studio "forget" not counting twice) and how many grew
 * mature (an answer that gave them an interval of MATURE_INTERVAL_DAYS
 * or more, however they were answered), each once, whatever came after.
 */
export function promptGrowthOf(index: ChainIndex): PromptGrowth {
  const growth: PromptGrowth = { introduced: 0, matured: 0 };
  for (const chain of index.chains.values()) {
    if (chain.some((answer) => answer.priorIntervalDays === undefined)) growth.introduced += 1;
    if (chain.some((answer) => answer.nextIntervalDays >= MATURE_INTERVAL_DAYS))
      growth.matured += 1;
  }
  return growth;
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

/**
 * Everything the statistics screens show, of the answers given (in any
 * order) up to `today`. Those from `since` on, when given, are the
 * range's: the totals, recall and the rest. The figures of the days up
 * to today are of every answer given, so a range shorter than they look
 * back over does not cut them short: the streaks, the days studied of
 * late, this week and month beside the last, the new cards beside the
 * reviews by week, and the days of `recentDays`; the answers before the
 * range also tell how late its reviews were, where its prompts stood
 * and how long they took to grow mature, and when times began to be
 * recorded: `firstTimed`, the first answer read with a recorded time,
 * which one deck's statistics take from every deck's answers (by
 * default the first of `allAnswers`).
 */
export function statisticsOf(
  allAnswers: readonly Answer[],
  today: string,
  since?: string,
  firstTimed: Answer | undefined = firstTimedOf(allAnswers),
): Statistics {
  const answers =
    since === undefined ? allAnswers : allAnswers.filter((answer) => answer.studyDay >= since);
  const index = chainIndexOf(answers);
  const days = dailyActivity(answers, index);
  // Every answer given: the figures up to today, and what came before the range for the ones of memory.
  const all = answers.length === allAnswers.length;
  const allIndex = all ? index : chainIndexOf(allAnswers);
  const recentDays = all ? days : dailyActivity(allAnswers, allIndex);
  return {
    today,
    totals: {
      answers: answers.length,
      studyDays: days.length,
      // A card is its deck's and its id: an upgrade moves a deck's cards into a new document.
      cards: new Set(answers.map((answer) => `${answer.deckUrl}\n${fragmentIdOf(answer.cardUrl)}`))
        .size,
    },
    prompts: promptGrowthOf(index),
    days,
    recentDays,
    streaks: streaksOf(
      recentDays.map((day) => day.studyDay),
      today,
    ),
    retention: retentionOf(answers, index),
    quiz: quizAccuracyOf(answers, index),
    months: monthlyRetention(answers, index),
    weeks: weeklyRetention(answers, index),
    intervals: recallByInterval(answers, index),
    lateness: recallByLateness(answers, allIndex),
    memory: memoryOverTime(allAnswers, allIndex, today, since),
    timeToMature: timeToMatureOf(allIndex, since),
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
    recentStudyDays: daysStudiedOf(recentDays, today),
    week: periodToDateOf(recentDays, today, "week"),
    month: periodToDateOf(recentDays, today, "month"),
    weekdays: weekdayRhythmOf(days, today),
    intake: intakeVsLoadOf(recentDays, today),
    studyTime: estimateStudyTime(answers, firstTimed),
    hours: answersByHour(answers),
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

/**
 * What todayOf and welcomeBackOf read of the statistics, which the today
 * strip's figures (studyDigest.ts todayFiguresOf) hold too.
 */
export interface StudyDayFigures {
  /** The study day the figures run up to. */
  today: string;
  /** Every study day with answers, oldest first. */
  days: readonly DayCounts[];
  streaks: Streaks;
  /** This week so far, beside the same days of last week. */
  week: PeriodToDate;
}

/** Today's study, or null while nothing is studied today. */
export function todayOf(statistics: StudyDayFigures): TodaySummary | null {
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

/** Where the streak stands before the day's first answer, for a word of welcome back. */
export interface WelcomeBack {
  /** Study days in a row up to yesterday; 0 once the streak has lapsed. */
  streak: number;
  /** The longest run of study days there has been. */
  longestStreak: number;
  /** Today's study day as a count of days, which picks the day's words: the next day's differ. */
  dayNumber: number;
}

/**
 * Where the streak stands while nothing is studied today, for a learner
 * who has studied before; null once today has an answer (todayOf says
 * what it came to), or when there is no study day to come back to.
 */
export function welcomeBackOf(statistics: StudyDayFigures): WelcomeBack | null {
  if (statistics.streaks.longest === 0) return null;
  if (statistics.days.some((activity) => activity.studyDay === statistics.today)) return null;
  return {
    streak: statistics.streaks.current,
    longestStreak: statistics.streaks.longest,
    dayNumber: daysBetween("1970-01-01", statistics.today),
  };
}
