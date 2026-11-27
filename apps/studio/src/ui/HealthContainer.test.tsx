// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { deckHealth } from "@solid-memo/domain/deckHealth";
import { summarize, type ValidationReport } from "@solid-memo/domain/validation";
import { deckTextCheck } from "@solid-memo/ui/markdownCache";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { HealthContainer } from "./HealthContainer";
import { instanceA, invalidReport, makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
/** A check of the deck's documents that finds nothing: its catalog, cards and reviews come back with no subjects, unchanged or conforming. */
const conforming = summarize(
  instanceA.url,
  [deck.url.split("#")[0]!, deck.cardsDocumentUrl, deck.reviewsDocumentUrl].map((url) => ({
    url,
    status: "checked" as const,
    subjects: [],
  })),
);
function renderContainer(
  useCases: UseCases,
  of: Deck | null,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <HealthContainer
        useCases={useCases}
        instance={instanceA}
        deck={of}
        spotHref={(each, { card }) => `#/card?deck=${each.id}&card=${card.id}`}
        aboutHref={(each) => `#/about?deck=${each.id}`}
        deckHref={(each) => `#/health?deck=${each.id}`}
      />
    </QueryClientProvider>,
  );
  return { invalidate };
}

describe("HealthContainer", () => {
  it("checks a deck, with its cards, offers no repair or removal, and checks it again", async () => {
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => [makeCard(deck, "water"), makeCard(deck, "water")]),
      checkInstance: vi.fn(async () => invalidReport([deck])),
    });
    const { invalidate } = renderContainer(useCases, deck);
    expect(await screen.findByRole("heading", { name: "Health of Kanji N5" })).toBeInTheDocument();
    expect(useCases.checkDeck).toHaveBeenCalledWith(instanceA.url, deck, expect.anything());
    // Its documents read afresh as the screen opens, and as it is checked again.
    expect(useCases.forgetDeckCheck).toHaveBeenCalledWith(instanceA.url, deck);
    expect(useCases.forgetDeckCheck).toHaveBeenCalledBefore(vi.mocked(useCases.checkDeck));
    expect(
      await screen.findByText(
        /Solid Memo leaves this data as it is: it must be fixed outside the app/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Repair|Remove/ })).toBeNull();
    const forgotten = vi.mocked(useCases.forgetDeckCheck).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["validation", instanceA.url, "deck", deck.url, deck.cardsDocumentUrl],
      }),
    );
    await waitFor(() => expect(useCases.checkDeck).toHaveBeenCalledTimes(2));
    const forget = vi.mocked(useCases.forgetDeckCheck).mock;
    expect(forget.calls.length).toBeGreaterThan(forgotten);
    expect(forget.invocationCallOrder.at(-1)).toBeLessThan(
      vi.mocked(useCases.checkDeck).mock.invocationCallOrder.at(-1)!,
    );
  });

  it("links a deck set aside to none of its forms, which change nothing, and says why", async () => {
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => [makeCard(deck, "c1")]),
      checkInstance: vi.fn(async () => invalidReport([deck])),
    });
    renderContainer(useCases, deck);
    expect(
      await screen.findByText(/Nothing in this deck can be changed until its data is fixed/),
    ).toBeInTheDocument();
    expect(screen.getByText(/^c1/)).toBeInTheDocument();
    expect(
      screen
        .queryAllByRole("link")
        .filter((link) => /^#\/(card|about)/.test(link.getAttribute("href")!)),
    ).toEqual([]);
  });

  it("lets a deck set aside go once Check again finds it mended in the pod, checking only the deck again", async () => {
    const checkInstance = vi.fn(async () => invalidReport([deck]));
    const checkDeck = vi.fn(async () =>
      deckHealth(deck, invalidReport([deck]), [], [], deckTextCheck()),
    );
    const useCases = makeUseCasesFake({
      checkInstance,
      checkDeck: checkDeck as UseCases["checkDeck"],
    });
    renderContainer(useCases, deck);
    expect(
      await screen.findByText(/Nothing in this deck can be changed until its data is fixed/),
    ).toBeInTheDocument();
    checkDeck.mockResolvedValue(deckHealth(deck, conforming, [], [], deckTextCheck()));
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() =>
      expect(screen.queryByText(/Nothing in this deck can be changed/)).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Nothing is wrong with this deck.")).toBeInTheDocument();
    expect(checkInstance).toHaveBeenCalledTimes(1);
  });

  it("lets a deck set aside go when its health, read afresh as the screen opens, finds it mended", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["validation", instanceA.url, "opening"], invalidReport([deck]));
    const checkDeck = vi.fn(async () => deckHealth(deck, conforming, [], [], deckTextCheck()));
    const useCases = makeUseCasesFake({ checkDeck: checkDeck as UseCases["checkDeck"] });
    renderContainer(useCases, deck, queryClient);
    expect(await screen.findByText("Nothing is wrong with this deck.")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing in this deck can be changed/)).not.toBeInTheDocument();
    expect(useCases.checkInstance).not.toHaveBeenCalled();
  });

  it("does not hold a deck again by a check made before a newer one that ends after it", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const broken = deckHealth(deck, invalidReport([deck]), [], [], deckTextCheck());
    queryClient.setQueryData(["validation", instanceA.url, "opening"], invalidReport([deck]));
    queryClient.setQueryData(
      ["validation", instanceA.url, "deck", deck.url, deck.cardsDocumentUrl],
      broken,
    );
    let endStale: () => void = () => undefined;
    const stale = new Promise<typeof broken>((resolve) => (endStale = () => resolve(broken)));
    const checkDeck = vi.fn(() => stale);
    const useCases = makeUseCasesFake({ checkDeck: checkDeck as UseCases["checkDeck"] });
    renderContainer(useCases, deck, queryClient);
    expect(
      await screen.findByText(/Nothing in this deck can be changed until its data is fixed/),
    ).toBeInTheDocument();
    // The data mended in the pod by other means, and the deck checked anew (after an update, say).
    checkDeck.mockResolvedValue(deckHealth(deck, conforming, [], [], deckTextCheck()));
    void queryClient.invalidateQueries({ queryKey: ["validation", instanceA.url] });
    await waitFor(() =>
      expect(screen.queryByText(/Nothing in this deck can be changed/)).not.toBeInTheDocument(),
    );
    endStale();
    await stale;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/Nothing in this deck can be changed/)).not.toBeInTheDocument();
    expect(
      queryClient.getQueryData<ValidationReport>(["validation", instanceA.url, "opening"])!
        .conforms,
    ).toBe(true);
  });

  it("says why a deck could not be checked", async () => {
    renderContainer(
      makeUseCasesFake({
        checkDeck: vi.fn(async () => Promise.reject(new Error("offline"))) as UseCases["checkDeck"],
      }),
      deck,
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("checks the instance and lists its decks", async () => {
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [deck]) });
    renderContainer(useCases, null);
    expect(
      await screen.findByRole("heading", { name: "Health of Deck set A" }),
    ).toBeInTheDocument();
    expect(useCases.checkInstance).toHaveBeenCalledWith(instanceA.url);
    expect(screen.getByRole("link", { name: "Kanji N5" })).toHaveAttribute(
      "href",
      "#/health?deck=deck-1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(useCases.checkInstance).toHaveBeenCalledTimes(2));
  });

  it("offers to claim a deck's unclaimed documents, on the instance's health and the deck's", async () => {
    const unclaimed = [
      {
        deckUrl: deck.url,
        title: deck.title,
        documents: [deck.reviewsDocumentUrl],
        outsidePod: [],
      },
    ];
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [deck]),
      checkInstance: vi.fn(async () => ({ ...conforming, unclaimed })),
      checkDeck: vi.fn(async () =>
        deckHealth(deck, { ...conforming, unclaimed }, [], [], deckTextCheck()),
      ) as UseCases["checkDeck"],
    });
    renderContainer(useCases, null);
    fireEvent.click(await screen.findByRole("button", { name: "These are this deck's documents" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark them as the deck's" }));
    await waitFor(() =>
      expect(useCases.claimDeckDocuments).toHaveBeenCalledWith(instanceA.url, deck.url, [
        deck.reviewsDocumentUrl,
      ]),
    );
    renderContainer(useCases, deck);
    expect(
      (await screen.findAllByRole("region", { name: "Decks to confirm" })).length,
    ).toBeGreaterThan(0);
  });

  it("says why the instance could not be checked", async () => {
    renderContainer(
      makeUseCasesFake({ checkInstance: vi.fn(async () => Promise.reject(new Error("offline"))) }),
      null,
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
