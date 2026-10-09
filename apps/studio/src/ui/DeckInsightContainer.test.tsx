import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { DeckInsightContainer } from "./DeckInsightContainer";
import { instanceA, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });

function renderContainer(useCases: UseCases, of = deck) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DeckInsightContainer useCases={useCases} instance={instanceA} deck={of} cardHref={() => "#card"} leechesHref="#leeches" />
    </QueryClientProvider>,
  );
}

describe("DeckInsightContainer", () => {
  it("reads the deck's insight with the instance's preferences, its own cap said to be its own", async () => {
    const useCases = makeUseCasesFake();
    renderContainer(useCases, { ...deck, maxReviewsPerDay: 9 });
    expect(screen.getByText("Loading the schedule…")).toBeInTheDocument();
    expect(await screen.findByText(/as this deck sets it/)).toBeInTheDocument();
    expect(useCases.deckInsight).toHaveBeenCalledWith(instanceA.url, { ...deck, maxReviewsPerDay: 9 }, expect.any(Date), DEFAULT_PREFERENCES);
  });

  it("reads the insight again once the deck's own cap changed, not showing the one of the old cap", async () => {
    const useCases = makeUseCasesFake();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const view = (of: typeof deck) => (
      <QueryClientProvider client={queryClient}>
        <DeckInsightContainer useCases={useCases} instance={instanceA} deck={of} cardHref={() => "#card"} leechesHref="#leeches" />
      </QueryClientProvider>
    );
    const { rerender } = render(view(deck));
    await waitFor(() => expect(useCases.deckInsight).toHaveBeenCalledTimes(1));
    rerender(view({ ...deck, maxReviewsPerDay: 9 }));
    expect(screen.getByText("Loading the schedule…")).toBeInTheDocument();
    await waitFor(() => expect(useCases.deckInsight).toHaveBeenCalledTimes(2));
  });

  it("says why the insight could not be read", async () => {
    renderContainer(
      makeUseCasesFake({
        deckInsight: vi.fn(async () => {
          throw new Error("Pod unreachable");
        }),
      }),
    );
    expect(await screen.findByText(/Pod unreachable/)).toBeInTheDocument();
  });
});
