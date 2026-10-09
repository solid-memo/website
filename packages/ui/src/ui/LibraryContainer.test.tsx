import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LibraryContainer } from "./LibraryContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { makeUseCasesFake } from "../test/useCasesFake";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import { forget } from "./remembered";

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
  license: "https://creativecommons.org/publicdomain/zero/1.0/",
  direction: "front-to-back",
  sources: [],
};
const rivers: LibraryDeck = {
  url: "https://solid-memo.com/decks/rivers/v1.ttl",
  ...firstRelease("https://solid-memo.com/decks/rivers/v1.ttl"),
  title: { en: "Rivers" },
  cardCount: 1,
  authors: [],
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
      <LibraryContainer
        useCases={useCases}
        instance={instance}
        onDone={onDone}
      />
    </QueryClientProvider>,
  );
  return { onDone, queryClient };
}

describe("LibraryContainer", () => {
  // The library remembers its ticks and filters per instance; each test starts afresh.
  afterEach(() => {
    for (const part of ["selected", "topics", "query"]) forget(`library:${instance.url}:${part}`);
  });

  it("shows a loading state, then the library", async () => {
    renderContainer(
      makeUseCasesFake({
        listLibraryDecks: vi.fn(async () => [capitals, rivers]),
      }),
    );
    expect(screen.getByText("Loading the deck library…")).toBeInTheDocument();
    expect(
      await screen.findByRole("checkbox", { name: "Capitals" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deck library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Capitals" })).toHaveAttribute(
      "href",
      `#/library-deck?instance=${encodeURIComponent(instance.url)}&deck=${encodeURIComponent(capitals.seriesUrl)}`,
    );
    expect(screen.getByRole("link", { name: "Preview Capitals" })).toHaveAttribute(
      "href",
      `#/library-preview?instance=${encodeURIComponent(instance.url)}&deck=${encodeURIComponent(capitals.seriesUrl)}`,
    );
  });

  it("shows an error when the library cannot be read", async () => {
    renderContainer(
      makeUseCasesFake({
        listLibraryDecks: vi.fn(async () => {
          throw new Error("library offline");
        }),
      }),
    );
    expect((await screen.findByText("library offline")).closest(".error")).toBeInTheDocument();
  });

  it("marks library decks the instance already imported", async () => {
    renderContainer(
      makeUseCasesFake({
        listLibraryDecks: vi.fn(async () => [capitals, rivers]),
        listDecks: vi.fn(async () => [
          importedDeck,
          { ...importedDeck, id: "deck-2", sourceUrl: undefined },
        ]),
      }),
    );
    expect(await screen.findByText("Already imported")).toBeInTheDocument();
    expect(screen.getAllByText("Already imported")).toHaveLength(1);
  });

  it("imports the ticked decks one by one, then returns to the deck list", async () => {
    const importLibraryDeck = vi.fn(async () => importedDeck);
    const useCases = makeUseCasesFake({
      listLibraryDecks: vi.fn(async () => [capitals, rivers]),
      importLibraryDeck,
    });
    const { onDone, queryClient } = renderContainer(useCases);
    queryClient.setQueryData(["decks", instance.url], []);

    fireEvent.click(await screen.findByRole("checkbox", { name: "Capitals" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Rivers" }));
    fireEvent.submit(
      screen.getByRole("button", { name: "Import 2 decks" }).closest("form")!,
    );

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(importLibraryDeck.mock.calls).toEqual([
      [instance.url, capitals],
      [instance.url, rivers],
    ]);
    await waitFor(() =>
      expect(useCases.listDecks).toHaveBeenCalledTimes(2),
    );

    // The imported decks are no longer ticked on the next visit.
    cleanup();
    renderContainer(useCases);
    expect(await screen.findByRole("checkbox", { name: "Capitals" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Rivers" })).not.toBeChecked();
  });

  it("keeps the ticks and the search when the library is left and come back to", async () => {
    const useCases = makeUseCasesFake({
      listLibraryDecks: vi.fn(async () => [capitals, rivers]),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Capitals" }));
    fireEvent.input(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "cap" },
    });

    // As when a deck's page is opened and Back is pressed.
    cleanup();
    renderContainer(useCases);
    expect(await screen.findByRole("checkbox", { name: "Capitals" })).toBeChecked();
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("cap");
    expect(screen.queryByRole("checkbox", { name: "Rivers" })).toBeNull();
  });

  it("shows the error and keeps the decks imported before it", async () => {
    const importLibraryDeck = vi
      .fn<UseCases["importLibraryDeck"]>()
      .mockResolvedValueOnce(importedDeck)
      .mockRejectedValueOnce(new Error("pod refused"));
    const listDecks = vi
      .fn<UseCases["listDecks"]>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([importedDeck]);
    const useCases = makeUseCasesFake({
      listLibraryDecks: vi.fn(async () => [capitals, rivers]),
      importLibraryDeck,
      listDecks,
    });
    const { onDone } = renderContainer(useCases);

    fireEvent.click(await screen.findByRole("checkbox", { name: "Capitals" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Rivers" }));
    fireEvent.submit(
      screen.getByRole("button", { name: "Import 2 decks" }).closest("form")!,
    );

    expect((await screen.findByText("pod refused")).closest(".error")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(await screen.findByText("Already imported")).toBeInTheDocument();
  });
});
