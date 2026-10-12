// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Answer } from "./answer";
import type { Recall } from "./statistics";

/**
 * When and roughly how long a learner studies. Since vocabulary 1.19 an
 * answer records how long it took (Answer.recallMillis, gradeMillis),
 * and from the first such answer on those times are counted; before,
 * the time is estimated from the pauses between answers. Either way it
 * is said to be about so much (docs/statistics.md). Pure; statisticsOf
 * puts them with the rest of the statistics.
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

/** The answers given since response times were recorded (StudyTime.recorded). */
export interface RecordedTime {
  /** The study day of the first answer with a recorded time. */
  since: string;
  /** The answers from then on whose time was recorded. */
  answers: number;
  /** Their time in all, in milliseconds. */
  ms: number;
  /** The answers from then on without a recorded time, which are not counted. */
  unknown: number;
}

/** About how long was spent on the answers given (estimateStudyTime). */
export interface StudyTime {
  /** The answers counted: recalled ones before times were recorded, then every one with a time. */
  answers: number;
  sessions: number;
  /** About how long was spent in all, recorded and estimated, in milliseconds. */
  ms: number;
  /**
   * The median time a recalled answer took, in milliseconds: of the
   * recorded times once there is one, else as estimated; null while
   * neither is known.
   */
  medianAnswerMs: number | null;
  /** Every study day with an answer counted, oldest first. */
  days: DayStudyTime[];
  /** Since response times were recorded; null while none is among the answers read. */
  recorded: RecordedTime | null;
}

/** The median of the values given; null of none. */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** An answer's recorded time, recalling and grading; undefined when it was not recorded in full. */
export function recordedTimeOf(answer: Answer): number | undefined {
  if (answer.recallMillis === undefined) return undefined;
  if (answer.mode === "multiple-choice") return answer.recallMillis;
  return answer.gradeMillis === undefined ? undefined : answer.recallMillis + answer.gradeMillis;
}

/** The answer given first of those with a recorded time; undefined of none. */
export function firstTimedOf(answers: readonly Answer[]): Answer | undefined {
  let first: Answer | undefined;
  for (const answer of answers) {
    if (answer.recallMillis === undefined) continue;
    if (first === undefined || Date.parse(answer.answeredAt) < Date.parse(first.answeredAt))
      first = answer;
  }
  return first;
}

/**
 * About how long the answers given took, in the order they were given,
 * from `firstTimed` on (by default the first of them with a recorded
 * time; statisticsOf passes the first of every answer read) by the times
 * recorded, before by the pauses between answers.
 *
 * From `firstTimed` on, every answer, in a course too, took the time it
 * recorded, recalling and grading (recordedTimeOf); one without is
 * unknown, and left out. Before, only recalled answers count: what a
 * course shows before its questions takes time no answer tells. Of
 * those, a pause of SESSION_GAP_MS or more begins a new session, and
 * each answer after a session's first took the pause before it, up to
 * ANSWER_CAP_MS. A session's first answer has no pause before it, so it
 * took the median of its session's others, or, alone in its session,
 * the median of every session's; while no session has two answers there
 * is no median to go by, and no time is counted. The answers counted,
 * recorded or estimated, make one run of sessions, by the same gap. A
 * session counts on the study day of its first answer, each answer on
 * its own.
 */
export function estimateStudyTime(
  answers: readonly Answer[],
  firstTimed: Answer | undefined = firstTimedOf(answers),
): StudyTime {
  const from = firstTimed === undefined ? Infinity : Date.parse(firstTimed.answeredAt);
  let unknown = 0;
  const counted: { answer: Answer; at: number; recorded?: number }[] = [];
  for (const answer of answers) {
    const at = Date.parse(answer.answeredAt);
    if (at < from) {
      if ((answer.mode ?? "recall") === "recall") counted.push({ answer, at });
      continue;
    }
    const recorded = recordedTimeOf(answer);
    if (recorded === undefined) unknown += 1;
    else counted.push({ answer, at, recorded });
  }
  counted.sort((a, b) => a.at - b.at);
  // Each session's answers with their recorded times, and the pause before each answer after its first.
  const sessions: { answers: Answer[]; recorded: (number | undefined)[]; pauses: number[] }[] = [];
  for (let i = 0; i < counted.length; i++) {
    const { answer, at, recorded } = counted[i]!;
    const pause = i === 0 ? Infinity : at - counted[i - 1]!.at;
    if (pause >= SESSION_GAP_MS)
      sessions.push({ answers: [answer], recorded: [recorded], pauses: [] });
    else {
      const session = sessions[sessions.length - 1]!;
      session.answers.push(answer);
      session.recorded.push(recorded);
      session.pauses.push(Math.min(pause, ANSWER_CAP_MS));
    }
  }
  // The pauses before the answers estimated, which their median is of.
  const estimatedPauses = (session: (typeof sessions)[number]) =>
    session.pauses.filter((_, i) => session.recorded[i + 1] === undefined);
  const estimatedMedian = medianOf(sessions.flatMap(estimatedPauses));
  const recordedRecalls = counted
    .filter(({ answer, recorded }) => recorded !== undefined && answer.mode !== "multiple-choice")
    .map(({ recorded }) => recorded!);
  const byDay = new Map<string, DayStudyTime>();
  const dayOf = (studyDay: string) => {
    const day = byDay.get(studyDay) ?? { studyDay, answers: 0, sessions: 0, ms: 0 };
    byDay.set(studyDay, day);
    return day;
  };
  let ms = 0;
  let recordedAnswers = 0;
  let recordedMs = 0;
  for (const session of sessions) {
    dayOf(session.answers[0]!.studyDay).sessions += 1;
    // Without a median, every session estimated is one answer: none is counted.
    const first = medianOf(estimatedPauses(session)) ?? estimatedMedian ?? 0;
    session.answers.forEach((answer, i) => {
      const recorded = session.recorded[i];
      const took = recorded ?? (i === 0 ? first : session.pauses[i - 1]!);
      if (recorded !== undefined) {
        recordedAnswers += 1;
        recordedMs += recorded;
      }
      const day = dayOf(answer.studyDay);
      day.answers += 1;
      day.ms += took;
      ms += took;
    });
  }
  return {
    answers: counted.length,
    sessions: sessions.length,
    ms,
    medianAnswerMs: medianOf(recordedRecalls) ?? estimatedMedian,
    days: [...byDay.values()].sort((a, b) => a.studyDay.localeCompare(b.studyDay)),
    recorded:
      firstTimed === undefined
        ? null
        : {
            since: firstTimed.studyDay,
            answers: recordedAnswers,
            ms: recordedMs,
            unknown,
          },
  };
}

/** Whether any time is counted: recorded, or estimated with a median to go by. */
export function hasStudyTime(time: StudyTime): boolean {
  return time.medianAnswerMs !== null || (time.recorded?.answers ?? 0) > 0;
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
