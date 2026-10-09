import type { ReviewKey, ReviewSnapshot, ReviewState } from "./review";
import type { ReviewStateV2 } from "@solid-memo/vocab/types.generated";
import { SCHEDULERS, STUDY_DIRECTIONS } from "@solid-memo/vocab/concepts.generated";
import { conceptByIri, conceptOfDirection } from "./concepts";
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
 */

export const BACK_TO_FRONT_SUFFIX = "@back-to-front";

/** The fragment of a card's review state in one direction. */
export function reviewFragmentOf(key: ReviewKey): string {
  return key.direction === "back-to-front"
    ? `${key.cardId}${BACK_TO_FRONT_SUFFIX}`
    : key.cardId;
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

/** The scheduler this app's states belong to, SM-2: a state that names none is SM-2's too. */
export const SM2_SCHEDULER = SCHEDULERS.concepts[0].iri;

/** What a stored review state says of what it is of, each absent when it does not say. */
export interface ReviewLinks {
  /** sm:reviewOf: the card. */
  reviewOf?: string;
  /** sm:reviewDirection: a concept of the StudyDirections scheme. */
  direction?: string;
  /**
   * True when sm:scheduler has a value other than the sm:sm2 IRI (another
   * concept, or a literal): the state is another scheduler's.
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
 * the state is not one this app schedules: one of another scheduler
 * (kept, never read as SM-2), one of a card outside the deck, or one
 * whose direction is not front to back or back to front.
 */
export function reviewKeyOfSubject(subjectUrl: string, deck: ReviewedDeck, links: ReviewLinks): ReviewKey | null {
  if (links.anotherScheduler === true) return null;
  const named = reviewKeyOf(fragmentIdOf(subjectUrl));
  let cardId = named.cardId;
  if (links.reviewOf !== undefined) {
    if (!links.reviewOf.includes("#") || !isCardsDocumentOf(documentUrlOf(links.reviewOf), deck)) return null;
    cardId = fragmentIdOf(links.reviewOf);
  }
  if (links.direction === undefined) return { cardId, direction: named.direction };
  const notation = conceptByIri(STUDY_DIRECTIONS, links.direction)?.notation;
  if (notation !== "front-to-back" && notation !== "back-to-front") return null;
  return { cardId, direction: notation };
}

/** The subject the fragment rule names for a card's state in one direction. */
export function namedReviewSubject(reviewsDocumentUrl: string, key: ReviewKey): string {
  return `${reviewsDocumentUrl}#${reviewFragmentOf(key)}`;
}

/**
 * Of the states read from one reviews document, the one per card and
 * direction that counts: where several are of the same card and
 * direction, the one at the subject the fragment rule names, else the
 * first by subject IRI (code-unit order). The others are left in the
 * document, unread. In document order.
 */
export function pickReviewStates<T extends { url: string; key: ReviewKey }>(
  reviewsDocumentUrl: string,
  states: readonly T[],
): T[] {
  const picked = new Map<string, T>();
  const keyOf = (key: ReviewKey) => `${key.direction}/${key.cardId}`;
  const rank = (state: T) => (state.url === namedReviewSubject(reviewsDocumentUrl, state.key) ? 0 : 1);
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
