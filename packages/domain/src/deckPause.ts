// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { isCountableDay } from "./answer";
import { AppError } from "./appError";
import type { Deck } from "./deck";
import { isCarriedOverInstant } from "./reviewStateEdits";

/**
 * A deck's pause: the learner set the deck aside for a while. It is
 * one record on the deck's catalog entry and nothing else: no review
 * state moves, as memory keeps fading while the deck rests
 * (docs/srs.md, "Pausing a deck").
 *
 * The record stays once the deck resumes, by hand or on its day: the
 * resume day then says when the pause ended, and the cards that fell
 * due before it are the backlog the deck catches up on.
 * Pausing again replaces it.
 */
export interface DeckPause {
  /** When the pause began, an ISO dateTime (`sm:deckPausedAt`). */
  pausedAt: string;
  /**
   * The study day ("YYYY-MM-DD") the deck resumes on, by itself at the
   * start of that day (`sm:deckResumesOn`); absent while the deck stays
   * paused until the learner resumes it.
   */
  resumesOn?: string;
}

/**
 * The pause a deck's entry states, as a reader keeps it: the start an
 * instant of the years a grade carries over (isCarriedOverInstant), and
 * the resume day a study day one can count from (isCountableDay). The
 * catalog is data anyone may have written, and no shape checks these
 * terms: a start that is no instant is no pause, and a resume day that
 * is no day is dropped, leaving the deck paused until resumed.
 */
export function storedPause(
  pausedAt: string | null,
  resumesOn: string | null,
): DeckPause | undefined {
  if (pausedAt === null || !isCarriedOverInstant(pausedAt)) return undefined;
  return resumesOn !== null && isCountableDay(resumesOn) ? { pausedAt, resumesOn } : { pausedAt };
}

/** Whether the deck is paused on the study day `today`: paused, and its resume day not yet come. */
export function isPaused(deck: Pick<Deck, "pause">, today: string): boolean {
  const { pause } = deck;
  return pause !== undefined && (pause.resumesOn === undefined || today < pause.resumesOn);
}

/**
 * The deck paused from `now`, until the learner resumes it (null) or
 * until the study day `resumesOn`, which must come after `today`.
 * Throws resumeDayInvalid on a day that is no day, today or earlier.
 */
export function withPause(deck: Deck, now: Date, resumesOn: string | null, today: string): Deck {
  if (resumesOn !== null && !(isCountableDay(resumesOn) && resumesOn > today))
    throw new AppError("resumeDayInvalid", { day: resumesOn });
  const pause: DeckPause = {
    pausedAt: now.toISOString(),
    ...(resumesOn === null ? {} : { resumesOn }),
  };
  return { ...deck, pause };
}

/**
 * The deck resumed on `today`: its pause keeps its start, and today
 * becomes its resume day, so the backlog it left is known. A deck that
 * is not paused on `today` comes back as it is.
 */
export function withResume(deck: Deck, today: string): Deck {
  if (!isPaused(deck, today)) return deck;
  return { ...deck, pause: { pausedAt: deck.pause!.pausedAt, resumesOn: today } };
}
