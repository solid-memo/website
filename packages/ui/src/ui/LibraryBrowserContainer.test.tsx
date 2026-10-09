import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LibraryBrowserContainer } from "./LibraryBrowserContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { makeUseCasesFake } from "../test/useCasesFake";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";

const capitals: LibraryDeck = {
  url: "https://solid-memo.com/decks/capitals/v1.ttl",
  ...firstRelease("https://solid-memo.com/decks/capitals/v1.ttl"),
  title: { en: "Capitals" },
  cardCount: 1,
  authors: [],
  direction: "front-to-back",
  sources: [],
};

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <LibraryBrowserContainer
        useCases={useCases}
        deck={capitals}
        deckHref="#/library-deck?deck=capitals"
        cardHref={(c) => `#/library-card?card=${c.id}`}
        page={1}
        onPageChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("LibraryBrowserContainer", () => {
  it("shows a loading state, then the deck's cards", async () => {
    const listLibraryCards = vi.fn(async () => [
      { id: "se", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 },
    ]);
    renderContainer(makeUseCasesFake({ listLibraryCards }));
    expect(screen.getByText("Loading cards…")).toBeInTheDocument();
    expect(await screen.findByText("Stockholm")).toBeInTheDocument();
    expect(listLibraryCards).toHaveBeenCalledWith(capitals);
  });

  it("shows an error when the deck cannot be read", async () => {
    renderContainer(
      makeUseCasesFake({
        listLibraryCards: vi.fn(async () => {
          throw new Error("library offline");
        }),
      }),
    );
    expect((await screen.findByText("library offline")).closest(".error")).toBeInTheDocument();
  });
});
