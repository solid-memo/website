// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentChildren } from "preact";
import { renderHook, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Deck } from "@solid-memo/domain/deck";
import type { LibraryDeck } from "@solid-memo/domain/library";
import * as libraryCopy from "@solid-memo/domain/libraryCopy";
import { makeUseCasesFake } from "../test/useCasesFake";
import { useCopies } from "./deckTreeEditor";

afterEach(() => {
  vi.restoreAllMocks();
});

const course = {
  url: "https://solid-memo.com/decks/course/v1.ttl",
  seriesUrl: "https://solid-memo.com/decks/index.ttl#course",
  version: "1",
  releases: [{ url: "https://solid-memo.com/decks/course/v1.ttl", version: "1" }],
  isCourse: true,
} as LibraryDeck;

function deck(id: string, sourceUrl?: string): Deck {
  return { id, url: `https://pod.example/catalog.ttl#${id}`, sourceUrl } as Deck;
}

function wrapper({ children }: { children?: ComponentChildren }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useCopies", () => {
  it("tells the library's courses of decks it was not given as well", async () => {
    const useCases = makeUseCasesFake({ listLibraryDecks: vi.fn(async () => [course]) });
    const { result } = renderHook(() => useCopies(useCases, [deck("a", course.url)]), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isCourse(deck("a", course.url))).toBe(true));
    expect(result.current.isCourse(deck("b", "https://solid-memo.com/decks/course/v2.ttl"))).toBe(
      true,
    );
    expect(result.current.isCourse(deck("c", "https://solid-memo.com/decks/other/v1.ttl"))).toBe(
      false,
    );
    expect(result.current.isCourse(deck("d"))).toBe(false);
  });

  it("matches many decks with long release links against the library once for the same decks", async () => {
    const isCopyTests = vi.spyOn(libraryCopy, "libraryCopyTest");
    const useCases = makeUseCasesFake({
      listLibraryDecks: vi.fn(async () => [course]),
      deckRelease: vi.fn(() => new Promise<never>(() => {})),
    });
    const decks = Array.from({ length: 1_000 }, (_, at) =>
      deck(`d${at}`, `https://elsewhere.example/${at}/${"/decks/x".repeat(2_000)}`),
    );
    const { result, rerender } = renderHook(
      ({ listed }: { listed: readonly Deck[] }) => useCopies(useCases, listed),
      { wrapper, initialProps: { listed: decks } },
    );
    await waitFor(() => expect(result.current.linkedHost(decks[0]!)).toBe("elsewhere.example"));
    const matched = isCopyTests.mock.calls.length;
    // Each render lists the same decks anew.
    rerender({ listed: [...decks] });
    rerender({ listed: [...decks] });
    expect(isCopyTests).toHaveBeenCalledTimes(matched);
    rerender({ listed: decks.slice(1) });
    expect(isCopyTests).toHaveBeenCalledTimes(matched + 1);
    rerender({ listed: [deck("other", course.url), ...decks.slice(2)] });
    expect(isCopyTests).toHaveBeenCalledTimes(matched + 2);
    expect(result.current.linkedHost(decks[0]!)).toBeNull();
    expect(result.current.isCourse(deck("other", course.url))).toBe(true);
  });
});
