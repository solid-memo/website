// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  useMutation,
  type DefaultError,
  type QueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { Deck } from "@solid-memo/domain/deck";
import { queryKeys } from "./queryKeys";

/**
 * What a write makes stale of the reads the screens cached
 * (docs/architecture.md#what-a-write-refreshes): the queries to read
 * again (`stale`), and those to drop (`drop`), which a screen opened
 * later must not show as they were, even while it reads them again.
 */
export interface WriteEffect {
  readonly stale: readonly QueryKey[];
  readonly drop: readonly QueryKey[];
}

/** The prefix of every query key: refreshing it reaches every query. */
const EVERY_QUERY: QueryKey = [];

/**
 * Each kind of write, and what it makes stale: a screen names the
 * writes it made, never the keys. A deck's study queue (with its study
 * counts, pause outlook and comeback under it) is built from the deck's
 * entry, its cards, its review states and the instance's preferences,
 * so a write of any of them drops it. The statistics, the cards'
 * progress and their answers are read again after every write, made
 * or not (keepStudyFiguresFresh), so no effect names them.
 */
export const changes = {
  /** The deck's cards document. */
  cards: (deck: Deck): WriteEffect => ({
    stale: [queryKeys.cards(deck.cardsDocumentUrl)],
    drop: [queryKeys.studyQueue(deck.url)],
  }),
  /** The deck's reviews document. */
  reviews: (deck: Deck): WriteEffect => ({
    stale: [queryKeys.reviews(deck.reviewsDocumentUrl)],
    drop: [queryKeys.studyQueue(deck.url)],
  }),
  /** Both of the deck's documents: a card removed with its review states, say. */
  cardsAndReviews: (deck: Deck): WriteEffect => ({
    stale: [queryKeys.cards(deck.cardsDocumentUrl), queryKeys.reviews(deck.reviewsDocumentUrl)],
    drop: [queryKeys.studyQueue(deck.url)],
  }),
  /** A deck's entry, in what it shows: its title, description or card language, say. */
  deckEntry: (): WriteEffect => ({ stale: [queryKeys.allDecks()], drop: [] }),
  /** A deck's entry, in what it studies: its pace, direction or pause. */
  deckSchedule: (deck: Deck): WriteEffect => ({
    stale: [queryKeys.allDecks()],
    drop: [queryKeys.studyQueue(deck.url)],
  }),
  /** An instance's decks, one added or removed. */
  decks: (instanceUrl: string): WriteEffect => ({
    stale: [queryKeys.decks(instanceUrl)],
    drop: [],
  }),
  /** Many of an instance's decks at once, their study queues with them: a bulk edit, or a file imported. */
  manyDecks: (instanceUrl: string): WriteEffect => ({
    stale: [queryKeys.decks(instanceUrl)],
    drop: [queryKeys.allStudyQueues()],
  }),
  /**
   * A deck moved to another release of the library: its entry, both
   * documents, the instance's format update plan, which counts the
   * copies' releases, and a course's outline, which the release has.
   */
  upgraded: (instanceUrl: string, deck: Deck): WriteEffect => ({
    stale: [
      queryKeys.allDecks(),
      queryKeys.cards(deck.cardsDocumentUrl),
      queryKeys.reviews(deck.reviewsDocumentUrl),
      queryKeys.migration(instanceUrl),
      queryKeys.course(deck.url),
    ],
    drop: [queryKeys.studyQueue(deck.url)],
  }),
  /** A WebID's instances, one added to its list. */
  instances: (webId: string): WriteEffect => ({ stale: [queryKeys.instances(webId)], drop: [] }),
  /** A course's progress through its chapters. */
  course: (deck: Deck): WriteEffect => ({ stale: [queryKeys.course(deck.url)], drop: [] }),
  /**
   * An instance's preferences: every deck's study queue is built with
   * them, whether logging in shows the Connected screen is among them,
   * and so is how the app is shown, once they are first saved.
   */
  preferences: (instanceUrl: string): WriteEffect => ({
    stale: [
      queryKeys.preferences(instanceUrl),
      queryKeys.connectedScreenShown(instanceUrl),
      queryKeys.instanceAppearance(instanceUrl),
    ],
    drop: [queryKeys.allStudyQueues()],
  }),
  /** The scheduler switched, and with it the due days every view of the decks shows. */
  scheduler: (): WriteEffect => ({ stale: [EVERY_QUERY], drop: [queryKeys.allStudyQueues()] }),
  /** Data of one screen alone, read with these keys: a palette, a release's draft, say. */
  reads: (...keys: readonly QueryKey[]): WriteEffect => ({ stale: keys, drop: [] }),
  /** Data any screen may show: an instance's documents updated to newer formats, say. */
  everything: (): WriteEffect => ({ stale: [EVERY_QUERY], drop: [] }),
};

/**
 * Refreshes what the writes made stale. A query to drop is dropped
 * unless a screen shows it, and read again if one does, so the screen
 * never goes on showing what was dropped; a stale query is read again
 * if a screen shows it, and else as one is opened.
 */
export async function refresh(
  queryClient: QueryClient,
  effects: readonly WriteEffect[],
): Promise<void> {
  const drop = effects.flatMap((effect) => effect.drop);
  for (const queryKey of drop) queryClient.removeQueries({ queryKey, type: "inactive" });
  await Promise.all(
    [...effects.flatMap((effect) => effect.stale), ...drop].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

/** The options of a write (useWrite): a mutation's, and what it changes. */
export type WriteOptions<TData, TError, TVariables, TOnMutateResult> = UseMutationOptions<
  TData,
  TError,
  TVariables,
  TOnMutateResult
> & {
  /**
   * What the write makes stale, of what was written: given the
   * variables, and the data or the error it ended with.
   */
  changes: (
    variables: TVariables,
    ended: { data: TData; error: null } | { data: undefined; error: TError },
  ) => readonly WriteEffect[];
  /**
   * Start the refresh and go on, without waiting for it: for a write the
   * screen answers at once, and whose screen stays as it is meanwhile.
   */
  background?: boolean;
};

/**
 * A mutation that writes to the pod, and refreshes what it changed
 * (`changes`) as it ends, written or not: a write of several documents
 * may stop part-way, after it changed some. The refresh is over before
 * the mutation's own onSuccess or onError is called, so one that opens
 * another screen opens it on what was written; unless it is made in the
 * `background`, while the mutation ends at once.
 */
export function useWrite<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
>({
  changes: changed,
  background = false,
  onSuccess,
  onError,
  ...options
}: WriteOptions<TData, TError, TVariables, TOnMutateResult>): UseMutationResult<
  TData,
  TError,
  TVariables,
  TOnMutateResult
> {
  const refreshed = (client: QueryClient, effects: readonly WriteEffect[]) => {
    const done = refresh(client, effects);
    return background ? undefined : done;
  };
  return useMutation({
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      await refreshed(context.client, changed(variables, { data, error: null }));
      return onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: async (error, variables, onMutateResult, context) => {
      await refreshed(context.client, changed(variables, { data: undefined, error }));
      return onError?.(error, variables, onMutateResult, context);
    },
  });
}
