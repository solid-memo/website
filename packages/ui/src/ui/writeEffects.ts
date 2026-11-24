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
  /** Both of the deck's documents: a card removed with its review states, say. */
  cardsAndReviews: (deck: Deck): WriteEffect => ({
    stale: [queryKeys.cards(deck.cardsDocumentUrl), queryKeys.reviews(deck.reviewsDocumentUrl)],
    drop: [queryKeys.studyQueue(deck.url)],
  }),
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
};

/**
 * A mutation that writes to the pod, and refreshes what it changed
 * (`changes`) as it ends, written or not: a write of several documents
 * may stop part-way, after it changed some. The refresh is over before
 * the mutation's own onSuccess or onError is called, so one that opens
 * another screen opens it on what was written.
 */
export function useWrite<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
>({
  changes: changed,
  onSuccess,
  onError,
  ...options
}: WriteOptions<TData, TError, TVariables, TOnMutateResult>): UseMutationResult<
  TData,
  TError,
  TVariables,
  TOnMutateResult
> {
  return useMutation({
    ...options,
    onSuccess: async (data, variables, onMutateResult, context) => {
      await refresh(context.client, changed(variables, { data, error: null }));
      return onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: async (error, variables, onMutateResult, context) => {
      await refresh(context.client, changed(variables, { data: undefined, error }));
      return onError?.(error, variables, onMutateResult, context);
    },
  });
}
