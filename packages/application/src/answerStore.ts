// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import type { Deck, StudyDirection } from "@solid-memo/domain/deck";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import type {
  DueState,
  FsrsState,
  ReviewQuality,
  ReviewState,
  ReviewStates,
} from "@solid-memo/domain/review";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { effectiveStates } from "@solid-memo/domain/fsrs";
import { gradePrompt, type Scheduling } from "@solid-memo/domain/grading";
import {
  answerIdOf,
  isCountableDay,
  monthOfStudyDay,
  recordedResponseTimes,
  shiftStudyDay,
  utcOffsetMinutesAt,
  type Answer,
  type AnswerMode,
  type ResponseTimes,
} from "@solid-memo/domain/answer";
import type { ReviewStateRepository, AnswerLog } from "./ports";
import type { GradeBasis, RecordedReview } from "./study";
import type { PreferenceStore } from "./preferenceStore";

/** What sets each prompt's due day, by the scheduler the preferences name (effectiveStates). */
export function dueStatesOf(
  states: ReviewStates,
  prefs: Pick<StudyPreferences, "scheduler" | "dayBoundaryHour">,
) {
  return effectiveStates(states.sm2, states.fsrs, prefs.scheduler, prefs.dayBoundaryHour);
}

/** What sets one prompt's due day, of its SM-2 state and its FSRS-6 state (null or absent: none). */
export function promptDueOf(
  sm2: ReviewState,
  fsrs: FsrsState | null | undefined,
  prefs: Pick<StudyPreferences, "scheduler" | "dayBoundaryHour">,
): DueState {
  return dueStatesOf({ sm2: [sm2], fsrs: fsrs == null ? [] : [fsrs] }, prefs)[0]!;
}

/**
 * What the instance grades and schedules with: the scheduler its
 * preferences name, the retention FSRS-6 aims at and the day boundary.
 */
function schedulingOf(prefs: StudyPreferences): Scheduling {
  return {
    scheduler: prefs.scheduler,
    desiredRetention: prefs.desiredRetention,
    dayBoundaryHour: prefs.dayBoundaryHour,
  };
}

/**
 * The most months of the answer log read at once: a log of many months
 * is not all asked for together (as instanceGraph's READS_AT_ONCE).
 */
const MONTH_READS_AT_ONCE = 6;

/**
 * The last month of the answer log a read takes in, of the study day
 * `today`: no answer counts after tomorrow, and one of tomorrow may be
 * in the next day's month's document (isOfStudyMonth). The log may list
 * later months, but they hold nothing to read.
 */
export function lastLogMonthOf(today: string): string {
  return monthOfStudyDay(shiftStudyDay(today, 2));
}

/**
 * The answer log as the use cases share it: each answer graded queued
 * for the log, added after its review is saved, and each month read
 * kept with its version, read again only once it changed.
 */
export function createAnswerStore({
  answerLog,
  reviewStateRepository,
  preferenceStore,
  newId,
  now,
}: {
  answerLog: AnswerLog;
  reviewStateRepository: ReviewStateRepository;
  preferenceStore: Pick<PreferenceStore, "get">;
  newId: () => string;
  /** The time, for the last month of the log taken in (lastLogMonthOf). */
  now: () => Date;
}) {
  /**
   * Answers given but not yet in the log, by instance, oldest first, and
   * each instance's chain of adding them. An answer is added after its
   * review is saved, without holding up study; one that fails to be
   * added waits here, and the ones of its instance after it with it,
   * until that instance's next answer, or something that reads or
   * changes its log (flush, loadAll, removeDay), tries again. Each
   * instance's answers wait only for its own: one whose log refuses or
   * never answers holds up no other's, and an add that gets no answer
   * in time fails (AnswerLog.append). An answer the write check refuses
   * (dataNotConforming) would be refused on every try, so it alone is
   * set aside, and those after it go on.
   */
  const queues = new Map<string, { unlogged: Answer[]; logging: Promise<void> }>();
  function queueOf(instanceUrl: string) {
    let queue = queues.get(instanceUrl);
    if (queue === undefined) {
      queue = { unlogged: [], logging: Promise.resolve() };
      queues.set(instanceUrl, queue);
    }
    return queue;
  }
  function logInstance(instanceUrl: string): Promise<void> {
    const queue = queueOf(instanceUrl);
    queue.logging = queue.logging.then(async () => {
      while (queue.unlogged.length > 0) {
        try {
          await answerLog.append(instanceUrl, queue.unlogged[0]!);
          logWrites += 1;
        } catch (error) {
          if (!(error instanceof AppError && error.code === "dataNotConforming")) return;
        }
        queue.unlogged.shift();
      }
    });
    return queue.logging;
  }
  /** Each instance's answer log as last read, by month: its answers, and the version they were read at. */
  const answerMonths = new Map<string, Map<string, { version: string; answers: Answer[] }>>();
  /**
   * The reads of a month under way, by instance, month and the writes to
   * the logs made before they began (logWrites): a read begun before a
   * write may miss it, so only one begun since is shared.
   */
  const monthReads = new Map<string, Promise<Answer[]>>();
  let logWrites = 0;
  /**
   * A month's answers, read only when it changed since last read and
   * kept in `known` with its version; a read already under way since the
   * last write to the logs is shared.
   */
  function readLogMonth(
    instanceUrl: string,
    month: string,
    known: Map<string, { version: string; answers: Answer[] }>,
  ): Promise<Answer[]> {
    const key = `${instanceUrl}\n${month}\n${logWrites}`;
    const under = monthReads.get(key);
    if (under !== undefined) return under;
    const read = (async () => {
      const kept = known.get(month);
      const since = await answerLog.readMonthSince(instanceUrl, month, kept?.version);
      if (since.unchanged) return kept!.answers;
      if (since.version === null) known.delete(month);
      else known.set(month, { version: since.version, answers: since.value });
      return since.value;
    })().finally(() => monthReads.delete(key));
    monthReads.set(key, read);
    return read;
  }
  /**
   * The answers of the log's months that `wanted` keeps, of `listed` (every
   * month the log has): each month read only when it changed since last
   * read, and kept with its version, a few at a time (MONTH_READS_AT_ONCE).
   * What is kept is added to, never replaced, so a read of some months
   * and one of all do not undo each other; a month no longer listed is dropped. A month already being
   * read since the last write to the logs is not read twice: the
   * statistics and the cards' progress ask at once.
   */
  async function readLogMonths(
    instanceUrl: string,
    listed: readonly string[],
    wanted: (month: string) => boolean,
  ): Promise<Answer[]> {
    const known =
      answerMonths.get(instanceUrl) ?? new Map<string, { version: string; answers: Answer[] }>();
    answerMonths.set(instanceUrl, known);
    const still = new Set(listed);
    for (const month of known.keys()) if (!still.has(month)) known.delete(month);
    const months = listed.filter(wanted);
    const answers: Answer[][] = [];
    let next = 0;
    const reader = async () => {
      while (next < months.length) {
        const at = next++;
        answers[at] = await readLogMonth(instanceUrl, months[at]!, known);
      }
    };
    await Promise.all(Array.from({ length: MONTH_READS_AT_ONCE }, reader));
    return answers.flat();
  }
  /**
   * The months of the log there can be an answer counted in at `at`
   * (now, unless given): of each it lists, up to the last that can hold
   * one (lastLogMonthOf), and of very many of those the newest
   * (MAX_LOG_MONTHS). A month listed later is never read, nor does it
   * push out one that is. The last month is that of the study day a day
   * boundary at midnight gives, the latest any boundary hour can, so
   * the instance's preferences are not read: a check of an instance
   * whose preferences cannot be read still lists its log.
   */
  async function logMonths(instanceUrl: string, at: Date = now()): Promise<string[]> {
    return answerLog.months(instanceUrl, lastLogMonthOf(studyDayOf(at, 0)));
  }
  /** Every answer of the log, of each of its months (logMonths). */
  async function loadAnswerLog(instanceUrl: string): Promise<Answer[]> {
    await logInstance(instanceUrl);
    return readLogMonths(instanceUrl, await logMonths(instanceUrl), () => true);
  }
  /**
   * Apply one grade to a prompt of the deck: transition its state (or the
   * initial one) by SM-2 (gradePrompt), persist it, and queue its answer
   * for the log, saying how it was given (`how`; a study session says
   * nothing: recall) and how long it took (`times`), the day it was due
   * and the device's offset from UTC. The grade is applied to the prompt's state as the
   * reviews document holds it when written (gradeReviewState), so it
   * builds on a grade made elsewhere meanwhile; the instance's preferences
   * are read unless `known` brings them. Resolves to the new state, with
   * what undoing the answer takes: the state the grade was applied to.
   */
  async function applyGrade(
    instanceUrl: string,
    deck: Deck,
    prompt: { cardId: string; cardUrl: string; direction: StudyDirection },
    quality: ReviewQuality,
    now: Date,
    how: { mode?: AnswerMode; chosenDistractor?: string; times: ResponseTimes },
    known?: GradeBasis,
  ): Promise<RecordedReview> {
    const key = { cardId: prompt.cardId, direction: prompt.direction };
    const prefs = known?.prefs ?? (await preferenceStore.get(instanceUrl));
    const scheduling = schedulingOf(prefs);
    const graded = await reviewStateRepository.gradeReviewState(deck, key, (current) =>
      gradePrompt(
        key,
        current,
        { grade: quality, ...(how.mode === undefined ? {} : { mode: how.mode }) },
        now,
        scheduling,
      ),
    );
    const { sm2: state, fsrs } = graded.state;
    const { sm2: current } = graded.current;
    // The log's intervals and due day are those of what set the due day: under FSRS-6, its state's.
    const prior = current === null ? null : promptDueOf(current, graded.current.fsrs, prefs);
    const next = promptDueOf(state, fsrs, prefs);
    const id = answerIdOf(state.lastReviewedAt, newId().slice(0, 8));
    const studyDay = studyDayOf(now, prefs.dayBoundaryHour);
    queueOf(instanceUrl).unlogged.push({
      id,
      deckUrl: deck.url,
      cardUrl: prompt.cardUrl,
      direction: prompt.direction,
      grade: quality,
      answeredAt: state.lastReviewedAt,
      studyDay,
      ...(prior === null ? {} : { priorIntervalDays: prior.intervalDays }),
      nextIntervalDays: next.intervalDays,
      ...(how.mode === undefined ? {} : { mode: how.mode }),
      ...(how.chosenDistractor === undefined ? {} : { chosenDistractor: how.chosenDistractor }),
      ...recordedResponseTimes(how.times),
      ...(prior === null || !isCountableDay(prior.due) ? {} : { priorDue: prior.due }),
      utcOffsetMinutes: utcOffsetMinutesAt(now),
    });
    void logInstance(instanceUrl);
    return {
      state,
      ...(fsrs === undefined ? {} : { fsrs }),
      undo: {
        key,
        before: current,
        ...(fsrs === undefined ? {} : { fsrs: { before: graded.current.fsrs } }),
        answer: { id, studyDay },
      },
    };
  }

  /**
   * Take an answer back (UseCases.undoReview): off the answers on their
   * way to the log, else out of it. The instance's answers being added
   * are waited for; any added later start only after this goes on.
   */
  async function withdraw(instanceUrl: string, answer: { id: string; studyDay: string }) {
    const { unlogged, logging } = queueOf(instanceUrl);
    await logging;
    const waiting = unlogged.findIndex((each) => each.id === answer.id);
    if (waiting === -1) {
      await answerLog.removeAnswer(instanceUrl, answer.studyDay, answer.id);
      logWrites += 1;
    } else {
      unlogged.splice(waiting, 1);
    }
  }

  /** Remove a deck's answers of a study day from the log, those of the instance still on their way first. */
  async function removeDay(instanceUrl: string, deckUrl: string, studyDay: string) {
    await logInstance(instanceUrl);
    await answerLog.removeDay(instanceUrl, deckUrl, studyDay);
    logWrites += 1;
  }

  /** Add answers to the instance's log at once. */
  async function appendAll(instanceUrl: string, answers: readonly Answer[]) {
    await answerLog.appendAll(instanceUrl, answers);
    logWrites += 1;
  }

  return {
    flush: logInstance,
    readMonths: readLogMonths,
    logMonths,
    loadAll: loadAnswerLog,
    grade: applyGrade,
    withdraw,
    removeDay,
    appendAll,
  };
}

export type AnswerStore = ReturnType<typeof createAnswerStore>;
