// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { DeckHealth } from "@solid-memo/domain/deckHealth";
import { summarize } from "@solid-memo/domain/validation";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { HealthBadge } from "./HealthBadge";
import { queries } from "./queries";
import { queryKeys } from "./queryKeys";
import { instanceA, makeCard, makeDeck } from "../test/fixtures";

afterEach(() => vi.unstubAllGlobals());

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const healthy: DeckHealth = {
  report: summarize(instanceA.url, []),
  unstated: [],
  duplicates: [],
  markdown: [],
  markdownMore: 0,
};
const twins = [makeCard(deck, "a"), makeCard(deck, "b")];

/** An IntersectionObserver the test drives: `show` says whether the observed elements are on the screen. */
function observeByHand() {
  const observers: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  return {
    show: (isIntersecting: boolean) =>
      act(() => observers.forEach((callback) => callback([{ isIntersecting }]))),
  };
}

function renderBadge(useCases: UseCases, quiet = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HealthBadge
        useCases={useCases}
        instanceUrl={instanceA.url}
        deck={deck}
        href="#/health"
        quiet={quiet}
      />
    </QueryClientProvider>,
  );
}

describe("queries.deckHealth", () => {
  it("gives the decks of one instance one text check, and another instance its own", async () => {
    const checkDeck = vi.fn(async () => healthy);
    const useCases = makeUseCasesFake({ checkDeck: checkDeck as UseCases["checkDeck"] });
    const queryClient = new QueryClient();
    const other = makeDeck("deck-2", { en: "Kanji N4" });
    const signal = new AbortController().signal;
    const elsewhere = "https://pod.example/elsewhere/";
    for (const [instanceUrl, each] of [
      [instanceA.url, deck],
      [instanceA.url, other],
      [elsewhere, deck],
      [elsewhere, other],
    ] as const)
      await (
        queries.deckHealth(useCases, queryClient, instanceUrl, each).queryFn as (context: {
          signal: AbortSignal;
        }) => Promise<DeckHealth>
      )({ signal });
    const texts = checkDeck.mock.calls.map((call) => (call as unknown[])[2]);
    // One for both decks of an instance: what a document many decks name holds is read once.
    expect(texts[1]).toBe(texts[0]);
    expect(texts[2]).not.toBe(texts[0]);
    expect(texts[3]).toBe(texts[2]);
    expect(Object.isFrozen(texts[0])).toBe(true);
  });

  it("is made again only after the instance's check, read afresh with it, has begun", async () => {
    // The instance's check, as it begins, has the decks' checks read their documents again
    // (UseCases.checkDeck): a deck's check looks up what is kept only a step after it begins.
    let begun = 0;
    const lookedUp: number[] = [];
    const useCases = makeUseCasesFake({
      checkInstance: (async () => {
        begun++;
        return summarize(instanceA.url, []);
      }) as UseCases["checkInstance"],
      checkDeck: (async () => {
        await Promise.resolve();
        lookedUp.push(begun);
        return healthy;
      }) as UseCases["checkDeck"],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The badge's query first, so that it is made first when both are read afresh.
    const badge = new QueryObserver(
      queryClient,
      queries.deckHealth(useCases, queryClient, instanceA.url, deck),
    );
    const stopBadge = badge.subscribe(() => undefined);
    await waitFor(() => expect(lookedUp).toEqual([0]));
    const check = new QueryObserver(queryClient, queries.instanceCheck(useCases, instanceA.url));
    const stopCheck = check.subscribe(() => undefined);
    await waitFor(() => expect(begun).toBe(1));
    await queryClient.invalidateQueries({ queryKey: queryKeys.validation(instanceA.url) });
    expect(begun).toBe(2);
    expect(lookedUp).toEqual([0, 2]);
    stopBadge();
    stopCheck();
  });
});

describe("HealthBadge", () => {
  it("checks the deck only once it is on the screen, then links to its problems", async () => {
    const screenSays = observeByHand();
    const useCases = makeUseCasesFake({
      checkDeck: vi.fn(async () => ({ ...healthy, duplicates: [twins] })) as UseCases["checkDeck"],
    });
    renderBadge(useCases);
    screenSays.show(false);
    expect(useCases.checkDeck).not.toHaveBeenCalled();
    screenSays.show(true);
    const link = await screen.findByRole("link", { name: "1 problem in Kanji N5" });
    expect(link).toHaveAttribute("href", "#/health");
    expect(useCases.checkDeck).toHaveBeenCalledWith(
      instanceA.url,
      deck,
      expect.objectContaining({ plain: expect.any(Function) }),
    );
  });

  it("says a deck has no problems, unless told to be quiet about it", async () => {
    const screenSays = observeByHand();
    const useCases = makeUseCasesFake({
      checkDeck: vi.fn(async () => healthy) as UseCases["checkDeck"],
    });
    const { container } = renderBadge(useCases, true);
    screenSays.show(true);
    await waitFor(() => expect(useCases.checkDeck).toHaveBeenCalled());
    expect(container.querySelector(".studio-badge")).toBeNull();
    renderBadge(useCases);
    screenSays.show(true);
    expect(await screen.findByText("No problems")).toBeInTheDocument();
  });

  it("says when the deck could not be checked", async () => {
    const screenSays = observeByHand();
    renderBadge(
      makeUseCasesFake({
        checkDeck: vi.fn(async () => Promise.reject(new Error("offline"))) as UseCases["checkDeck"],
      }),
    );
    screenSays.show(true);
    expect(await screen.findByText("Not checked")).toBeInTheDocument();
  });
});
