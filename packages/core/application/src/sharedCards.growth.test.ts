// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Many decks that name one cards document are worked out in time that
 * grows with the decks and the cards, not their product: the card
 * progress of every deck (Statistics) and each deck's study counts (the
 * deck list). The repository maps a read of the document once, to one
 * frozen array the decks share (solidDeckRepository.ts cardsOf), as the
 * fakes here give it; what is derived of the cards is then worked out
 * once, and each deck goes by its own review states. When the decks name
 * one reviews document too, its states are mapped once as well
 * (reviewStateMapper.ts sharedReviewStatesOf), and what the decks' cards
 * and states give is worked out once for all of them; each state is due
 * on a day of its own, and each deck's forecast, overdue prompts and
 * counts are looked up in the sums of the shared schedule (dueDays.ts),
 * not summed of every due day for each deck. Eight times as many
 * decks of eight times as many cards must take less than four times as
 * long as an eighth of them done eight times over (testing.md).
 */
import { describe, expect, it, vi } from "vitest";
import { shiftStudyDay } from "@solid-memo/domain/answer";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ReviewState, ReviewStates } from "@solid-memo/domain/review";
import { emptyDigest } from "@solid-memo/domain/studyDigest";
import { growthAsync } from "@solid-memo/domain/testing/growth";
import { createDeckPauseUseCases } from "./deckPauses";
import { createStatisticsUseCases } from "./statistics";
import { createStudyUseCases } from "./study";
import { card, deck, instance, makeDeps, sm2s } from "./testing/fakePorts";

const AT = new Date(2026, 8, 21, 12, 0);
const SHARED = `${instance.url}decks/shared.ttl`;

/**
 * `count` decks that name one cards document of `count` cards, each deck
 * with a state of one of them, or, `sharedReviews`, all naming one
 * reviews document with a state of each card. Each `read()` reads the
 * documents afresh, as a new download: one array of cards and one of
 * states, as the repository maps a read once, that every deck naming the
 * document is given.
 */
function sharedDecks(count: number, sharedReviews = false) {
  const decks = Array.from(
    { length: count },
    (_, n): Deck => ({
      ...deck,
      // Resumed yesterday: each deck has a comeback (getComeback).
      pause: { pausedAt: "2026-09-01T10:00:00.000Z", resumesOn: "2026-09-20" },
      id: `deck-${n}`,
      url: `${instance.url}catalog.ttl#deck-${n}`,
      cardsDocumentUrl: SHARED,
      reviewsDocumentUrl: `${instance.url}reviews/${sharedReviews ? "shared" : `deck-${n}`}.ttl`,
    }),
  );
  const stateOf = (n: number): ReviewState => ({
    cardId: `card-${n}`,
    direction: "front-to-back",
    easeFactor: 2.5,
    intervalDays: 3,
    repetitions: 1,
    // A day of its own, before the decks resumed: the schedule has as many due days as states.
    due: shiftStudyDay("2026-09-19", -n),
    firstReviewedAt: "2026-09-18T10:00:00.000Z",
    lastReviewedAt: "2026-09-18T10:00:00.000Z",
    formatVersion: 2,
  });
  let cards: readonly Card[] = [];
  let states = new Map<string, ReviewStates>();
  const read = () => {
    cards = Object.freeze(
      Array.from({ length: count }, (_, n) => ({
        ...card,
        id: `card-${n}`,
        url: `${SHARED}#card-${n}`,
      })),
    );
    const everyState: ReviewStates = {
      sm2: Array.from({ length: count }, (_, n) => stateOf(n)),
      fsrs: [],
    };
    Object.freeze(everyState.sm2);
    Object.freeze(everyState.fsrs);
    Object.freeze(everyState);
    states = new Map(
      decks.map((one, n) => [one.url, sharedReviews ? everyState : sm2s([stateOf(n)])]),
    );
  };
  const deps = makeDeps();
  vi.mocked(deps.deckRepository.listDecks).mockResolvedValue(decks);
  vi.mocked(deps.deckRepository.readCardsSince).mockImplementation(async () => ({
    unchanged: false,
    value: cards as Card[],
    version: '"cards"',
  }));
  vi.mocked(deps.deckRepository.listCards).mockImplementation(async () => cards as Card[]);
  vi.mocked(deps.reviewStateRepository.listReviewStates).mockImplementation(
    async (one: Deck) => states.get(one.url)!,
  );
  vi.mocked(deps.reviewStateRepository.readReviewStatesSince).mockImplementation(
    async (one: Deck) => ({
      unchanged: false,
      value: states.get(one.url)!,
      version: '"reviews"',
    }),
  );
  return { deps, decks, read };
}

describe.each([
  { documents: "one cards document", sharedReviews: false },
  { documents: "one cards and one reviews document", sharedReviews: true },
])("decks that share $documents", { timeout: 180_000 }, ({ sharedReviews }) => {
  it("have their card progress worked out in time that grows with them, not their product", async () => {
    const ratio = await growthAsync(
      (count) => {
        const { deps, read } = sharedDecks(count, sharedReviews);
        const statistics = createStatisticsUseCases({
          ...deps,
          preferenceStore: { get: async () => DEFAULT_PREFERENCES },
          answerStore: {
            flush: async () => undefined,
            readMonths: async () => [],
            logMonths: async () => [],
            loadAll: async () => [],
            knownAnswers: () => null,
          },
          digestStore: {
            of: async () => emptyDigest(),
            recordSchedule: () => undefined,
            remember: () => undefined,
          },
        });
        return async () => {
          read();
          const progress = await statistics.getCardProgress(instance.url, AT);
          expect(progress.decks).toHaveLength(count);
          expect(progress.decks[0]!.progress).toMatchObject(
            sharedReviews ? { new: 0, young: count } : { new: count - 1, young: 1 },
          );
        };
      },
      300,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("have their study counts worked out in time that grows with them, not their product", async () => {
    const ratio = await growthAsync(
      (count) => {
        const { deps, decks, read } = sharedDecks(count, sharedReviews);
        const study = createStudyUseCases({
          ...deps,
          preferenceStore: { get: async () => DEFAULT_PREFERENCES },
          digestStore: {
            of: async () => emptyDigest(),
            asNoOneOf: async () => ({ cards: false, reviews: false }),
            noteSchedule: () => undefined,
            refresh: async () => undefined,
          },
          answerStore: {
            grade: async () => undefined as never,
            withdraw: async () => undefined,
            removeDay: async () => undefined,
          },
          random: () => 0,
        });
        return async () => {
          read();
          const counts = await Promise.all(
            decks.map((one) => study.getStudyCounts(instance.url, one, AT)),
          );
          expect(counts[0]).toEqual(
            sharedReviews
              ? {
                  dueCount: Math.min(count, DEFAULT_PREFERENCES.maxReviewsPerDay),
                  newCount: 0,
                  // Every card reviewed: none left to learn.
                  learned: true,
                }
              : {
                  dueCount: 1,
                  newCount: Math.min(count - 1, DEFAULT_PREFERENCES.newCardsPerDay),
                  // One card reviewed: learned only when it is the deck's one card.
                  learned: count === 1,
                },
          );
        };
      },
      300,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  });
  it("have their comebacks worked out in time that grows with them, not their product", async () => {
    const ratio = await growthAsync(
      (count) => {
        const { deps, decks, read } = sharedDecks(count, sharedReviews);
        const pauses = createDeckPauseUseCases({
          ...deps,
          preferenceStore: { get: async () => DEFAULT_PREFERENCES },
        });
        return async () => {
          read();
          const comebacks = await Promise.all(
            decks.map((one) => pauses.getComeback(instance.url, one, AT)),
          );
          expect(comebacks[0]).toMatchObject({ waiting: sharedReviews ? count : 1 });
        };
      },
      2000,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  });
});
