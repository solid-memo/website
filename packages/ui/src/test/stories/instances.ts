// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { CARD_FORMAT_VERSION, DECK_FORMAT_VERSION } from "@solid-memo/domain/deck";
import type { UpdateOutcome } from "@solid-memo/domain/instanceUpdate";
import type { MigrationPlan } from "@solid-memo/domain/migration";
import { PREFERENCES_FORMAT_VERSION } from "@solid-memo/domain/preferences";
import { REVIEW_STATE_FORMAT_VERSION } from "@solid-memo/domain/review";
import {
  arabicDeck,
  kanjiDeck,
  koreanDeck,
  longTitleDeck,
  storyDeck,
  storyInstance,
} from "../storyData";

/**
 * Data the stories of an instance's update share (src/ui/Migration*.stories.tsx
 * and InstanceUpdate's): what an update would touch, and what one could
 * not do. Nothing here is read from or written to a pod.
 */

/** An instance with nothing in an older format: no update to offer. */
export const upToDatePlan: MigrationPlan = {
  decks: [],
  deckCount: 0,
  cardCount: 0,
  reviewCount: 0,
  preferencesOutdated: false,
  instanceOutdated: false,
  catalogMissing: false,
  oldestFormat: {
    deck: DECK_FORMAT_VERSION,
    card: CARD_FORMAT_VERSION,
    reviewState: REVIEW_STATE_FORMAT_VERSION,
    preferences: PREFERENCES_FORMAT_VERSION,
  },
};

/** An instance from the first formats: its record, catalog, preferences and decks to update. */
export const outdatedPlan: MigrationPlan = {
  decks: [
    { deck: kanjiDeck, deckOutdated: true, cardCount: 80, reviewCount: 42 },
    { deck: koreanDeck, deckOutdated: false, cardCount: 120, reviewCount: 0 },
    { deck: arabicDeck, deckOutdated: true, cardCount: 0, reviewCount: 12 },
    { deck: longTitleDeck, deckOutdated: true, cardCount: 1, reviewCount: 1 },
  ],
  deckCount: 3,
  cardCount: 201,
  reviewCount: 55,
  preferencesOutdated: true,
  instanceOutdated: true,
  catalogMissing: true,
  oldestFormat: { deck: 1, card: 1, reviewState: 1, preferences: 1 },
};

/** An instance with more outdated decks than the notice lists. */
export const manyDecksPlan: MigrationPlan = {
  ...upToDatePlan,
  decks: Array.from({ length: 60 }, (_, at) => ({
    deck: storyDeck(`deck-${at}`, { en: `Deck ${at + 1}` }),
    deckOutdated: true,
    cardCount: 10,
    reviewCount: 0,
  })),
  deckCount: 60,
  oldestFormat: { ...upToDatePlan.oldestFormat, deck: DECK_FORMAT_VERSION - 1 },
};

/** An update that left a few documents as they were, each with why. */
export const unfinishedUpdate: UpdateOutcome = {
  updated: [
    { url: `${storyInstance.url}index.ttl`, holds: "instance" },
    { url: `${storyInstance.url}catalog.ttl`, holds: "catalog" },
  ],
  failed: [
    {
      url: kanjiDeck.cardsDocumentUrl,
      holds: "cards",
      deck: kanjiDeck.title,
      error: new AppError("changedElsewhere"),
    },
    {
      url: arabicDeck.reviewsDocumentUrl,
      holds: "reviews",
      deck: arabicDeck.title,
      error: new AppError("writeRefused"),
    },
    {
      url: `${storyInstance.url}preferences.ttl`,
      holds: "preferences",
      error: new AppError("cannotCheck"),
    },
  ],
};
