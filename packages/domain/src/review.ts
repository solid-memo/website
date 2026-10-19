// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { StudyDirection } from "./deck";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";

/**
 * Format version written on every review state this app saves. Format 2
 * has the fields format 1 had; it is where stamping began, and where the
 * previous* snapshot and the per-direction subject naming became part of
 * the contract (see docs/migrations.md).
 */
export const REVIEW_STATE_FORMAT_VERSION: number = LATEST_VERSION.reviewState;

/**
 * Format version written on every FSRS-6 state this app saves: FSRS
 * review-state format 1, a shape of its own beside the SM-2 state's
 * (vocabulary 1.21, docs/migrations.md).
 */
export const FSRS_REVIEW_STATE_FORMAT_VERSION: number = LATEST_VERSION.fsrsReviewState;

/** SM-2 answer quality: 0 (blackout) to 5 (perfect). */
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * What a review state belongs to: a card seen from one side. A card
 * studied both ways has two states, scheduled independently.
 */
export interface ReviewKey {
  /** Fragment id of the card this state belongs to. */
  cardId: string;
  direction: StudyDirection;
}

/** The key as one string, for maps and comparisons. */
export function reviewKeyOf(key: ReviewKey): string {
  return `${key.direction}/${key.cardId}`;
}

/** The scheduling fields a review overwrites. */
export interface ReviewSnapshot {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  due: string;
  lastReviewedAt: string;
}

/**
 * Scheduling state of one card in one direction, stored separately from
 * the card's content.
 */
export interface ReviewState extends ReviewKey {
  /** SM-2 easiness factor, never below 1.3. */
  easeFactor: number;
  intervalDays: number;
  /** Successful repetitions in a row. */
  repetitions: number;
  /** Study day ("YYYY-MM-DD") the card becomes due. */
  due: string;
  /** ISO dateTime of the first-ever review (introduction). */
  firstReviewedAt: string;
  /** ISO dateTime of the most recent review. */
  lastReviewedAt: string;
  /** The format the state is stored in; a missing one read as 1. */
  formatVersion: number;
  /**
   * The state as it was before the first review of the study day in
   * `lastReviewedAt` — what resetting that day restores. Absent for a card
   * introduced that day (it had no earlier state) and on states written
   * before snapshots existed.
   */
  previous?: ReviewSnapshot;
}

/**
 * What sets a prompt's due day, whichever scheduler does: its due day,
 * the interval that led there and its first and last review. A
 * ReviewState is one; under FSRS-6 the due day and interval are the
 * FSRS-6 state's (effectiveStates in fsrs.ts). Read only: a state is
 * written as a ReviewState or an FsrsState, never as this.
 */
export interface DueState extends ReviewKey {
  /** Study day ("YYYY-MM-DD") the prompt becomes due. */
  due: string;
  /** Study days from the last review to the due day. */
  intervalDays: number;
  /** ISO dateTime of the first-ever review (introduction). */
  firstReviewedAt: string;
  /** ISO dateTime of the most recent review. */
  lastReviewedAt: string;
}

/** The FSRS-6 fields a review overwrites. */
export interface FsrsSnapshot {
  stability: number;
  difficulty: number;
  due: string;
  lastReviewedAt: string;
}

/**
 * FSRS-6 state of one card in one direction, kept beside its SM-2
 * ReviewState (docs/srs.md, FSRS-6). It counts only while it is fresh:
 * while the SM-2 state of the same prompt has the same last review.
 */
export interface FsrsState extends ReviewKey {
  /** Days until the chance of recall falls to 90%; above 0. */
  stability: number;
  /** From 1 (easiest) to 10 (hardest). */
  difficulty: number;
  /** Study day ("YYYY-MM-DD") the card becomes due. */
  due: string;
  /** ISO dateTime of the first-ever review (introduction). */
  firstReviewedAt: string;
  /** ISO dateTime of the most recent review. */
  lastReviewedAt: string;
  /** The format the state is stored in. */
  formatVersion: number;
  /**
   * The state as it was before the first review of the study day in
   * `lastReviewedAt`, as ReviewState's `previous`. Absent for a state
   * first written that day.
   */
  previous?: FsrsSnapshot;
}

/**
 * A reviews document's states as this app reads them: the SM-2 states,
 * one per prompt, and the FSRS-6 states kept beside them, one per
 * prompt too. Each kind is read from the same read of the document.
 */
export interface ReviewStates {
  sm2: ReviewState[];
  fsrs: FsrsState[];
}
