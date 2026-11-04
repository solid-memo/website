// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Card, Deck } from "@solid-memo/domain/deck";
import { isOutdated, isReviewStateOutdated } from "@solid-memo/domain/migration";
import { summarize } from "@solid-memo/domain/validation";
import {
  addReceipt,
  changedDigest,
  scheduleOf,
  setSchedule,
  type DeckSchedule,
  type DigestChange,
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
  StorageGateway,
} from "./ports";
import type { AnswerStore } from "./answerStore";
import type { PreferenceStore } from "./preferenceStore";
import { isInInstancePod } from "./releaseDrafts";

/** A digest change noting a document's receipt: at this version, it conformed or is in the latest format. */
export function noting(
  document: string,
  version: string,
  facts: Pick<DocumentReceipt, "conformedTo" | "latestFormat">,
): DigestChange {
  return (draft) => addReceipt(draft, document, version, facts);
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
 * Of a deck, only what its documents say when both are the instance's
 * (isInInstancePod) for whoever is signed in: an instance attached from
 * someone else's pod may name documents of the user's own as a deck's,
 * and what is learned of those is the user's alone, not the digest's.
 */
export function createDigestStore({
  digestRepository,
  deckRepository,
  reviewStateRepository,
  shapeValidator,
  ruleset,
  preferenceStore,
  answerStore,
  storageGateway,
  webId,
  now,
}: {
  digestRepository: DigestRepository;
  deckRepository: DeckRepository;
  reviewStateRepository: ReviewStateRepository;
  shapeValidator: ShapeValidator;
  ruleset: string;
  preferenceStore: Pick<PreferenceStore, "get">;
  answerStore: Pick<AnswerStore, "flush">;
  storageGateway: Pick<StorageGateway, "discoverStorages">;
  /** The WebID of whoever is signed in, asked at each call; none when no one is. */
  webId: () => string | undefined;
  now: () => Date;
}) {
  /**
   * The storages of each WebID, found once per WebID for this page's use
   * cases: a deck list asks of every deck of the catalog, and each would
   * otherwise read the user's profile again. A search that failed is
   * not kept, so the next asks again.
   */
  const storagesFound = new Map<string, ReturnType<StorageGateway["discoverStorages"]>>();
  const storages: Pick<StorageGateway, "discoverStorages"> = {
    discoverStorages(user) {
      let found = storagesFound.get(user);
      if (found === undefined) {
        found = storageGateway.discoverStorages(user);
        storagesFound.set(user, found);
        found.catch(() => storagesFound.delete(user));
      }
      return found;
    },
  };
  /**
   * Whether what the document at `url` says may be kept in the
   * instance's digest: it is the instance's (isInInstancePod) for
   * whoever is signed in. With no one signed in, nothing is read as
   * anyone, so any is.
   */
  async function isInstances(instanceUrl: string, url: string): Promise<boolean> {
    const user = webId();
    return user === undefined || isInInstancePod(storages, instanceUrl, url, user);
  }
  /**
   * Which of the deck's documents are read as no one for the instance:
   * each that is not the instance's (isInstances).
   */
  async function asNoOneOf(instanceUrl: string, deck: Deck): Promise<DeckPlace> {
    const [cards, reviews] = await Promise.all([
      isInstances(instanceUrl, deck.cardsDocumentUrl),
      isInstances(instanceUrl, deck.reviewsDocumentUrl),
    ]);
    return { cards: !cards, reviews: !reviews };
  }
  /**
   * Each instance's digest as this page knows it: read once, then kept up
   * to date with what the page learns, which is written back in the
   * background (a failed write only means the next visit learns it again).
   * The page's own copy, each change made to it in place: a visit learns
   * a fact of each of the instance's documents, and copying the digest
   * for each would take time in their product. So what `of` gives is
   * the digest as it is now, read at once, not kept.
   */
  const digests = new Map<string, Promise<InstanceDigest>>();
  function digestOf(instanceUrl: string): Promise<InstanceDigest> {
    let digest = digests.get(instanceUrl);
    if (digest === undefined) {
      digest = digestRepository.readDigest(instanceUrl).then(
        (stored) => changedDigest(stored, []),
        () => changedDigest(null, []),
      );
      digests.set(instanceUrl, digest);
    }
    return digest;
  }
  function remember(instanceUrl: string, change: DigestChange): void {
    void digestOf(instanceUrl).then((digest) => {
      change(digest);
      return digestRepository.updateDigest(instanceUrl, change).catch(() => undefined);
    });
  }
  async function refreshStudyDigest(instanceUrl: string, deck: Deck): Promise<void> {
    await answerStore.flush();
    // A deck whose documents are not the instance's keeps nothing in its digest: nothing to read.
    if (!keepsDeck(await asNoOneOf(instanceUrl, deck))) return;
    const [prefs, cards, reviews] = await Promise.all([
      preferenceStore.get(instanceUrl),
      deckRepository.readCardsSince(deck, undefined),
      reviewStateRepository.readReviewStatesSince(deck, undefined),
    ]);
    if (cards.unchanged || reviews.unchanged) return;
    keepSchedule(
      instanceUrl,
      deck,
      cards,
      reviews,
      scheduleFrom(cards, deck, reviews, prefs, now()),
    );
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
  /**
   * Keeps the deck's schedule from its documents in the digest, with the
   * receipts they earned; nothing unless both are the instance's, as
   * `asNoOne` (asNoOneOf, worked out once by the caller) says.
   */
  function noteSchedule(
    instanceUrl: string,
    deck: Deck,
    cards: { value: Card[]; version: string | null },
    reviews: { value: ReviewStates; version: string | null },
    prefs: StudyPreferences,
    now: Date,
    asNoOne: DeckPlace,
  ): void {
    if (!keepsDeck(asNoOne)) return;
    keepSchedule(instanceUrl, deck, cards, reviews, scheduleFrom(cards, deck, reviews, prefs, now));
  }
  /**
   * Keeps a schedule already worked out in the digest, with the receipts
   * the documents earned; nothing for a deck whose documents are not
   * both the instance's (keepsDeck), however they were read.
   */
  function recordSchedule(
    instanceUrl: string,
    deck: Deck,
    cards: { value: Card[]; version: string | null },
    reviews: { value: ReviewStates; version: string | null },
    schedule: DeckSchedule,
  ): void {
    void asNoOneOf(instanceUrl, deck).then((asNoOne) => {
      if (keepsDeck(asNoOne)) keepSchedule(instanceUrl, deck, cards, reviews, schedule);
    });
  }
  /** recordSchedule, for a deck already found to be kept (keepsDeck). */
  function keepSchedule(
    instanceUrl: string,
    deck: Deck,
    cards: { value: Card[]; version: string | null },
    reviews: { value: ReviewStates; version: string | null },
    schedule: DeckSchedule,
  ): void {
    const { version: cardsVersion } = cards;
    const { version: reviewsVersion } = reviews;
    if (cardsVersion === null || reviewsVersion === null) return;
    remember(instanceUrl, (draft) => {
      setSchedule(draft, { deck: deck.url, cardsVersion, reviewsVersion, schedule });
      if (!cards.value.some(isOutdated))
        addReceipt(draft, deck.cardsDocumentUrl, cardsVersion, { latestFormat: true });
      if (!reviews.value.sm2.some(isReviewStateOutdated))
        addReceipt(draft, deck.reviewsDocumentUrl, reviewsVersion, { latestFormat: true });
    });
  }

  return {
    of: digestOf,
    asNoOneOf,
    isInstances,
    remember,
    refresh: refreshStudyDigest,
    noteSchedule,
    recordSchedule,
  };
}

/** Which of a deck's documents are read as no one for an instance (DigestStore.asNoOneOf). */
export interface DeckPlace {
  cards: boolean;
  reviews: boolean;
}

/** Whether what a deck's documents say may be kept in the instance's digest: both are the instance's. */
function keepsDeck(asNoOne: DeckPlace): boolean {
  return !asNoOne.cards && !asNoOne.reviews;
}

export type DigestStore = ReturnType<typeof createDigestStore>;
