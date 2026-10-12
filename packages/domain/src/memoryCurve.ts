// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { isRecalled, MATURE_INTERVAL_DAYS, shiftStudyDay, type Answer } from "./answer";
import { isRepeat, isScoredReview, promptKeyOf, segmentsOf, type ChainIndex } from "./answerChain";
import { INTERVAL_BOUNDS } from "./scheduleInsight";
import type { Recall, Retention } from "./statistics";
import { daysBetween, weekdayOf } from "./studyPatterns";
import { fragmentIdOf } from "./subjectUrl";

/**
 * How memory grows, read from the chains of answers (answerChain.ts):
 * recall by the interval a card came back after and by how late it was
 * reviewed, recall week by week, where the prompts stood week by week
 * and how long they took to grow mature. The log holds no Studio edit,
 * so what is replayed from it is approximate, and an answer whose
 * predecessor was not read tells nothing of its lateness, unless it
 * recorded the day it was due. Pure;
 * statisticsOf puts them with the rest (docs/statistics.md).
 */

/** Scored reviews at an interval from `from` up to, not including, `to` (none: no end). */
export interface IntervalRecall {
  from: number;
  to?: number;
  recall: Recall;
}

/**
 * How late a review was, in days after it fell due: on time, late by
 * 1–2, 3–6, 7–29 or 30 days or more, early (or moved to an earlier day
 * in the Studio), or unknown (its predecessor not read, or not the
 * interval it was given).
 */
export type Lateness = "onTime" | "late1" | "late3" | "late7" | "late30" | "early" | "unknown";

/** The latenesses in the order they are shown. */
export const LATENESSES: readonly Lateness[] = [
  "onTime",
  "late1",
  "late3",
  "late7",
  "late30",
  "early",
  "unknown",
];

/** Scored reviews of one lateness. */
export interface LatenessRecall {
  lateness: Lateness;
  recall: Recall;
}

/** How well the reviews of one week (from Monday) were remembered. */
export interface WeekRetention {
  /** The week's Monday, "YYYY-MM-DD". */
  week: string;
  retention: Retention;
}

/** Where the prompts answered stood at the end of one week, as their last answers left them. */
export interface MemoryWeek {
  /** The week's Monday, "YYYY-MM-DD". */
  week: string;
  /** Last answered below grade 3. */
  relearning: number;
  /** Last given an interval under MATURE_INTERVAL_DAYS. */
  young: number;
  /** Last given an interval of MATURE_INTERVAL_DAYS or more. */
  mature: number;
  /** The median of the intervals they were last given, in days; null without one. */
  medianInterval: number | null;
}

/** How long prompts took to grow mature: medians, null of none. */
export interface TimeToMature {
  /** The prompts that grew mature, each segment once. */
  prompts: number;
  /** Study days from the introduction to the answer that made it mature. */
  days: number | null;
  /** Answers after the introduction up to that one, repeats the same day left out. */
  reviews: number | null;
}

/** The Monday of a study day's week. */
function mondayOf(studyDay: string): string {
  return shiftStudyDay(studyDay, -weekdayOf(studyDay));
}

/** How many of the reviews given there are, and how many were remembered. */
function recallOf(answers: readonly Answer[]): Recall {
  return { reviews: answers.length, recalled: answers.filter(isRecalled).length };
}

/**
 * How well scored reviews were remembered by the interval before them,
 * in the bins of INTERVAL_BOUNDS (an interval below the first counts in
 * the first), every bin given, of the answers given, `index` holding
 * their chains.
 */
export function recallByInterval(answers: readonly Answer[], index: ChainIndex): IntervalRecall[] {
  const bins = INTERVAL_BOUNDS.map((from, i) => ({
    from,
    ...(i + 1 < INTERVAL_BOUNDS.length ? { to: INTERVAL_BOUNDS[i + 1] } : {}),
    reviews: [] as Answer[],
  }));
  for (const answer of answers) {
    if (!isScoredReview(answer, index)) continue;
    const above = INTERVAL_BOUNDS.filter((bound) => answer.priorIntervalDays! >= bound).length;
    bins[Math.max(0, above - 1)]!.reviews.push(answer);
  }
  return bins.map(({ reviews, ...bin }) => ({ ...bin, recall: recallOf(reviews) }));
}

/**
 * How many days after it fell due a scored review of the index was
 * done (negative when early): its study day less the day it was due,
 * as the answer recorded it (Answer.priorDue, since vocabulary 1.19),
 * else the day its predecessor's interval ran out. Without priorDue it
 * is null when that cannot be told: the review starts its chain (its
 * predecessor was not read, or the card was moved), or its prior
 * interval is not the one its predecessor gave (an edit in the
 * Studio); and a review the Studio moved to a later day shows as late.
 * Either way one the daily review limit held back shows as late.
 */
export function latenessOf(answer: Answer, index: ChainIndex): number | null {
  if (answer.priorDue !== undefined) return daysBetween(answer.priorDue, answer.studyDay);
  const { chain, at } = index.places.get(answer)!;
  if (at === 0) return null;
  const before = chain[at - 1]!;
  if (before.nextIntervalDays !== answer.priorIntervalDays) return null;
  return daysBetween(before.studyDay, answer.studyDay) - before.nextIntervalDays;
}

/** The lateness that days late (latenessOf) fall in. */
export function latenessBucketOf(days: number | null): Lateness {
  if (days === null) return "unknown";
  if (days < 0) return "early";
  if (days === 0) return "onTime";
  if (days < 3) return "late1";
  if (days < 7) return "late3";
  if (days < 30) return "late7";
  return "late30";
}

/**
 * How well scored reviews were remembered by how late they were, every
 * lateness given in the order of LATENESSES, of the answers given, whose
 * chains `index` holds (with answers before them, the better to tell).
 */
export function recallByLateness(answers: readonly Answer[], index: ChainIndex): LatenessRecall[] {
  const byLateness = new Map<Lateness, Answer[]>(LATENESSES.map((lateness) => [lateness, []]));
  for (const answer of answers) {
    if (!isScoredReview(answer, index)) continue;
    byLateness.get(latenessBucketOf(latenessOf(answer, index)))!.push(answer);
  }
  return LATENESSES.map((lateness) => ({
    lateness,
    recall: recallOf(byLateness.get(lateness)!),
  }));
}

/**
 * How well reviews were remembered, week by week (from Monday), young and
 * mature apart, oldest first; only weeks with a scored review have an
 * entry. `index` holds the answers' chains.
 */
export function weeklyRetention(answers: readonly Answer[], index: ChainIndex): WeekRetention[] {
  const weeks = new Map<string, Retention>();
  for (const answer of answers) {
    if (!isScoredReview(answer, index)) continue;
    const week = mondayOf(answer.studyDay);
    const retention = weeks.get(week) ?? {
      young: { reviews: 0, recalled: 0 },
      mature: { reviews: 0, recalled: 0 },
    };
    const group =
      answer.priorIntervalDays! >= MATURE_INTERVAL_DAYS ? retention.mature : retention.young;
    group.reviews += 1;
    if (isRecalled(answer)) group.recalled += 1;
    weeks.set(week, retention);
  }
  return [...weeks]
    .map(([week, retention]) => ({ week, retention }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Counts of whole numbers from 0 to a largest, for their median as they
 * change (a binary indexed tree): adding and finding take time of the logarithm
 * of the largest, not of how many there are.
 */
class Counts {
  private readonly tree: number[];
  private top = 1;
  size = 0;

  constructor(largest: number) {
    this.tree = new Array<number>(largest + 2).fill(0);
    while (this.top * 2 < this.tree.length) this.top *= 2;
  }

  add(value: number, delta: number): void {
    this.size += delta;
    for (let i = value + 1; i < this.tree.length; i += i & -i) this.tree[i]! += delta;
  }

  /** The `k`th smallest, from 1. */
  private kth(k: number): number {
    let at = 0;
    for (let step = this.top; step > 0; step >>= 1) {
      if (at + step < this.tree.length && this.tree[at + step]! < k) {
        at += step;
        k -= this.tree[at]!;
      }
    }
    return at;
  }

  median(): number | null {
    if (this.size === 0) return null;
    const middle = Math.ceil(this.size / 2);
    return this.size % 2 === 1 ? this.kth(middle) : (this.kth(middle) + this.kth(middle + 1)) / 2;
  }
}

/**
 * The longest interval the median of intervals counts, in days (a
 * century): an interval in the pod outside 0 to this, which no shape
 * check on reading rules out, counts as the nearer end.
 */
const LONGEST_SPAN_DAYS = 36_500;

/** An answer's next interval as the median of intervals counts it: a whole number of days from 0 to LONGEST_SPAN_DAYS. */
function spanOf(answer: Answer): number {
  return Math.min(Math.max(Math.floor(answer.nextIntervalDays) || 0, 0), LONGEST_SPAN_DAYS);
}

/**
 * Whether `answer`, the first of its chain read and not an
 * introduction, goes on from `before`, a card of the same id and
 * direction in another deck: moved with its progress. It must start
 * from the interval `before` gave, no sooner than that ran out, and the
 * old prompt must never be answered again; else it is a namesake in
 * another deck whose answers before were not read.
 */
function movedFrom(before: Answer, answer: Answer, index: ChainIndex): boolean {
  const { chain, at } = index.places.get(before)!;
  return (
    before.nextIntervalDays === answer.priorIntervalDays &&
    daysBetween(before.studyDay, answer.studyDay) >= before.nextIntervalDays &&
    at === chain.length - 1
  );
}

/** Where a prompt's last answer left it. */
function stateOf(answer: Answer): "relearning" | "young" | "mature" {
  if (!isRecalled(answer)) return "relearning";
  return answer.nextIntervalDays >= MATURE_INTERVAL_DAYS ? "mature" : "young";
}

/**
 * Where the prompts answered stood at the end of each week (from Monday)
 * from the week of `since` (else of the first answer) to this one, as
 * their last answers by then left them, of the answers given, whose
 * chains `index` holds; the answers before `since` set where the prompts
 * start. A card moved to another deck with its progress (its new chain
 * starting from the interval its old one ended on, once that ran out,
 * and the old one ending; movedFrom) leaves the old deck then. The Studio's other edits are not logged, so this is
 * approximate. None of no answers.
 */
export function memoryOverTime(
  answers: readonly Answer[],
  index: ChainIndex,
  today: string,
  since?: string,
): MemoryWeek[] {
  if (answers.length === 0) return [];
  const ordered = [...answers].sort(
    (a, b) => a.answeredAt.localeCompare(b.answeredAt) || a.id.localeCompare(b.id),
  );
  const intervals = new Counts(
    ordered.reduce((largest, answer) => Math.max(largest, spanOf(answer)), 0),
  );
  const states = { relearning: 0, young: 0, mature: 0 };
  // Each prompt's last answer, and the prompt each card (by id and direction) was last answered as.
  const last = new Map<string, Answer>();
  const byCard = new Map<string, string>();
  const forget = (answer: Answer) => {
    states[stateOf(answer)] -= 1;
    intervals.add(spanOf(answer), -1);
  };
  const apply = (answer: Answer) => {
    const key = promptKeyOf(answer);
    const card = `${fragmentIdOf(answer.cardUrl)}\n${answer.direction}`;
    const before = last.get(key);
    if (before !== undefined) forget(before);
    else if (index.places.get(answer)!.at === 0 && answer.priorIntervalDays !== undefined) {
      const old = byCard.get(card);
      const moved = old === undefined ? undefined : last.get(old)!;
      if (moved !== undefined && movedFrom(moved, answer, index)) {
        forget(moved);
        last.delete(old!);
      }
    }
    last.set(key, answer);
    byCard.set(card, key);
    states[stateOf(answer)] += 1;
    intervals.add(spanOf(answer), 1);
  };
  const weeks: MemoryWeek[] = [];
  let next = 0;
  for (
    let week = mondayOf(since ?? ordered[0]!.studyDay);
    week <= today;
    week = shiftStudyDay(week, 7)
  ) {
    const end = shiftStudyDay(week, 6);
    while (next < ordered.length && ordered[next]!.studyDay <= end) apply(ordered[next++]!);
    weeks.push({ week, ...states, medianInterval: intervals.median() });
  }
  return weeks;
}

/** The median of the values given; null of none. */
function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * How long the prompts of the index took to grow mature: of each segment
 * that starts with an introduction among the answers and has an answer
 * giving an interval of MATURE_INTERVAL_DAYS or more on or after `since`
 * (any, without), the study days from the one to the first such, and
 * the answers between them, that one included, repeats left out.
 */
export function timeToMatureOf(index: ChainIndex, since?: string): TimeToMature {
  const days: number[] = [];
  const reviews: number[] = [];
  for (const chain of index.chains.values()) {
    for (const segment of segmentsOf(chain)) {
      if (segment.open) continue;
      const at = segment.answers.findIndex(
        (answer) => answer.nextIntervalDays >= MATURE_INTERVAL_DAYS,
      );
      if (at === -1) continue;
      const matured = segment.answers[at]!;
      if (since !== undefined && matured.studyDay < since) continue;
      days.push(daysBetween(segment.answers[0]!.studyDay, matured.studyDay));
      reviews.push(
        segment.answers.slice(1, at + 1).filter((answer) => !isRepeat(answer, index)).length,
      );
    }
  }
  return { prompts: days.length, days: medianOf(days), reviews: medianOf(reviews) };
}
