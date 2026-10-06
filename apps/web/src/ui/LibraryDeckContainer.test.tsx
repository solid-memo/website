import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LibraryDeckContainer } from "./LibraryDeckContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { makeUseCasesFake } from "../test/useCasesFake";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";

const instance: Instance = {
  url: "https://pod.example/solid-memo/a/",
  name: "Geography",
};

const capitals: LibraryDeck = {
  url: "https://solid-memo.com/decks/capitals/v1.ttl",
  ...firstRelease("https://solid-memo.com/decks/capitals/v1.ttl"),
  title: { en: "Capitals" },
  cardCount: 2,
  authors: ["Anton Wiklund"],
  direction: "front-to-back",
  sources: [],
};

const importedDeck: Deck = {
  id: "deck-1",
  url: `${instance.url}catalog.ttl#deck-1`,
  title: { en: "Capitals" },
  cardsDocumentUrl: `${instance.url}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${instance.url}reviews/deck-1.ttl`,
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
  authors: [],
  sourceUrl: capitals.url,
};

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <LibraryDeckContainer
        useCases={useCases}
        instance={instance}
        deck={capitals}
        onDone={onDone}
      />
    </QueryClientProvider>,
  );
  return { onDone, queryClient };
}

describe("LibraryDeckContainer", () => {
  it("shows the deck, with links to its card list and its preview", () => {
    renderContainer(makeUseCasesFake());
    expect(screen.getByRole("heading", { name: "Capitals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse cards" })).toHaveAttribute(
      "href",
      `#/library-browse?instance=${encodeURIComponent(instance.url)}&deck=${encodeURIComponent(capitals.seriesUrl)}`,
    );
    expect(screen.queryByText("Already imported")).toBeNull();
    expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute(
      "href",
      `#/library-preview?instance=${encodeURIComponent(instance.url)}&deck=${encodeURIComponent(capitals.seriesUrl)}`,
    );
  });

  it("marks the deck when the instance already holds a copy", async () => {
    renderContainer(
      makeUseCasesFake({
        listDecks: vi.fn(async () => [
          importedDeck,
          { ...importedDeck, id: "deck-2", sourceUrl: undefined },
        ]),
      }),
    );
    expect(await screen.findByText("Already imported")).toBeInTheDocument();
  });

  it("imports the deck, refreshes the deck list and returns", async () => {
    const importLibraryDeck = vi.fn(async () => importedDeck);
    const useCases = makeUseCasesFake({ importLibraryDeck });
    const { onDone } = renderContainer(useCases);

    fireEvent.click(screen.getByRole("button", { name: "Import this deck" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(importLibraryDeck).toHaveBeenCalledWith(instance.url, capitals);
    await waitFor(() => expect(useCases.listDecks).toHaveBeenCalledTimes(2));
  });

  it("shows the error when the import fails", async () => {
    const { onDone } = renderContainer(
      makeUseCasesFake({
        importLibraryDeck: vi.fn(async () => {
          throw new Error("pod refused");
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Import this deck" }));
    expect((await screen.findByText("pod refused")).closest(".error")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });
});
