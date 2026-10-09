import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { DeckHealth } from "@solid-memo/domain/deckHealth";
import { summarize } from "@solid-memo/domain/validation";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { HealthBadge } from "./HealthBadge";
import { instanceA, makeCard, makeDeck } from "../test/fixtures";

afterEach(() => vi.unstubAllGlobals());

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const healthy: DeckHealth = { report: summarize(instanceA.url, []), unstated: [], duplicates: [], markdown: [] };
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
  return { show: (isIntersecting: boolean) => act(() => observers.forEach((callback) => callback([{ isIntersecting }]))) };
}

function renderBadge(useCases: UseCases, quiet = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HealthBadge useCases={useCases} instanceUrl={instanceA.url} deck={deck} href="#/health" quiet={quiet} />
    </QueryClientProvider>,
  );
}

describe("HealthBadge", () => {
  it("checks the deck only once it is on the screen, then links to its problems", async () => {
    const screenSays = observeByHand();
    const useCases = makeUseCasesFake({ checkDeck: vi.fn(async () => ({ ...healthy, duplicates: [twins] })) as UseCases["checkDeck"] });
    renderBadge(useCases);
    screenSays.show(false);
    expect(useCases.checkDeck).not.toHaveBeenCalled();
    screenSays.show(true);
    const link = await screen.findByRole("link", { name: "1 problem in Kanji N5" });
    expect(link).toHaveAttribute("href", "#/health");
    expect(useCases.checkDeck).toHaveBeenCalledWith(instanceA.url, deck, expect.objectContaining({ plain: expect.any(Function) }));
  });

  it("says a deck has no problems, unless told to be quiet about it", async () => {
    const screenSays = observeByHand();
    const useCases = makeUseCasesFake({ checkDeck: vi.fn(async () => healthy) as UseCases["checkDeck"] });
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
    renderBadge(makeUseCasesFake({ checkDeck: vi.fn(async () => Promise.reject(new Error("offline"))) as UseCases["checkDeck"] }));
    screenSays.show(true);
    expect(await screen.findByText("Not checked")).toBeInTheDocument();
  });
});
