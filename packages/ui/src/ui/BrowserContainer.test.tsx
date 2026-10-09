import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserContainer } from "./BrowserContainer";
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
  front: { "": "水" },
  back: { "": "water" },
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
};

function renderContainer(useCases: UseCases, shown: Deck = deck, languageFilter?: "unstated") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onLanguageFilterChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <BrowserContainer
        useCases={useCases}
        deck={shown}
        deckHref="#/deck?deck=d"
        addCardHref="#/new-card?deck=d"
        page={1}
        languageFilter={languageFilter}
        cardHref={(c) => `#/card?card=${c.id}`}
        onPageChange={vi.fn()}
        onLanguageFilterChange={onLanguageFilterChange}
      />
    </QueryClientProvider>,
  );
  return { queryClient, onLanguageFilterChange };
}

describe("BrowserContainer", () => {
  it("shows a loading state, then the cards", async () => {
    renderContainer(makeUseCasesFake({ listCards: vi.fn(async () => [card]) }));
    expect(screen.getByText("Loading cards…")).toBeInTheDocument();
    expect(await screen.findByText("水")).toBeInTheDocument();
  });

  it("shows an error when listing cards fails", async () => {
    renderContainer(
      makeUseCasesFake({
        listCards: vi.fn(async () => {
          throw new Error("cards unreachable");
        }),
      }),
    );
    expect(await screen.findByText("cards unreachable")).toBeInTheDocument();
  });

  it("links to the card creator", async () => {
    renderContainer(makeUseCasesFake({ listCards: vi.fn(async () => []) }));
    expect(await screen.findByRole("link", { name: "Add card" })).toHaveAttribute("href", "#/new-card?deck=d");
  });

  it("links cards to their own page", async () => {
    renderContainer(makeUseCasesFake({ listCards: vi.fn(async () => [card]) }));
    expect(await screen.findByRole("link", { name: "水" })).toHaveAttribute(
      "href",
      "#/card?card=card-1",
    );
  });

  it("removes a card and refreshes", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const listCards = vi
      .fn<() => Promise<Card[]>>()
      .mockResolvedValueOnce([card])
      .mockResolvedValue([]);
    const useCases = makeUseCasesFake({ listCards });
    const { queryClient } = renderContainer(useCases);
    const queueKey = ["studyQueue", deck.url];
    queryClient.setQueryData(queueKey, { due: [card], newCards: [], studiedToday: 0 });

    fireEvent.click(await screen.findByRole("button", { name: /^Remove card / }));

    await waitFor(() => {
      expect(useCases.removeCard).toHaveBeenCalledWith(deck, card);
    });
    expect(
      await screen.findByText("No cards in this deck yet."),
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(queueKey)).toBeUndefined();
  });

  it("shows a remove error", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => [card]),
      removeCard: vi.fn(async () => {
        throw new Error("remove refused");
      }),
    });
    renderContainer(useCases);

    fireEvent.click(await screen.findByRole("button", { name: /^Remove card / }));
    expect(await screen.findByText("remove refused")).toBeInTheDocument();
  });

  it("changes the study direction, refreshing the deck lists and dropping today's queue", async () => {
    const useCases = makeUseCasesFake();
    const { queryClient } = renderContainer(useCases);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const remove = vi.spyOn(queryClient, "removeQueries");

    fireEvent.click(await screen.findByLabelText("Both ways"));

    await waitFor(() => {
      expect(useCases.setDeckDirection).toHaveBeenCalledWith(deck, "bidirectional");
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks"] });
    });
    expect(remove).toHaveBeenCalledWith({ queryKey: ["studyQueue", deck.url] });
  });

  it("shows a direction error", async () => {
    renderContainer(
      makeUseCasesFake({
        setDeckDirection: vi.fn(async () => {
          throw new Error("direction refused");
        }),
      }),
    );
    fireEvent.click(await screen.findByLabelText("Back → front"));
    expect(await screen.findByText("direction refused")).toBeInTheDocument();
  });

  it("describes the deck and refreshes every deck list, showing an error when refused", async () => {
    const useCases = makeUseCasesFake();
    const { queryClient } = renderContainer(useCases);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(await screen.findByRole("button", { name: "Describe deck" }));
    fireEvent.input(screen.getByLabelText("Description"), { target: { value: "Kanji." } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));

    await waitFor(() => {
      expect(useCases.describeDeck).toHaveBeenCalledWith(deck, { description: { en: "Kanji." }, topics: [], keywords: {} });
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks"] });
    });
  });

  it("marks the cards whose language is the user's to settle, and lists them as the route says", async () => {
    const tagged: Card = { ...card, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2`, front: { ja: "火" }, back: { en: "fire" } };
    const { onLanguageFilterChange } = renderContainer(
      makeUseCasesFake({ listCards: vi.fn(async () => [card, tagged]) }),
      deck,
      "unstated",
    );
    expect(await screen.findByText("No language stated", { selector: ".unstated-tag" })).toBeInTheDocument();
    expect(screen.queryByText("火")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "All cards" }));
    expect(onLanguageFilterChange).toHaveBeenCalledWith(undefined);
  });

  it("leaves a library copy's cards still as its release has them unmarked, and marks none until it is read", async () => {
    const changed: Card = { ...card, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2`, front: { "": "火" } };
    const copy = { ...deck, sourceUrl: "https://library.example/kanji/1" };
    let read: (release: never) => void = () => undefined;
    renderContainer(
      makeUseCasesFake({
        listCards: vi.fn(async () => [card, changed]),
        deckRelease: vi.fn(() => new Promise<never>((resolve) => (read = resolve))),
      }),
      copy,
    );
    expect(await screen.findByText("火")).toBeInTheDocument();
    expect(screen.queryByText("No language stated", { selector: ".unstated-tag" })).toBeNull();
    read({ cards: [{ ...card, formatVersion: 4 }, { ...changed, front: { "": "木" }, formatVersion: 4 }] } as never);
    const tags = await screen.findAllByText("No language stated", { selector: ".unstated-tag" });
    expect(tags).toHaveLength(1);
    expect(tags[0]!.closest("tr")).toHaveTextContent("火");
  });

  it("shows a describe error", async () => {
    renderContainer(
      makeUseCasesFake({
        describeDeck: vi.fn(async () => {
          throw new Error("A deck needs a description.");
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Describe deck" }));
    fireEvent.input(screen.getByLabelText("Description"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(await screen.findByText("A deck needs a description.")).toBeInTheDocument();
  });


});
