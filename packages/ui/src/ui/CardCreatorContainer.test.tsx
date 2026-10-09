import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardCreatorContainer } from "./CardCreatorContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { makeUseCasesFake } from "../test/useCasesFake";

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/solid-memo/a/catalog.ttl#deck-1",
  title: { en: "Kanji N5" },
  cardsDocumentUrl: "https://pod.example/solid-memo/a/decks/deck-1.ttl",
  reviewsDocumentUrl: "https://pod.example/solid-memo/a/reviews/deck-1.ttl",
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
  authors: [],
};

const card: Card = {
  id: "card-1",
  url: `${deck.cardsDocumentUrl}#card-1`,
  front: { ja: "水" },
  back: { en: "water" },
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
};

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CardCreatorContainer
        useCases={useCases}
        deck={deck}
        deckHref="#/deck?deck=d"
        backHref="#/browser?deck=d"
      />
    </QueryClientProvider>,
  );
  return { queryClient };
}

function submitCard(front: string, back: string) {
  fireEvent.input(screen.getByLabelText("Front"), {
    target: { value: front },
  });
  fireEvent.input(screen.getByLabelText("Back"), { target: { value: back } });
  fireEvent.submit(
    screen.getByRole("button", { name: "Add card" }).closest("form")!,
  );
}

describe("CardCreatorContainer", () => {
  it("adds a card, in the languages the deck's cards have, and stays on the page for the next one", async () => {
    const useCases = makeUseCasesFake({ addCard: vi.fn(async () => card), listCards: vi.fn(async () => [card]) });
    const { queryClient } = renderContainer(useCases);
    const queueKey = ["studyQueue", deck.url];
    queryClient.setQueryData(queueKey, { due: [], newCards: [], studiedToday: 0 });
    await waitFor(() => expect(document.getElementById("card-front-language-0")).toHaveTextContent("Language: Japanese"));

    submitCard("火", "fire");

    await waitFor(() => {
      expect(useCases.addCard).toHaveBeenCalledWith(deck, {
        front: { ja: "火" },
        back: { en: "fire" },
      });
    });
    await waitFor(() => {
      expect(queryClient.getQueryData(queueKey)).toBeUndefined();
    });
    expect(
      screen.getByRole("heading", { name: "New card" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Front")).toHaveValue(""));
    expect(screen.getByText("Card added.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Front")).toHaveFocus());
  });

  it("shows an add error", async () => {
    renderContainer(
      makeUseCasesFake({
        listCards: vi.fn(async () => [card]),
        addCard: vi.fn(async () => {
          throw new Error("write refused");
        }),
      }),
    );
    await waitFor(() => expect(document.getElementById("card-back-language-0")).toHaveTextContent("Language: English"));

    submitCard("x", "y");
    expect(await screen.findByText("write refused")).toBeInTheDocument();
    // What was typed stays, to try again.
    expect(screen.getByLabelText("Front")).toHaveValue("x");
  });

  it("links back to the Browser", () => {
    renderContainer(makeUseCasesFake());
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "#/browser?deck=d");
  });
});
