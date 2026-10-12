// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Answer } from "./answer";
import type { Recall } from "./statistics";

/**
 * When and roughly how long a learner studies, from the times answers
 * were given: the log records no time spent on an answer, so the time is
 * estimated from the pauses between answers, and always said to be
 * about so much (docs/statistics.md). Pure; statisticsOf puts them with
 * the rest of the statistics.
 */

/** A pause between two answers of this long or more starts a new session. */
export const SESSION_GAP_MS = 5 * 60_000;

/** The longest a pause within a session counts for: one longer was mostly spent elsewhere. */
export const ANSWER_CAP_MS = 60_000;

/** One study day's estimated time. */
export interface DayStudyTime {
  /** "YYYY-MM-DD". */
  studyDay: string;
  /** The recalled answers counted. */
  answers: number;
  /** Sessions begun that day. */
  sessions: number;
  /** About how long was spent, in milliseconds. */
  ms: number;
}

/** About how long was spent on the recalled answers given (estimateStudyTime). */
export interface StudyTime {
  /** The recalled answers counted. */
  answers: number;
  sessions: number;
  /** About how long was spent in all, in milliseconds. */
  ms: number;
  /** The median time an answer took, in milliseconds; null while no session has two answers. */
  medianAnswerMs: number | null;
  /** Every study day with a recalled answer, oldest first. */
  days: DayStudyTime[];
}

/** The median of the values given; null of none. */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * About how long the recalled answers given took, in the order they were
 * given: a pause of SESSION_GAP_MS or more begins a new session, and
 * each answer after a session's first took the pause before it, up to
 * ANSWER_CAP_MS. A session's first answer has no pause before it, so it
 * took the median of its session's others, or, alone in its session,
 * the median of every session's. While no session has two answers there
 * is no median to go by, and no time is counted. A session counts on
 * the study day of its first answer, each answer on its own. Course
 * answers are left out: what a course shows before its questions takes
 * time no answer tells.
 */
export function estimateStudyTime(answers: readonly Answer[]): StudyTime {
  const recalled = answers
    .filter((answer) => (answer.mode ?? "recall") === "recall")
    .map((answer) => ({ answer, at: Date.parse(answer.answeredAt) }))
    .sort((a, b) => a.at - b.at);
  // Each session's answers, and the pause before each answer after its first.
  const sessions: { answers: Answer[]; pauses: number[] }[] = [];
  for (let i = 0; i < recalled.length; i++) {
    const { answer, at } = recalled[i]!;
    const pause = i === 0 ? Infinity : at - recalled[i - 1]!.at;
    if (pause >= SESSION_GAP_MS) sessions.push({ answers: [answer], pauses: [] });
    else {
      const session = sessions[sessions.length - 1]!;
      session.answers.push(answer);
      session.pauses.push(Math.min(pause, ANSWER_CAP_MS));
    }
  }
  const medianAnswerMs = medianOf(sessions.flatMap((session) => session.pauses));
  const byDay = new Map<string, DayStudyTime>();
  const dayOf = (studyDay: string) => {
    const day = byDay.get(studyDay) ?? { studyDay, answers: 0, sessions: 0, ms: 0 };
    byDay.set(studyDay, day);
    return day;
  };
  let ms = 0;
  for (const session of sessions) {
    dayOf(session.answers[0]!.studyDay).sessions += 1;
    // Without a median, every session is one answer: none is counted.
    const first = medianOf([...session.pauses]) ?? medianAnswerMs ?? 0;
    session.answers.forEach((answer, i) => {
      const took = i === 0 ? first : session.pauses[i - 1]!;
      const day = dayOf(answer.studyDay);
      day.answers += 1;
      day.ms += took;
      ms += took;
    });
  }
  return {
    answers: recalled.length,
    sessions: sessions.length,
    ms,
    medianAnswerMs,
    days: [...byDay.values()].sort((a, b) => a.studyDay.localeCompare(b.studyDay)),
  };
}

/** What is left to study today, and how answers have gone, for expectedTimeToday. */
export interface TodayLeft {
  /** Reviews still due today, within the daily limits. */
  reviews: number;
  /** New cards still to introduce today. */
  newCards: number;
  /** How well young cards were remembered: the share forgotten comes back the same day. */
  young: Recall;
  /** The median time an answer takes (StudyTime.medianAnswerMs). */
  medianAnswerMs: number | null;
}

/**
 * About how long what is left to study today will take, in milliseconds:
 * each review and new card left, and the reviews expected to be
 * forgotten (as many as young cards were, none before any young review),
 * which come back in the session once more, at the median time an
 * answer takes. null while that median is unknown.
 */
export function expectedTimeToday({
  reviews,
  newCards,
  young,
  medianAnswerMs,
}: TodayLeft): number | null {
  if (medianAnswerMs === null) return null;
  const forgotten = young.reviews === 0 ? 0 : 1 - young.recalled / young.reviews;
  return (reviews + newCards + forgotten * reviews) * medianAnswerMs;
}

/**
 * How many answers were given in each hour of the day, midnight's first:
 * by the hour it was where the statistics are read, in this device's
 * time zone, whatever it was where they were given.
 */
export function answersByHour(answers: readonly Answer[]): number[] {
  const hours = Array.from({ length: 24 }, () => 0);
  for (const answer of answers) hours[new Date(answer.answeredAt).getHours()]! += 1;
  return hours;
}
