// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { deckPreferences } from "@solid-memo/domain/deckPace";
import { backlogDayOf, isPaused } from "@solid-memo/domain/deckPause";
import type { Deck, Prompt } from "@solid-memo/domain/deck";
import { studyCountsOf, type DeckSchedule, type StudyCounts } from "@solid-memo/domain/studyDigest";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import type { FsrsState, ReviewKey, ReviewQuality, ReviewState } from "@solid-memo/domain/review";
import {
  buildStudyQueue,
  resetFsrsStudyDay,
  resetStudyDay,
  studyDayOf,
  withWritableDueDays,
  type Backlog,
  type StudyQueue,
} from "@solid-memo/domain/scheduling";
import { effectiveStates, recallOn } from "@solid-memo/domain/fsrs";
import type { ResponseTimes } from "@solid-memo/domain/answer";
import { inTurns, READS_AT_ONCE } from "./atOnce";
import type { DeckRepository, ReviewStateRepository } from "./ports";
import type { PreferenceStore } from "./preferenceStore";
import type { AnswerStore } from "./answerStore";
import { scheduleFrom, type DigestStore } from "./digestStore";

export interface StudyUseCases {
  /**
   * Today's due and new cards for a deck, respecting the daily caps, with
   * what grading them takes and their states (StudySessionQueue). A deck
   * paused today has none (docs/srs.md, "Pausing a deck").
   */
  getStudyQueue(instanceUrl: string, deck: Deck, now: Date): Promise<StudySessionQueue>;
  /**
   * How many prompts today's queue would hold, as getStudyQueue counts
   * them, and whether every prompt of the deck is learned (none of it, for a
   * deck paused today, whose documents are not read); from the deck's schedule in the instance's digest when neither
   * of its documents changed since, else from its documents (and the
   * digest is brought up to date). Each document is read as the user
   * only when it is the instance's (isInInstancePod), as no one
   * otherwise, and only a deck whose documents both are has its
   * schedule kept in the digest. STUDY_COUNTS_AT_ONCE decks are counted
   * at once, whoever asks, the others waiting their turn: a deck list
   * asks for every deck's, and a catalog may list a thousand.
   */
  getStudyCounts(instanceUrl: string, deck: Deck, now: Date): Promise<StudyCounts>;
  /**
   * Keep the deck's schedule in the digest, as of now: when a study
   * session ends. Nothing, for a deck whose documents are not both the
   * instance's (isInInstancePod).
   */
  refreshStudyDigest(instanceUrl: string, deck: Deck): Promise<void>;
  /**
   * Apply one SM-2 review: load the prompt's state (or start fresh),
   * transition it, persist it, and return the new state, with what
   * undoReview needs to take it back. The answer logged keeps how long
   * it took (`times`, as the screen measured it; recordedResponseTimes
   * says which are kept). With `known` (a study session's, of its
   * queue), the preferences are not read again.
   */
  recordReview(
    instanceUrl: string,
    deck: Deck,
    prompt: Prompt,
    quality: ReviewQuality,
    now: Date,
    times?: ResponseTimes,
    known?: GradeBasis,
  ): Promise<RecordedReview>;
  /**
   * Take back an answer recordReview gave: the prompt's state goes back
   * to how it was before (a prompt that was new loses its state), and
   * the answer leaves the answers still on their way to the log and, if
   * an add of it was ever begun, the log as well.
   * Resolves to the state written back, null for a prompt new again.
   */
  undoReview(instanceUrl: string, deck: Deck, undo: ReviewUndo): Promise<ReviewState | null>;
  /**
   * Undo the current study day for a deck: cards reviewed today go back
   * to how they were before, cards introduced today become new again.
   * Resolves to the number of cards reset.
   */
  resetStudyDay(instanceUrl: string, deck: Deck, now: Date): Promise<number>;
}

/**
 * Today's queue of a deck (StudyUseCases.getStudyQueue), with the instance's
 * preferences it was built with, which a session grades its prompts by
 * (GradeBasis), and the deck's review states it was built from, which a
 * session shows each grade's interval from (previewIntervals): SM-2's,
 * and the FSRS-6 states beside them.
 */
export interface StudySessionQueue extends StudyQueue {
  prefs: StudyPreferences;
  states: ReviewState[];
  fsrsStates: FsrsState[];
}

/** What a grade is made with besides the prompt's state, which is the reviews document's: the instance's preferences. */
export interface GradeBasis {
  prefs: StudyPreferences;
}

/**
 * A review recorded (StudyUseCases.recordReview): the prompt's new SM-2
 * state, its new FSRS-6 state when FSRS-6 sets the due days, and how to
 * undo it.
 */
export interface RecordedReview {
  state: ReviewState;
  fsrs?: FsrsState;
  undo: ReviewUndo;
}

/**
 * What undoing one answer takes (StudyUseCases.undoReview), kept in memory
 * while the session lasts: the stored snapshot (ReviewState.previous)
 * is of before the study day's first review, so it cannot undo a second.
 */
export interface ReviewUndo {
  key: ReviewKey;
  /** The prompt's SM-2 state before the answer; null for a prompt that was new. */
  before: ReviewState | null;
  /**
   * When the answer wrote an FSRS-6 state, the one before it (null: none,
   * as for a new prompt or one estimated from SM-2), which undoing writes
   * back or removes; absent when the answer left FSRS-6's state alone.
   */
  fsrs?: { before: FsrsState | null };
  /** The answer logged, and the study day it is in. */
  answer: { id: string; studyDay: string };
}

/** How many decks' study counts are worked out at once: each reads two documents together. */
const STUDY_COUNTS_AT_ONCE = READS_AT_ONCE / 2;

/**
 * The backlog a deck that resumed from a pause has today, for
 * buildStudyQueue: its resume day and each prompt's memory today
 * (recallOn); nothing for any other deck.
 */
function backlogOf(
  deck: Deck,
  reviews: { sm2: readonly ReviewState[]; fsrs: readonly FsrsState[] },
  prefs: StudyPreferences,
  now: Date,
): { backlog?: Backlog } {
  const today = studyDayOf(now, prefs.dayBoundaryHour);
  const before = backlogDayOf(deck, today);
  if (before === undefined) return {};
  return {
    backlog: { before, memory: recallOn(reviews.sm2, reviews.fsrs, today, prefs.dayBoundaryHour) },
  };
}

/**
 * Study (docs/srs.md): a deck's queue for today and how many prompts it
 * holds, each answer graded by the instance's scheduler and logged, an
 * answer or the whole study day taken back, and the deck's schedule kept
 * in the instance's digest.
 */
export function createStudyUseCases({
  deckRepository,
  reviewStateRepository,
  preferenceStore,
  digestStore,
  answerStore,
  random,
}: {
  deckRepository: DeckRepository;
  reviewStateRepository: ReviewStateRepository;
  preferenceStore: Pick<PreferenceStore, "get">;
  digestStore: Pick<DigestStore, "of" | "asNoOneOf" | "noteSchedule" | "refresh">;
  answerStore: Pick<AnswerStore, "grade" | "withdraw" | "removeDay">;
  random: () => number;
}): StudyUseCases {
  const countsTurn = inTurns(STUDY_COUNTS_AT_ONCE);
  async function studyCountsAndSchedule(instanceUrl: string, deck: Deck, now: Date) {
    const [prefs, digest, asNoOne] = await Promise.all([
      preferenceStore.get(instanceUrl),
      digestStore.of(instanceUrl),
      digestStore.asNoOneOf(instanceUrl, deck),
    ]);
    // A paused deck has nothing to study today: its documents are not read, and its schedule waits.
    if (isPaused(deck, studyDayOf(now, prefs.dayBoundaryHour)))
      return { dueCount: 0, newCount: 0, learned: false };
    const studyPrefs = deckPreferences(prefs, deck);
    const kept = digest.schedules[deck.url];
    // Each of the deck's documents read as the user only when it is the instance's.
    const readCards = (version: string | undefined) =>
      deckRepository.readCardsSince(deck, version, { asNoOne: asNoOne.cards });
    const readReviews = (version: string | undefined) =>
      reviewStateRepository.readReviewStatesSince(deck, version, { asNoOne: asNoOne.reviews });
    const [cardsSince, reviewsSince] = await Promise.all([
      readCards(kept?.cardsVersion),
      readReviews(kept?.reviewsVersion),
    ]);
    const backlogBefore = backlogDayOf(deck, studyDayOf(now, prefs.dayBoundaryHour));
    const countsOf = (schedule: DeckSchedule) =>
      studyCountsOf(schedule, {
        direction: deck.direction,
        prefs: studyPrefs,
        now,
        ...(backlogBefore === undefined ? {} : { backlogBefore }),
      });
    if (kept !== undefined && cardsSince.unchanged && reviewsSince.unchanged) {
      const counts = countsOf(kept.schedule);
      if (counts !== null) return counts;
    }
    const [cards, reviews] = await Promise.all([
      cardsSince.unchanged ? readCards(undefined) : cardsSince,
      reviewsSince.unchanged ? readReviews(undefined) : reviewsSince,
    ]);
    // A read without a version to compare is never "unchanged".
    if (cards.unchanged || reviews.unchanged)
      throw new Error("A read without a version to compare came back unchanged.");
    // Counted from the deck's schedule, as the digest's is, not from a queue of every prompt:
    // it goes by the deck's review states, so decks that share one cards document don't each go
    // through its cards (scheduleOf).
    const schedule = scheduleFrom(cards, deck, reviews, prefs, now);
    digestStore.noteSchedule(instanceUrl, deck, cards, reviews, schedule, asNoOne);
    // Worked out now, of the deck's direction and today's preferences, it always counts.
    return countsOf(schedule)!;
  }

  return {
    async getStudyQueue(instanceUrl, deck, now) {
      const [cards, reviews, prefs] = await Promise.all([
        deckRepository.listCards(deck),
        reviewStateRepository.listReviewStates(deck),
        preferenceStore.get(instanceUrl),
      ]);
      const queue = buildStudyQueue({
        // A paused deck's cards stay out of the day's study; its states still come, for what reads them.
        cards: isPaused(deck, studyDayOf(now, prefs.dayBoundaryHour)) ? [] : cards,
        direction: deck.direction,
        reviews: effectiveStates(reviews.sm2, reviews.fsrs, prefs.scheduler, prefs.dayBoundaryHour),
        prefs: deckPreferences(prefs, deck),
        now,
        random,
        ...backlogOf(deck, reviews, prefs, now),
      });
      return { ...queue, prefs, states: reviews.sm2, fsrsStates: reviews.fsrs };
    },
    getStudyCounts(instanceUrl, deck, now) {
      return countsTurn(() => studyCountsAndSchedule(instanceUrl, deck, now));
    },
    refreshStudyDigest: digestStore.refresh,
    recordReview(instanceUrl, deck, prompt, quality, now, times = {}, known) {
      return answerStore.grade(
        instanceUrl,
        deck,
        { cardId: prompt.card.id, cardUrl: prompt.card.url, direction: prompt.direction },
        quality,
        now,
        { times },
        known,
      );
    },
    async undoReview(instanceUrl, deck, { key, before, fsrs, answer }) {
      const back = <T extends ReviewState | FsrsState>(state: T | null) =>
        state === null
          ? { save: [], remove: [key] }
          : { save: [withWritableDueDays(state)], remove: [] };
      // Both states as they were, in one save: FSRS-6's only when the answer wrote it.
      await reviewStateRepository.applyReviewChanges(deck, {
        ...back(before),
        ...(fsrs === undefined ? {} : { fsrs: back(fsrs.before) }),
      });
      // The answer never happened: off the answers on their way to the log, and out of it.
      await answerStore.withdraw(instanceUrl, answer);
      return before;
    },
    async resetStudyDay(instanceUrl, deck, now) {
      const [prefs, reviews] = await Promise.all([
        preferenceStore.get(instanceUrl),
        reviewStateRepository.listReviewStates(deck),
      ]);
      const reset = resetStudyDay(reviews.sm2, now, prefs.dayBoundaryHour);
      const count = reset.restore.length + reset.remove.length;
      if (count > 0) {
        // The day never happened: its answers leave the log, those still on their way first.
        // Before the states go back, so a removal that fails leaves the day to reset again,
        // and the retry repeats both writes.
        await answerStore.removeDay(instanceUrl, deck.url, studyDayOf(now, prefs.dayBoundaryHour));
        // FSRS-6's states of the day go back with SM-2's, in the same save.
        const fsrs = resetFsrsStudyDay(reviews.fsrs, now, prefs.dayBoundaryHour);
        await reviewStateRepository.applyReviewChanges(deck, {
          save: reset.restore,
          remove: reset.remove,
          fsrs: { save: fsrs.restore, remove: fsrs.remove },
        });
      }
      return count;
    },
  };
}
