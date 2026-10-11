import type { Catalog } from "./catalog";
import {
  CARD_FORMAT_VERSION,
  DECK_FORMAT_VERSION,
  type Card,
  type Deck,
} from "./deck";
import { INSTANCE_FORMAT_VERSION, type InstanceMeta } from "./instance";
import { PREFERENCES_FORMAT_VERSION, type StoredPreferences } from "./preferences";
import { REVIEW_STATE_FORMAT_VERSION, type ReviewState } from "./review";

/**
 * Format migrations: bringing data written by an older Solid Memo up to
 * the format this one writes (see docs/migrations.md). Everything here is
 * pure; the application layer does the reading and writing. Content is
 * already brought up to date when it is read (domain/shapes/migrations);
 * what a pod migration writes is the same content stamped with the
 * current version.
 */

/** True when the card is stored in an older format than this app writes. */
export function isOutdated(card: Card): boolean {
  return card.formatVersion < CARD_FORMAT_VERSION;
}

/** The card as this app writes it: the same content, current version. */
export function upgradeCard(card: Card): Card {
  return isOutdated(card) ? { ...card, formatVersion: CARD_FORMAT_VERSION } : card;
}

/** True when the deck's catalog entry is in an older format than this app writes. */
export function isDeckOutdated(deck: Deck): boolean {
  return deck.formatVersion < DECK_FORMAT_VERSION;
}

/**
 * The deck as this app writes it. A format-1 deck read without a
 * direction is already front→back; the write then states it.
 */
export function upgradeDeck(deck: Deck): Deck {
  return isDeckOutdated(deck)
    ? { ...deck, formatVersion: DECK_FORMAT_VERSION }
    : deck;
}

/** True when the review state is stored in an older format than this app writes. */
export function isReviewStateOutdated(state: ReviewState): boolean {
  return state.formatVersion < REVIEW_STATE_FORMAT_VERSION;
}

/** The review state as this app writes it: the same state, current version. */
export function upgradeReviewState(state: ReviewState): ReviewState {
  return isReviewStateOutdated(state)
    ? { ...state, formatVersion: REVIEW_STATE_FORMAT_VERSION }
    : state;
}

/** True when the preferences document is in an older format than this app writes. */
export function isPreferencesOutdated(stored: StoredPreferences): boolean {
  return stored.formatVersion < PREFERENCES_FORMAT_VERSION;
}

/** True when the instance's meta document is in an older format than this app writes. */
export function isInstanceOutdated(meta: InstanceMeta): boolean {
  return meta.formatVersion < INSTANCE_FORMAT_VERSION;
}

/** What a migration would touch, for the user to approve first. */
export interface MigrationPlan {
  /** Decks with an outdated entry, outdated cards or outdated review states. */
  decks: {
    deck: Deck;
    deckOutdated: boolean;
    cardCount: number;
    reviewCount: number;
  }[];
  /** Outdated deck entries across the instance. */
  deckCount: number;
  /** Outdated cards across the instance. */
  cardCount: number;
  /** Outdated review states across the instance. */
  reviewCount: number;
  preferencesOutdated: boolean;
  instanceOutdated: boolean;
  /**
   * The instance has no catalog (a dcat:Catalog of its decks, since
   * deck format 3): the update describes it as one and registers it.
   */
  catalogMissing: boolean;
}

/** Plan the migration of an instance from everything it holds. */
export function planMigration(input: {
  instance: InstanceMeta | null;
  preferences: StoredPreferences | null;
  catalog: Catalog | null;
  entries: { deck: Deck; cards: Card[]; reviews: ReviewState[] }[];
}): MigrationPlan {
  const decks = input.entries
    .map(({ deck, cards, reviews }) => ({
      deck,
      deckOutdated: isDeckOutdated(deck),
      cardCount: cards.filter(isOutdated).length,
      reviewCount: reviews.filter(isReviewStateOutdated).length,
    }))
    .filter(
      ({ deckOutdated, cardCount, reviewCount }) =>
        deckOutdated || cardCount > 0 || reviewCount > 0,
    );
  return {
    decks,
    deckCount: decks.filter(({ deckOutdated }) => deckOutdated).length,
    cardCount: decks.reduce((sum, { cardCount }) => sum + cardCount, 0),
    reviewCount: decks.reduce((sum, { reviewCount }) => sum + reviewCount, 0),
    preferencesOutdated:
      input.preferences !== null && isPreferencesOutdated(input.preferences),
    instanceOutdated: input.instance !== null && isInstanceOutdated(input.instance),
    catalogMissing: input.catalog === null,
  };
}

/** True when nothing is outdated. */
export function isPlanEmpty(plan: MigrationPlan): boolean {
  return (
    plan.decks.length === 0 &&
    !plan.preferencesOutdated &&
    !plan.instanceOutdated &&
    !plan.catalogMissing
  );
}
