// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { shiftStudyDay } from "@solid-memo/domain/answer";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { deckPreferences } from "@solid-memo/domain/deckPace";
import { backlogDayOf, withPause, withResume } from "@solid-memo/domain/deckPause";
import { effectiveStates, recallOn, type PromptRecall } from "@solid-memo/domain/fsrs";
import { dueBefore } from "@solid-memo/domain/dueDays";
import { derivedOnceOf } from "@solid-memo/domain/frozen";
import { reviewKeyOf, type ReviewStates } from "@solid-memo/domain/review";
import { scheduledStates } from "@solid-memo/domain/scheduleInsight";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { inTurns, READS_AT_ONCE } from "./atOnce";
import type { DeckRepository, ReviewStateRepository } from "./ports";
import type { PreferenceStore } from "./preferenceStore";
import type { StudyPreferences } from "@solid-memo/domain/preferences";

/**
 * A deck's prompts studied, on a day: their average chance of recall
 * (null for none) and how many fall due on each day.
 */
interface Studied {
  recall: number | null;
  dueByDay: Readonly<Record<string, number>>;
}

const studiedOnce = new WeakMap<Card[], WeakMap<ReviewStates, Map<string, Studied>>>();

/** The study days a pause without a resume day is reckoned over, for its outlook. */
export const OUTLOOK_DAYS = 30;

/**
 * The study days after its resume day that a deck's comeback is told
 * (getComeback): a welcome back, not a standing note. Its record stays,
 * so without a bound every deck ever paused would be read for it.
 */
export const COMEBACK_DAYS = 30;

/** What a pause is likely to cost, by the day it would end. */
export interface PauseOutlook {
  /** The study day reckoned: the resume day, or OUTLOOK_DAYS from today without one. */
  day: string;
  /** The deck's average chance of recall then, over its prompts studied; null when none is. */
  recall: number | null;
}

/** What is likely left of a deck that resumed from a pause, while its backlog lasts. */
export interface Comeback {
  /** The deck's average chance of recall today, over its prompts studied. */
  recall: number;
  /** The prompts of its backlog still due. */
  waiting: number;
  /** The study days the backlog takes at the deck's review limit; null when the limit is 0. */
  days: number | null;
}

export interface DeckPauseUseCases {
  /**
   * Pause the deck from `now`: until the learner resumes it (null), or
   * until the study day `resumesOn`, which must come after today
   * (resumeDayInvalid, before any write). Kept on the deck's entry as it
   * is now; no review state changes (docs/srs.md, "Pausing a deck").
   */
  pauseDeck(instanceUrl: string, deck: Deck, resumesOn: string | null, now: Date): Promise<Deck>;
  /**
   * Resume a paused deck today: its pause keeps its start, with today as
   * its resume day, which tells the backlog it left. A deck not paused
   * today writes nothing.
   */
  resumeDeck(instanceUrl: string, deck: Deck, now: Date): Promise<Deck>;
  /**
   * What pausing the deck until `resumesOn` (or for OUTLOOK_DAYS, null)
   * is likely to cost: the average chance of recall of its prompts then,
   * by FSRS-6 (recallOn), whichever scheduler sets the due days.
   */
  getPauseOutlook(
    instanceUrl: string,
    deck: Deck,
    resumesOn: string | null,
    now: Date,
  ): Promise<PauseOutlook>;
  /**
   * What is likely left of a deck that resumed from a pause, up to
   * COMEBACK_DAYS after its resume day: its average chance of recall
   * today and its backlog. Null for any other deck, and once none of its
   * backlog is due.
   */
  getComeback(instanceUrl: string, deck: Deck, now: Date): Promise<Comeback | null>;
}

/** Pausing and resuming a deck, on the study day of the instance's preferences. */
export function createDeckPauseUseCases({
  deckRepository,
  reviewStateRepository,
  preferenceStore,
}: {
  deckRepository: Pick<DeckRepository, "setPause" | "listCards">;
  reviewStateRepository: Pick<ReviewStateRepository, "listReviewStates">;
  preferenceStore: Pick<PreferenceStore, "get">;
}): DeckPauseUseCases {
  async function todayOf(instanceUrl: string, now: Date) {
    const prefs = await preferenceStore.get(instanceUrl);
    return { prefs, today: studyDayOf(now, prefs.dayBoundaryHour) };
  }

  // Each deck's two documents are read together, and the decks in turns:
  // a catalog anyone sharing it may have marked every deck resumed in, as
  // long as it is, never has all of its documents asked for at once.
  const turn = inTurns(READS_AT_ONCE / 2);

  /**
   * The deck's prompts studied, those of its cards not retired: their
   * average recall on `day` and their due days.
   */
  async function studied(deck: Deck, prefs: StudyPreferences, day: string): Promise<Studied> {
    const [cards, reviews] = await turn(() =>
      Promise.all([deckRepository.listCards(deck), reviewStateRepository.listReviewStates(deck)]),
    );
    // By the deck's states, not its cards (scheduledStates), and once for the decks that name the same documents.
    const key = [deck.direction, day, prefs.scheduler, prefs.dayBoundaryHour].join(" ");
    return derivedOnceOf(studiedOnce, cards, reviews, key, () => {
      const recall = recallOn(reviews.sm2, reviews.fsrs, day, prefs.dayBoundaryHour);
      const dueOf = new Map(
        effectiveStates(reviews.sm2, reviews.fsrs, prefs.scheduler, prefs.dayBoundaryHour).map(
          (state) => [reviewKeyOf(state), state.due],
        ),
      );
      const prompts = scheduledStates(cards, deck.direction, reviews.sm2)
        .map(reviewKeyOf)
        .filter((key) => recall.has(key));
      // Without a prototype: a due day is read leniently and may be any text.
      const dueByDay: Record<string, number> = Object.create(null);
      for (const key of prompts) {
        const due = dueOf.get(key)!;
        dueByDay[due] = (dueByDay[due] ?? 0) + 1;
      }
      return {
        recall: averageRecall(prompts.map((key) => recall.get(key)!)),
        // Frozen, so that its sums are worked out once (dueDays.ts).
        dueByDay: Object.freeze(dueByDay),
      };
    });
  }

  return {
    async pauseDeck(instanceUrl, deck, resumesOn, now) {
      const { today } = await todayOf(instanceUrl, now);
      const paused = withPause(deck, now, resumesOn, today);
      return deckRepository.setPause(deck, paused.pause!);
    },
    async resumeDeck(instanceUrl, deck, now) {
      const resumed = withResume(deck, (await todayOf(instanceUrl, now)).today);
      return resumed === deck ? deck : deckRepository.setPause(deck, resumed.pause!);
    },
    async getPauseOutlook(instanceUrl, deck, resumesOn, now) {
      const { prefs, today } = await todayOf(instanceUrl, now);
      const day = resumesOn ?? shiftStudyDay(today, OUTLOOK_DAYS);
      return { day, recall: (await studied(deck, prefs, day)).recall };
    },
    async getComeback(instanceUrl, deck, now) {
      const { prefs, today } = await todayOf(instanceUrl, now);
      const before = backlogDayOf(deck, today);
      if (before === undefined || before < shiftStudyDay(today, -COMEBACK_DAYS)) return null;
      const { recall, dueByDay } = await studied(deck, prefs, today);
      // Looked up, not counted of every prompt (dueDays.ts): decks may share their prompts.
      const waiting = dueBefore(dueByDay, before);
      if (waiting === 0) return null;
      const { maxReviewsPerDay } = deckPreferences(prefs, deck);
      return {
        recall: recall!,
        waiting,
        days: maxReviewsPerDay === 0 ? null : Math.ceil(waiting / maxReviewsPerDay),
      };
    },
  };
}

/** The average chance of recall of the prompts given; null for none. */
function averageRecall(prompts: readonly PromptRecall[]): number | null {
  if (prompts.length === 0) return null;
  return prompts.reduce((sum, prompt) => sum + prompt.recall, 0) / prompts.length;
}
