// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { MINIMAL_ANSWERS } from "./answerScale";
import {
  FSRS_REVIEW_STATE_FORMAT_VERSION,
  reviewKeyOf,
  type DueState,
  type FsrsSnapshot,
  type FsrsState,
  type ReviewKey,
  type ReviewQuality,
  type ReviewState,
} from "./review";
import { nextDueDate, studyDayOf } from "./scheduling";
import { fnv1a } from "./fnv1a";
import { boundedSm2State, MAX_INTERVAL_DAYS, type Sm2State } from "./sm2";
import { daysBetween, gradeGroupOf } from "./studyPatterns";

/**
 * FSRS-6, the Free Spaced Repetition Scheduler, version 6, with its
 * default parameters. The formulas are reimplemented from the published
 * description of FSRS-6, as fsrs-rs v6.6.2 (BSD-3-Clause) gives it:
 * https://github.com/open-spaced-repetition/fsrs-rs/blob/v6.6.2/src/model.rs
 * (docs/srs.md, FSRS-6, which also says what Solid Memo fixes). In
 * 64-bit floating point throughout, in whole study days. The interval
 * is fuzzed by the ranges py-fsrs v6.3.2 (MIT) and Anki 26.09.3
 * (AGPL-3.0-or-later) give, reimplemented, by a factor drawn from the prompt and
 * its last review rather than at random (fuzzedInterval, fuzzFactor):
 * https://github.com/open-spaced-repetition/py-fsrs/blob/v6.3.2/fsrs/scheduler.py
 * https://github.com/ankitects/anki/blob/26.09.3/rslib/src/scheduler/states/fuzz.rs
 */

/** The scheduler that sets the due days: the notations of the Schedulers scheme's concepts. */
export type Scheduler = "sm2" | "fsrs6";

/** An FSRS rating: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type FsrsRating = 1 | 2 | 3 | 4;

/** What FSRS-6 knows of a prompt's memory. */
export interface FsrsMemory {
  /** Days until the chance of recall falls to 90%. */
  stability: number;
  /** From 1 (easiest) to 10 (hardest). */
  difficulty: number;
}

/** The FSRS-6 default parameters w0 to w20 (fsrs-rs v6.6.2 `inference.rs`). */
const W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
] as const;

/** w at `i`. */
function w(i: number): number {
  return W[i]!;
}

/** The forgetting curve's decay, w20. */
const DECAY = w(20);

/** Chosen so that the chance of recall after `stability` days is 90%. */
const FACTOR = 0.9 ** (-1 / DECAY) - 1;

const MIN_STABILITY = 0.001;
const MAX_STABILITY = 36_500;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

/** The chance of recall FSRS-6 aims at when a card falls due, unless the learner chooses another. */
export const DEFAULT_DESIRED_RETENTION = 0.9;

/** The lowest desired retention a learner may choose, as the preferences' shape allows. */
export const MIN_DESIRED_RETENTION = 0.7;

/** The highest desired retention a learner may choose, as the preferences' shape allows. */
export const MAX_DESIRED_RETENTION = 0.97;

/**
 * The desired retention to schedule by: the stored one when it is a
 * number the preferences' shape allows, the default otherwise. Outside
 * that range FSRS-6 has no interval (a share of 1 or more, or of 0 or
 * less, gives none), so every grade would be refused.
 */
export function usableDesiredRetention(stored: number): number {
  return stored >= MIN_DESIRED_RETENTION && stored <= MAX_DESIRED_RETENTION
    ? stored
    : DEFAULT_DESIRED_RETENTION;
}

/**
 * The retention an SM-2 schedule is taken to have kept when FSRS-6
 * memory is estimated from it (fsrs-rs's `sm2_retention`, Anki's
 * historical retention).
 */
const SM2_RETENTION = 0.9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The chance of recalling a card of `stability` days `elapsedDays` after its last review. */
export function retrievability(elapsedDays: number, stability: number): number {
  return (1 + (FACTOR * elapsedDays) / stability) ** -DECAY;
}

/**
 * The interval, in whole days, after which the chance of recall falls
 * to `desiredRetention`: rounded, from 1 day to 36,500.
 */
export function fsrsInterval(stability: number, desiredRetention: number): number {
  const days = (stability / FACTOR) * (desiredRetention ** (-1 / DECAY) - 1);
  return clamp(Math.round(days), 1, MAX_INTERVAL_DAYS);
}

/**
 * How far fuzz may move an interval each way, in days: 1, plus 0.15 for
 * each day from 2.5 to 7, 0.10 for each from 7 to 20 and 0.05 for each
 * past 20 (py-fsrs's `FUZZ_RANGES`, Anki's `fuzz_delta`).
 */
const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Number.POSITIVE_INFINITY, factor: 0.05 },
] as const;

/** Intervals shorter than this many days are not fuzzed. */
const MIN_FUZZED_DAYS = 2.5;

/**
 * The fewest and most days fuzz may make an interval of `days` (of
 * 2.5 days or more): `days` less and plus its delta, rounded, from 2
 * days to 36,500.
 */
function fuzzRange(days: number): { min: number; max: number } {
  let delta = 1;
  for (const range of FUZZ_RANGES) {
    delta += range.factor * Math.max(Math.min(days, range.end) - range.start, 0);
  }
  const max = Math.min(Math.round(days + delta), MAX_INTERVAL_DAYS);
  return { min: Math.min(Math.max(2, Math.round(days - delta)), max), max };
}

/**
 * An interval of `days` fuzzed by `factor`, from 0 up to 1: a day of
 * its fuzz range, the fewest at 0, each day as likely for a factor
 * spread evenly. An interval shorter than 2.5 days stays as it is. For
 * one factor a longer interval never gives a shorter fuzzed one.
 */
export function fuzzedInterval(days: number, factor: number): number {
  if (days < MIN_FUZZED_DAYS) return days;
  const { min, max } = fuzzRange(days);
  return Math.floor(factor * (max - min + 1) + min);
}

/**
 * A 32-bit hash with its bits mixed by MurmurHash3's finalizer
 * (fmix32), so that texts a character apart, such as two instants a
 * second apart, give factors spread across 0 to 1, as FNV-1a alone
 * spreads them less evenly.
 */
function mixed(hash: number): number {
  let h = hash ^ (hash >>> 16);
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The fuzz factor of a review of a prompt, from 0 up to 1: a hash
 * (fnv1a, mixed) of the prompt and the instant of its last review
 * before this one (`lastReviewedAt`; null for a new prompt), not of the
 * time or the rating. So a grade gives the due day its preview showed, every rating
 * of a review shares one factor and keeps the intervals in the ratings'
 * order, and the same review graded again (after an undo) falls due the
 * same day; the next review draws another.
 */
export function fuzzFactor(key: ReviewKey, lastReviewedAt: string | null): number {
  const last = lastReviewedAt === null ? "" : String(Date.parse(lastReviewedAt));
  return mixed(fnv1a(`${key.cardId}\n${key.direction}\n${last}`)) / 2 ** 32;
}

/** The difficulty a first rating gives, before it is kept to 1–10. */
function initialDifficulty(rating: FsrsRating): number {
  return w(4) - Math.exp(w(5) * (rating - 1)) + 1;
}

/** The difficulty after a rating: a step by the rating, damped near 10, reverted a little to Easy's. */
function nextDifficulty(difficulty: number, rating: FsrsRating): number {
  const step = -w(6) * (rating - 3);
  const damped = difficulty + ((MAX_DIFFICULTY - difficulty) * step) / 9;
  const reverted = w(7) * initialDifficulty(4) + (1 - w(7)) * damped;
  return clamp(reverted, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

/** The stability after a recalled review (Hard, Good or Easy) at recall chance `r`. */
function stabilityAfterRecall(
  stability: number,
  difficulty: number,
  r: number,
  rating: FsrsRating,
): number {
  const hardPenalty = rating === 2 ? w(15) : 1;
  const easyBonus = rating === 4 ? w(16) : 1;
  const growth =
    Math.exp(w(8)) *
    (11 - difficulty) *
    stability ** -w(9) *
    Math.expm1((1 - r) * w(10)) *
    hardPenalty *
    easyBonus;
  return stability * (growth + 1);
}

/** The stability after a lapse (Again) at recall chance `r`. */
function stabilityAfterLapse(stability: number, difficulty: number, r: number): number {
  const lapsed =
    w(11) * difficulty ** -w(12) * ((stability + 1) ** w(13) - 1) * Math.exp((1 - r) * w(14));
  return Math.min(lapsed, stability / Math.exp(w(17) * w(18)));
}

/** The stability after a second rating the same study day: never lower unless Again. */
function stabilityShortTerm(stability: number, rating: FsrsRating): number {
  const factor = Math.exp(w(17) * (rating - 3 + w(18))) * stability ** -w(19);
  return stability * (rating >= 2 ? Math.max(factor, 1) : factor);
}

/**
 * The memory after one rating, `elapsedDays` whole study days after the
 * last review; from a first rating when there is no memory yet (the
 * elapsed days then say nothing). A rating the same study day as the
 * last review (0 days) takes the short-term formula, Again included.
 */
export function nextMemory(
  memory: FsrsMemory | null,
  rating: FsrsRating,
  elapsedDays: number,
): FsrsMemory {
  if (memory === null) {
    return {
      stability: w(rating - 1),
      difficulty: clamp(initialDifficulty(rating), MIN_DIFFICULTY, MAX_DIFFICULTY),
    };
  }
  const stability = clamp(memory.stability, MIN_STABILITY, MAX_STABILITY);
  const difficulty = clamp(memory.difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY);
  const r = retrievability(elapsedDays, stability);
  const next =
    elapsedDays === 0
      ? stabilityShortTerm(stability, rating)
      : rating === 1
        ? stabilityAfterLapse(stability, difficulty, r)
        : stabilityAfterRecall(stability, difficulty, r, rating);
  return {
    stability: clamp(next, MIN_STABILITY, MAX_STABILITY),
    difficulty: nextDifficulty(difficulty, rating),
  };
}

/**
 * FSRS-6 memory estimated from an SM-2 state, for a prompt with no
 * (fresh) FSRS-6 state (fsrs-rs `memory_state_from_sm2`, at a retention
 * of 90%): the stability is the SM-2 interval, and the difficulty the
 * one at which a Good review on the due day multiplies the stability by
 * the ease factor, kept to 1–10. The SM-2 state is bounded first
 * (boundedSm2State), as applySm2 bounds it.
 */
export function memoryFromSm2(state: Pick<Sm2State, "easeFactor" | "intervalDays">): FsrsMemory {
  const sm2 = boundedSm2State({ ...state, repetitions: 0 });
  const stability = Math.max(sm2.intervalDays, MIN_STABILITY);
  const growth = Math.exp(w(8)) * stability ** -w(9) * Math.expm1((1 - SM2_RETENTION) * w(10));
  const difficulty = 11 - (sm2.easeFactor - 1) / growth;
  return { stability, difficulty: clamp(difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY) };
}

/**
 * The FSRS rating an SM-2 grade gives, by the button it is given with
 * (gradeGroupOf): 0 to 2 Again, 3 Hard, 4 Good, 5 Easy.
 */
export function ratingOfGrade(grade: ReviewQuality): FsrsRating {
  return (MINIMAL_ANSWERS.indexOf(gradeGroupOf(grade)) + 1) as FsrsRating;
}

/**
 * Whether an FSRS-6 state is fresh: the SM-2 state of its prompt has the
 * same last review, so no review since has left it behind. A stale one
 * (an older app graded SM-2 only, the day was reset, or the card
 * forgotten) counts for nothing and is replaced at the next review.
 */
export function isFresh(fsrs: FsrsState, sm2: ReviewState): boolean {
  return Date.parse(fsrs.lastReviewedAt) === Date.parse(sm2.lastReviewedAt);
}

/**
 * What sets each prompt's due day: under SM-2 the SM-2 states; under
 * FSRS-6, for each SM-2 state, its fresh FSRS-6 state's due day and
 * interval (the study days from the last review to it, 0 when the due
 * day was set before the last review), else the SM-2 state's own. One per SM-2 state, in their order: an FSRS-6 state
 * without an SM-2 state counts for nothing.
 */
export function effectiveStates(
  sm2: readonly ReviewState[],
  fsrs: readonly FsrsState[],
  scheduler: Scheduler,
  dayBoundaryHour: number,
): DueState[] {
  if (scheduler === "sm2") return [...sm2];
  const fsrsOf = new Map(fsrs.map((state) => [reviewKeyOf(state), state]));
  return sm2.map((state) => {
    const own = fsrsOf.get(reviewKeyOf(state));
    if (own === undefined || !isFresh(own, state)) return state;
    const lastDay = studyDayOf(new Date(state.lastReviewedAt), dayBoundaryHour);
    return {
      cardId: state.cardId,
      direction: state.direction,
      due: own.due,
      intervalDays: Math.max(0, daysBetween(lastDay, own.due)),
      firstReviewedAt: state.firstReviewedAt,
      lastReviewedAt: state.lastReviewedAt,
    };
  });
}

/**
 * The chance of recalling a prompt `now`, by its FSRS-6 state: at the
 * whole study days since its last review (0 the same study day, and
 * when the last review is later than now).
 */
export function recallNow(
  state: Pick<FsrsState, "stability" | "lastReviewedAt">,
  now: Date,
  dayBoundaryHour: number,
): number {
  const lastDay = studyDayOf(new Date(state.lastReviewedAt), dayBoundaryHour);
  const elapsed = Math.max(0, daysBetween(lastDay, studyDayOf(now, dayBoundaryHour)));
  return retrievability(elapsed, state.stability);
}

/** The fields a review of a state overwrites. */
function snapshotOf(state: FsrsState): FsrsSnapshot {
  return {
    stability: state.stability,
    difficulty: state.difficulty,
    due: state.due,
    lastReviewedAt: state.lastReviewedAt,
  };
}

/**
 * The FSRS-6 state after a rating `now`, given the prompt's states
 * before it (`sm2`, `fsrs`; null when there is none). The memory builds
 * on the fresh FSRS-6 state, else on an estimate from the SM-2 state,
 * else it starts from the rating (a new prompt); the elapsed days are
 * the study days since the last review, 0 the same study day. The due
 * day is the interval at `desiredRetention`, fuzzed by the factor of
 * the prompt and its last review (fuzzedInterval, fuzzFactor), after
 * today. The first review of a study day snapshots a fresh state, and
 * later ones that day keep its snapshot; an estimate or a new prompt
 * has none, as nothing FSRS-6 wrote is there to restore.
 */
export function fsrsReview(
  key: ReviewKey,
  current: { sm2: ReviewState | null; fsrs: FsrsState | null },
  rating: FsrsRating,
  now: Date,
  desiredRetention: number,
  dayBoundaryHour: number,
): FsrsState {
  const { sm2, fsrs } = current;
  const fresh = sm2 !== null && fsrs !== null && isFresh(fsrs, sm2) ? fsrs : null;
  const today = studyDayOf(now, dayBoundaryHour);
  let memory: FsrsMemory;
  if (sm2 === null) memory = nextMemory(null, rating, 0);
  else {
    const lastDay = studyDayOf(new Date(sm2.lastReviewedAt), dayBoundaryHour);
    const elapsed = Math.max(0, daysBetween(lastDay, today));
    memory = nextMemory(fresh ?? memoryFromSm2(sm2), rating, elapsed);
  }
  const previous =
    fresh === null
      ? undefined
      : studyDayOf(new Date(fresh.lastReviewedAt), dayBoundaryHour) === today
        ? fresh.previous
        : snapshotOf(fresh);
  return {
    cardId: key.cardId,
    direction: key.direction,
    stability: memory.stability,
    difficulty: memory.difficulty,
    due: nextDueDate(
      now,
      fuzzedInterval(
        fsrsInterval(memory.stability, desiredRetention),
        fuzzFactor(key, sm2?.lastReviewedAt ?? null),
      ),
      dayBoundaryHour,
    ),
    firstReviewedAt: sm2?.firstReviewedAt ?? now.toISOString(),
    lastReviewedAt: now.toISOString(),
    formatVersion: FSRS_REVIEW_STATE_FORMAT_VERSION,
    ...(previous === undefined ? {} : { previous }),
  };
}
