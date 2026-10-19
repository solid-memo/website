// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { FsrsSnapshot, FsrsState, ReviewKey, ReviewSnapshot, ReviewState } from "./review";
import type { FsrsReviewStateV1, ReviewStateV2 } from "@solid-memo/vocab/types.generated";
import { SCHEDULERS, STUDY_DIRECTIONS } from "@solid-memo/vocab/concepts.generated";
import { conceptByIri, conceptByNotation, conceptOfDirection } from "./concepts";
import type { Deck } from "./deck";
import { isCardsDocumentOf } from "./deckUpgrade";
import { documentUrlOf, fragmentIdOf } from "./subjectUrl";

/**
 * Review states between their latest shape record and the model. A state
 * names its card (sm:reviewOf) and direction (sm:reviewDirection) since
 * vocabulary 1.16; before, and wherever another app leaves them out, the
 * state's subject is named after its card, `#<cardId>` for front→back
 * (every state written before directions existed, which is what they
 * were) and `#<cardId>@back-to-front` for the other way.
 *
 * An FSRS-6 state (vocabulary 1.21) always names its card and direction,
 * and is read by those links alone, never by its subject's name. This
 * app writes it at `#<cardId>@fsrs6` (front→back) or
 * `#<cardId>@back-to-front@fsrs6`, beside the SM-2 state of the same
 * prompt.
 */

export const BACK_TO_FRONT_SUFFIX = "@back-to-front";

/** What an FSRS-6 state's fragment ends with, after the SM-2 state's fragment of the same prompt. */
const FSRS6_SUFFIX = "@fsrs6";

/** The fragment of a card's review state in one direction. */
export function reviewFragmentOf(key: ReviewKey): string {
  return key.direction === "back-to-front" ? `${key.cardId}${BACK_TO_FRONT_SUFFIX}` : key.cardId;
}

/** The card and direction a review subject's fragment names. */
export function reviewKeyOf(fragment: string): ReviewKey {
  return fragment.endsWith(BACK_TO_FRONT_SUFFIX)
    ? {
        cardId: fragment.slice(0, -BACK_TO_FRONT_SUFFIX.length),
        direction: "back-to-front",
      }
    : { cardId: fragment, direction: "front-to-back" };
}

/**
 * The scheduler this app's SM-2 states belong to: a state that names none
 * is SM-2's too. Looked up by notation, not by its place in the scheme.
 */
export const SM2_SCHEDULER = conceptByNotation(SCHEDULERS, "sm2")!.iri;

/** The scheduler this app's FSRS-6 states belong to, which each names (sm:scheduler sm:fsrs6). */
export const FSRS6_SCHEDULER = conceptByNotation(SCHEDULERS, "fsrs6")!.iri;

/** What a stored review state says of what it is of, each absent when it does not say. */
export interface ReviewLinks {
  /** sm:reviewOf: the card. */
  reviewOf?: string;
  /** sm:reviewDirection: a concept of the StudyDirections scheme. */
  direction?: string;
  /**
   * True when sm:scheduler has a value other than the sm:sm2 IRI (another
   * concept, the sm:fsrs6 one too, or a literal): the state is not an
   * SM-2 state.
   */
  anotherScheduler?: boolean;
}

/** The deck a reviews document's states are read for: its id and where its cards are. */
export type ReviewedDeck = Pick<Deck, "id" | "cardsDocumentUrl">;

/**
 * The card and direction a stored review state of `deck` is of: what
 * its links say, each one it leaves out by the fragment rule on its
 * subject. sm:reviewOf names a subject of the deck's cards document, or
 * of one the deck's cards were in before an upgrade moved them
 * (isCardsDocumentOf): the card is its fragment either way. Null when
 * the state is not one this app schedules as SM-2: one of another
 * scheduler (kept, never read as SM-2), one of a card outside the deck,
 * one whose direction is not front to back or back to front, or one at a
 * subject named as an FSRS-6 state's (`…@fsrs6`) that does not name both
 * its card and its direction, as the fragment rule names no card there.
 */
export function reviewKeyOfSubject(
  subjectUrl: string,
  deck: ReviewedDeck,
  links: ReviewLinks,
): ReviewKey | null {
  if (links.anotherScheduler === true) return null;
  const fragment = fragmentIdOf(subjectUrl);
  if (fragment.endsWith(FSRS6_SUFFIX) && !named(links)) return null;
  const byName = reviewKeyOf(fragment);
  const cardId = links.reviewOf === undefined ? byName.cardId : cardOf(links.reviewOf, deck);
  if (cardId === null) return null;
  if (links.direction === undefined) return { cardId, direction: byName.direction };
  const direction = directionOf(links.direction);
  return direction === null ? null : { cardId, direction };
}

/** Whether the links name both the card and the direction. */
function named(links: ReviewLinks): links is ReviewLinks & { reviewOf: string; direction: string } {
  return links.reviewOf !== undefined && links.direction !== undefined;
}

/** The card sm:reviewOf names: its fragment, when it is in the deck's cards document (isCardsDocumentOf); else null. */
function cardOf(reviewOf: string, deck: ReviewedDeck): string | null {
  return reviewOf.includes("#") && isCardsDocumentOf(documentUrlOf(reviewOf), deck)
    ? fragmentIdOf(reviewOf)
    : null;
}

/** The direction sm:reviewDirection names; null for a concept that is neither front to back nor back to front. */
function directionOf(concept: string): ReviewKey["direction"] | null {
  const notation = conceptByIri(STUDY_DIRECTIONS, concept)?.notation;
  return notation === "front-to-back" || notation === "back-to-front" ? notation : null;
}

/**
 * The card and direction a stored FSRS-6 state of `deck` is of: what its
 * links name, as reviewKeyOfSubject reads them, both of which its shape
 * requires. Null when it leaves either out (the fragment rule is SM-2's
 * alone), or names a card outside the deck or another direction.
 */
export function fsrsKeyOfLinks(deck: ReviewedDeck, links: ReviewLinks): ReviewKey | null {
  if (!named(links)) return null;
  const cardId = cardOf(links.reviewOf, deck);
  const direction = directionOf(links.direction);
  return cardId === null || direction === null ? null : { cardId, direction };
}

/** The subject the fragment rule names for a card's state in one direction. */
export function namedReviewSubject(reviewsDocumentUrl: string, key: ReviewKey): string {
  return `${reviewsDocumentUrl}#${reviewFragmentOf(key)}`;
}

/** The subject this app names for a card's FSRS-6 state in one direction: the SM-2 state's, then `@fsrs6`. */
export function namedFsrsSubject(reviewsDocumentUrl: string, key: ReviewKey): string {
  return `${namedReviewSubject(reviewsDocumentUrl, key)}${FSRS6_SUFFIX}`;
}

/**
 * Of the states read from one reviews document, the one per card and
 * direction that counts: where several are of the same card and
 * direction, the one at the subject `named` names (by default the
 * fragment rule's; an FSRS-6 state's namedFsrsSubject), else the first
 * by subject IRI (code-unit order). The others are left in the
 * document, unread. In document order.
 */
export function pickReviewStates<T extends { url: string; key: ReviewKey }>(
  reviewsDocumentUrl: string,
  states: readonly T[],
  named: (reviewsDocumentUrl: string, key: ReviewKey) => string = namedReviewSubject,
): T[] {
  const picked = new Map<string, T>();
  const keyOf = (key: ReviewKey) => `${key.direction}/${key.cardId}`;
  const rank = (state: T) => (state.url === named(reviewsDocumentUrl, state.key) ? 0 : 1);
  for (const state of states) {
    const current = picked.get(keyOf(state.key));
    if (
      current === undefined ||
      rank(state) < rank(current) ||
      (rank(state) === rank(current) && state.url < current.url)
    ) {
      picked.set(keyOf(state.key), state);
    }
  }
  const kept = new Set(picked.values());
  return states.filter((state) => kept.has(state));
}

/**
 * The state from its record. The snapshot is all or nothing: a partial
 * one could only restore a state that never existed, so it reads as
 * absent.
 */
export function reviewStateFromRecord(
  key: ReviewKey,
  storedVersion: number,
  data: ReviewStateV2,
): ReviewState {
  const previous = snapshotOf(data);
  return {
    ...key,
    easeFactor: data.easeFactor,
    intervalDays: data.intervalDays,
    repetitions: data.repetitions,
    due: data.due,
    firstReviewedAt: data.firstReviewedAt,
    lastReviewedAt: data.lastReviewedAt,
    formatVersion: storedVersion,
    ...(previous === undefined ? {} : { previous }),
  };
}

function snapshotOf(data: ReviewStateV2): ReviewSnapshot | undefined {
  if (
    data.previousEaseFactor === undefined ||
    data.previousIntervalDays === undefined ||
    data.previousRepetitions === undefined ||
    data.previousDue === undefined ||
    data.previousLastReviewedAt === undefined
  ) {
    return undefined;
  }
  return {
    easeFactor: data.previousEaseFactor,
    intervalDays: data.previousIntervalDays,
    repetitions: data.previousRepetitions,
    due: data.previousDue,
    lastReviewedAt: data.previousLastReviewedAt,
  };
}

/**
 * The state's record, naming its card (a subject of `cardsDocumentUrl`),
 * its direction and SM-2 as its scheduler.
 */
export function reviewStateToRecord(state: ReviewState, cardsDocumentUrl: string): ReviewStateV2 {
  return {
    easeFactor: state.easeFactor,
    intervalDays: state.intervalDays,
    repetitions: state.repetitions,
    due: state.due,
    firstReviewedAt: state.firstReviewedAt,
    lastReviewedAt: state.lastReviewedAt,
    ...(state.previous === undefined
      ? {}
      : {
          previousEaseFactor: state.previous.easeFactor,
          previousIntervalDays: state.previous.intervalDays,
          previousRepetitions: state.previous.repetitions,
          previousDue: state.previous.due,
          previousLastReviewedAt: state.previous.lastReviewedAt,
        }),
    reviewOf: `${cardsDocumentUrl}#${state.cardId}`,
    direction: conceptOfDirection(state.direction) as NonNullable<ReviewStateV2["direction"]>,
    scheduler: SM2_SCHEDULER,
  };
}

/** The FSRS-6 state from its record; a partial snapshot reads as absent, as an SM-2 state's does. */
export function fsrsReviewStateFromRecord(
  key: ReviewKey,
  storedVersion: number,
  data: FsrsReviewStateV1,
): FsrsState {
  const previous = fsrsSnapshotOf(data);
  return {
    ...key,
    stability: data.stability,
    difficulty: data.difficulty,
    due: data.due,
    firstReviewedAt: data.firstReviewedAt,
    lastReviewedAt: data.lastReviewedAt,
    formatVersion: storedVersion,
    ...(previous === undefined ? {} : { previous }),
  };
}

function fsrsSnapshotOf(data: FsrsReviewStateV1): FsrsSnapshot | undefined {
  if (
    data.previousStability === undefined ||
    data.previousDifficulty === undefined ||
    data.previousDue === undefined ||
    data.previousLastReviewedAt === undefined
  ) {
    return undefined;
  }
  return {
    stability: data.previousStability,
    difficulty: data.previousDifficulty,
    due: data.previousDue,
    lastReviewedAt: data.previousLastReviewedAt,
  };
}

/**
 * The FSRS-6 state's record, naming its card (a subject of
 * `cardsDocumentUrl`) and direction; its scheduler, sm:fsrs6, is the
 * value its shape fixes, which writing it states.
 */
export function fsrsReviewStateToRecord(
  state: FsrsState,
  cardsDocumentUrl: string,
): FsrsReviewStateV1 {
  return {
    reviewOf: `${cardsDocumentUrl}#${state.cardId}`,
    direction: conceptOfDirection(state.direction) as FsrsReviewStateV1["direction"],
    stability: state.stability,
    difficulty: state.difficulty,
    due: state.due,
    firstReviewedAt: state.firstReviewedAt,
    lastReviewedAt: state.lastReviewedAt,
    ...(state.previous === undefined
      ? {}
      : {
          previousStability: state.previous.stability,
          previousDifficulty: state.previous.difficulty,
          previousDue: state.previous.due,
          previousLastReviewedAt: state.previous.lastReviewedAt,
        }),
  };
}
