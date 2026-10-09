import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { DeckTableContainer } from "./DeckTableContainer";
import { instanceA, makeCard, makeDeck } from "../test/fixtures";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = makeDeck("deck-2", { en: "Verbs" });

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeckTableContainer useCases={useCases} instance={instanceA} appHref="../#/decks" />
    </QueryClientProvider>,
  );
}

describe("DeckTableContainer", () => {
  it("reads the decks, then each one's cards in use and what is due today", async () => {
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [kanji, verbs]),
      listCards: vi.fn(async (deck) =>
        deck.url === kanji.url ? [makeCard(deck, "a"), makeCard(deck, "b"), makeCard(deck, "c", true)] : [],
      ),
      getStudyCounts: vi.fn(async (_instanceUrl, deck) => ({ dueCount: deck.url === kanji.url ? 2 : 0, newCount: 5 })),
    });
    renderContainer(useCases);
    expect(screen.getByText("Loading decks…")).toBeInTheDocument();
    const row = await screen.findByRole("row", { name: /Kanji N5/ });
    await vi.waitFor(() => expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["2", "2"]));
    expect(useCases.listDecks).toHaveBeenCalledWith(instanceA.url);
    expect(useCases.getStudyCounts).toHaveBeenCalledWith(instanceA.url, kanji, expect.any(Date));
  });

  it("shows a row's figures that could not be read as such", async () => {
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [kanji]),
      listCards: vi.fn(async () => {
        throw new Error("gone");
      }),
      getStudyCounts: vi.fn(() => new Promise<never>(() => undefined)),
    });
    renderContainer(useCases);
    const row = await screen.findByRole("row", { name: /Kanji N5/ });
    await vi.waitFor(() => expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("Could not be read"));
    expect(within(row).getAllByRole("cell")[1]).toHaveTextContent("Counting…");
  });

  it("says why the decks could not be read", async () => {
    renderContainer(
      makeUseCasesFake({
        listDecks: vi.fn(async () => {
          throw new Error("Pod unreachable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Pod unreachable");
  });
});
