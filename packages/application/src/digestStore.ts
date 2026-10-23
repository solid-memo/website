// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Card, Deck } from "@solid-memo/domain/deck";
import { isOutdated, isReviewStateOutdated } from "@solid-memo/domain/migration";
import { summarize } from "@solid-memo/domain/validation";
import {
  emptyDigest,
  scheduleOf,
  withReceipt,
  withSchedule,
  type DeckSchedule,
  type DocumentReceipt,
  type InstanceDigest,
} from "@solid-memo/domain/studyDigest";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import type { ReviewStates } from "@solid-memo/domain/review";
import { effectiveStates } from "@solid-memo/domain/fsrs";
import type {
  DeckRepository,
  ReviewStateRepository,
  ShapeValidator,
  DigestRepository,
} from "./ports";
import type { AnswerStore } from "./answerStore";
import type { PreferenceStore } from "./preferenceStore";

/** A digest change noting a document's receipt: at this version, it conformed or is in the latest format. */
export function noting(
  document: string,
  version: string,
  facts: Pick<DocumentReceipt, "conformedTo" | "latestFormat">,
) {
  return (digest: InstanceDigest) => withReceipt(digest, document, version, facts);
}

/** The deck's schedule from its documents, by the due days of the scheduler in use. */
export function scheduleFrom(
  cards: { value: Card[] },
  deck: Deck,
  reviews: { value: ReviewStates },
  prefs: Pick<StudyPreferences, "scheduler" | "dayBoundaryHour">,
  now: Date,
): DeckSchedule {
  const { scheduler, dayBoundaryHour } = prefs;
  return scheduleOf({
    cards: cards.value,
    direction: deck.direction,
    reviews: effectiveStates(reviews.value.sm2, reviews.value.fsrs, scheduler, dayBoundaryHour),
    scheduler,
    dayBoundaryHour,
    now,
  });
}

/**
 * Each instance's digest (domain/studyDigest.ts) as the use cases share
 * it: what this page learned of the instance's documents, its decks'
 * schedules and the documents' receipts, written back as it learns it.
 */
export function createDigestStore({
  digestRepository,
  deckRepository,
  reviewStateRepository,
  shapeValidator,
  ruleset,
  preferenceStore,
  answerStore,
  now,
}: {
  digestRepository: DigestRepository;
  deckRepository: DeckRepository;
  reviewStateRepository: ReviewStateRepository;
  shapeValidator: ShapeValidator;
  ruleset: string;
  preferenceStore: Pick<PreferenceStore, "get">;
  answerStore: Pick<AnswerStore, "flush">;
  now: () => Date;
}) {
  /**
   * Each instance's digest as this page knows it: read once, then kept up
   * to date with what the page learns, which is written back in the
   * background (a failed write only means the next visit learns it again).
   */
  const digests = new Map<string, Promise<InstanceDigest>>();
  function digestOf(instanceUrl: string): Promise<InstanceDigest> {
    let digest = digests.get(instanceUrl);
    if (digest === undefined) {
      digest = digestRepository.readDigest(instanceUrl).then(
        (stored) => stored ?? emptyDigest(),
        () => emptyDigest(),
      );
      digests.set(instanceUrl, digest);
    }
    return digest;
  }
  function remember(instanceUrl: string, change: (digest: InstanceDigest) => InstanceDigest): void {
    void digestOf(instanceUrl).then((digest) => {
      digests.set(instanceUrl, Promise.resolve(change(digest)));
      return digestRepository
        .updateDigest(instanceUrl, (stored) => change(stored ?? emptyDigest()))
        .catch(() => undefined);
    });
  }
  async function refreshStudyDigest(instanceUrl: string, deck: Deck): Promise<void> {
    await answerStore.flush();
    const [prefs, cards, reviews] = await Promise.all([
      preferenceStore.get(instanceUrl),
      deckRepository.readCardsSince(deck, undefined),
      reviewStateRepository.readReviewStatesSince(deck, undefined),
    ]);
    if (cards.unchanged || reviews.unchanged) return;
    noteSchedule(instanceUrl, deck, cards, reviews, prefs, now());
    // The session changed the reviews document: check it now (it is small), not at the next visit.
    const checked = await shapeValidator.validateDocumentSince(deck.reviewsDocumentUrl, undefined);
    if (
      !checked.unchanged &&
      checked.version !== null &&
      summarize(instanceUrl, [checked.value]).conforms
    ) {
      remember(
        instanceUrl,
        noting(deck.reviewsDocumentUrl, checked.version, { conformedTo: ruleset }),
      );
    }
  }
  function noteSchedule(
    instanceUrl: string,
    deck: Deck,
    cards: { value: Card[]; version: string | null },
    reviews: { value: ReviewStates; version: string | null },
    prefs: StudyPreferences,
    now: Date,
  ): void {
    recordSchedule(
      instanceUrl,
      deck,
      cards,
      reviews,
      scheduleFrom(cards, deck, reviews, prefs, now),
    );
  }
  /** Keeps a schedule already worked out in the digest, with the receipts the documents earned. */
  function recordSchedule(
    instanceUrl: string,
    deck: Deck,
    cards: { value: Card[]; version: string | null },
    reviews: { value: ReviewStates; version: string | null },
    schedule: DeckSchedule,
  ): void {
    const { version: cardsVersion } = cards;
    const { version: reviewsVersion } = reviews;
    if (cardsVersion === null || reviewsVersion === null) return;
    remember(instanceUrl, (digest) => {
      let next = withSchedule(digest, { deck: deck.url, cardsVersion, reviewsVersion, schedule });
      if (!cards.value.some(isOutdated))
        next = withReceipt(next, deck.cardsDocumentUrl, cardsVersion, { latestFormat: true });
      if (!reviews.value.sm2.some(isReviewStateOutdated)) {
        next = withReceipt(next, deck.reviewsDocumentUrl, reviewsVersion, { latestFormat: true });
      }
      return next;
    });
  }

  return {
    of: digestOf,
    remember,
    refresh: refreshStudyDigest,
    noteSchedule,
    recordSchedule,
  };
}

export type DigestStore = ReturnType<typeof createDigestStore>;
