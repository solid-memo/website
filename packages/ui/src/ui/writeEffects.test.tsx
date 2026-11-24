// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { act, renderHook, waitFor } from "@testing-library/preact";
import type { ComponentChildren } from "preact";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import { changes, refresh, useWrite } from "./writeEffects";

const deck = {
  url: "https://pod.example/memo/decks/d1/index.ttl#deck",
  cardsDocumentUrl: "https://pod.example/memo/decks/d1/cards.ttl",
  reviewsDocumentUrl: "https://pod.example/memo/decks/d1/reviews.ttl",
} as Deck;

describe("changes", () => {
  it("names the keys a write of a deck's documents makes stale, and those it drops", () => {
    expect(changes.cardsAndReviews(deck)).toEqual({
      stale: [
        ["cards", deck.cardsDocumentUrl],
        ["reviews", deck.reviewsDocumentUrl],
      ],
      drop: [["studyQueue", deck.url]],
    });
  });
});

describe("refresh", () => {
  it("drops what no screen shows, and reads again what one does", async () => {
    const queryClient = new QueryClient();
    const shownKey = ["studyQueue", deck.url, "counts"];
    queryClient.setQueryData(["studyQueue", deck.url], "queue");
    queryClient.setQueryData(shownKey, "counts");
    const read = vi.fn(async () => "counts afresh");
    const observer = new QueryObserver(queryClient, { queryKey: shownKey, queryFn: read });
    const unsubscribe = observer.subscribe(() => undefined);

    await refresh(queryClient, [changes.cardsAndReviews(deck)]);

    expect(queryClient.getQueryData(["studyQueue", deck.url])).toBeUndefined();
    expect(read).toHaveBeenCalled();
    expect(queryClient.getQueryData(shownKey)).toBe("counts afresh");
    unsubscribe();
  });

  it("marks what it makes stale, shown or not", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["cards", deck.cardsDocumentUrl], []);
    queryClient.setQueryData(["reviews", deck.reviewsDocumentUrl], []);

    await refresh(queryClient, [changes.cardsAndReviews(deck)]);

    expect(queryClient.getQueryState(["cards", deck.cardsDocumentUrl])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["reviews", deck.reviewsDocumentUrl])?.isInvalidated).toBe(
      true,
    );
  });
});

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children?: ComponentChildren }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useWrite", () => {
  it("refreshes what a write made stale before its own onSuccess", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["cards", deck.cardsDocumentUrl], []);
    const seen: (boolean | undefined)[] = [];
    const changed = vi.fn(() => [changes.cardsAndReviews(deck)]);
    const { result } = renderHook(
      () =>
        useWrite<number, Error, string>({
          mutationFn: async (title: string) => title.length,
          changes: changed,
          onSuccess: () => {
            seen.push(queryClient.getQueryState(["cards", deck.cardsDocumentUrl])?.isInvalidated);
          },
        }),
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => {
      await result.current.mutateAsync("Kanji");
    });

    expect(changed).toHaveBeenCalledWith("Kanji", { data: 5, error: null });
    expect(seen).toEqual([true]);
  });

  it("refreshes after a write that failed, before its own onError", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["cards", deck.cardsDocumentUrl], []);
    const failure = new Error("reviews refused");
    const seen: (boolean | undefined)[] = [];
    const changed = vi.fn(() => [changes.cardsAndReviews(deck)]);
    const { result } = renderHook(
      () =>
        useWrite<never, Error, string>({
          mutationFn: async (_: string) => {
            throw failure;
          },
          changes: changed,
          onError: () => {
            seen.push(queryClient.getQueryState(["cards", deck.cardsDocumentUrl])?.isInvalidated);
          },
        }),
      { wrapper: wrapper(queryClient) },
    );

    act(() => result.current.mutate("Kanji"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(changed).toHaveBeenCalledWith("Kanji", { data: undefined, error: failure });
    expect(seen).toEqual([true]);
  });

  it("refreshes with no callback of its own", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["reviews", deck.reviewsDocumentUrl], []);
    const { result } = renderHook(
      () =>
        useWrite({
          mutationFn: async () => undefined,
          changes: () => [changes.cardsAndReviews(deck)],
        }),
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(queryClient.getQueryState(["reviews", deck.reviewsDocumentUrl])?.isInvalidated).toBe(
      true,
    );
  });

  it("refreshes after a failure with no callback of its own", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["reviews", deck.reviewsDocumentUrl], []);
    const { result } = renderHook(
      () =>
        useWrite({
          mutationFn: async () => {
            throw new Error("refused");
          },
          changes: () => [changes.cardsAndReviews(deck)],
        }),
      { wrapper: wrapper(queryClient) },
    );

    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryState(["reviews", deck.reviewsDocumentUrl])?.isInvalidated).toBe(
      true,
    );
  });
});
