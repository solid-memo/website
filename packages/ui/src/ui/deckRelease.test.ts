// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { h, type ComponentChildren } from "preact";
import type { LibraryUseCases } from "@solid-memo/application/library";
import type { MistakeReportUseCases } from "@solid-memo/application/mistakeReports";
import type { Deck } from "@solid-memo/domain/deck";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import { publishedDistractorIds, useReportTarget } from "./deckRelease";

const card = { id: "q", distractors: [{ id: "q-d1" }, { id: "q-d2" }] };

describe("publishedDistractorIds", () => {
  it("is none for a deck not from the library, or a card its release lacks", () => {
    expect(publishedDistractorIds(null, card)).toEqual(new Set());
    expect(publishedDistractorIds({ cards: [] } as unknown as LibraryDeckContent, card)).toEqual(
      new Set(),
    );
    expect(
      publishedDistractorIds({ cards: [{ id: "q" }] } as unknown as LibraryDeckContent, card),
    ).toEqual(new Set());
  });

  it("is the release's distractors of the card", () => {
    const release = {
      cards: [{ id: "q", distractors: [{ id: "q-d1" }] }],
    } as unknown as LibraryDeckContent;
    expect(publishedDistractorIds(release, card)).toEqual(new Set(["q-d1"]));
  });

  it("is every one the card has while the release is not known", () => {
    expect(publishedDistractorIds(undefined, card)).toEqual(new Set(["q-d1", "q-d2"]));
    expect(publishedDistractorIds(undefined, { id: "q" })).toEqual(new Set());
  });
});

describe("useReportTarget", () => {
  const URL = "https://tracker.example/r/capitals.ttl";

  it("asks for a release that could not be read again when a screen shows its deck again, the deck library answering", async () => {
    const deck = { sourceUrl: URL } as Deck;
    let readable = false;
    const reportPlace = vi.fn(async () => {
      if (!readable) throw new Error("500 from the release's server");
      return { library: false as const };
    });
    const deckRelease = vi.fn(async () => {
      if (!readable) throw new Error("500 from the release's server");
      return { cards: [{ id: "card-1" }] } as unknown as LibraryDeckContent;
    });
    const useCases = { reportPlace, deckRelease } as unknown as LibraryUseCases &
      MistakeReportUseCases;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children?: ComponentChildren }) =>
      h(QueryClientProvider, { client: queryClient }, children);

    const first = renderHook(() => useReportTarget(useCases, deck), { wrapper });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(first.result.current).toBeUndefined();
    first.unmount();
    // A failure of a release from a link is the deck library's to keep, so its server is not asked
    // again; one read again as the learner asks, or of the site's own, is shown when it opens again.
    readable = true;
    const second = renderHook(() => useReportTarget(useCases, deck), { wrapper });
    await waitFor(() => expect(second.result.current?.releaseUrl).toBe(URL));
    expect(second.result.current?.cardIds).toEqual(new Set(["card-1"]));
    expect([reportPlace.mock.calls.length, deckRelease.mock.calls.length]).toEqual([2, 2]);
  });
});
