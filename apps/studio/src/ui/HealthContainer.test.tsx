import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { RepairPlan } from "@solid-memo/domain/repair";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { HealthContainer } from "./HealthContainer";
import { instanceA, invalidReport, makeCard, makeDeck } from "../test/fixtures";

afterEach(() => vi.unstubAllGlobals());

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const plan: RepairPlan = {
  repairs: [{ kind: "describe-deck", documentUrl: `${instanceA.url}catalog.ttl`, subjectUrl: deck.url, version: 3 }],
  unrepairable: [{ documentUrl: deck.cardsDocumentUrl, subjectUrl: `${deck.cardsDocumentUrl}#water`, violations: [] }],
};

function renderContainer(useCases: UseCases, of: Deck | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  it("checks a deck, with its cards, and repairs what it can of it, reading every check afresh", async () => {
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => [makeCard(deck, "water"), makeCard(deck, "water")]),
      planRepair: vi.fn(() => plan),
    });
    const { invalidate } = renderContainer(useCases, deck);
    expect(await screen.findByRole("heading", { name: "Health of Kanji N5" })).toBeInTheDocument();
    expect(useCases.checkDeck).toHaveBeenCalledWith(instanceA.url, deck, expect.anything());
    expect(screen.getByRole("link", { name: "The deck's entry" })).toHaveAttribute("href", "#/about?deck=deck-1");
    fireEvent.click(screen.getByRole("button", { name: "Repair 1 problem" }));
    await waitFor(() => expect(useCases.applyRepairs).toHaveBeenCalledWith(plan.repairs));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["validation", instanceA.url] }));
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(useCases.checkDeck).toHaveBeenCalledTimes(3));
  });

  it("removes a subject no repair covers once the user confirms", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const useCases = makeUseCasesFake({ planRepair: vi.fn(() => plan) });
    renderContainer(useCases, deck);
    const remove = await screen.findByRole("button", { name: `Remove ${plan.unrepairable[0]!.subjectUrl}` });
    fireEvent.click(remove);
    expect(confirm).toHaveBeenCalledWith(`Remove <${plan.unrepairable[0]!.subjectUrl}> from your pod? This cannot be undone.`);
    expect(useCases.applyRepairs).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(remove);
    await waitFor(() =>
      expect(useCases.applyRepairs).toHaveBeenCalledWith([
        { kind: "remove-subject", documentUrl: deck.cardsDocumentUrl, subjectUrl: plan.unrepairable[0]!.subjectUrl, version: 1 },
      ]),
    );
  });

  it("links a deck set aside to none of its forms, which change nothing, and says why; its repairs stay", async () => {
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => [makeCard(deck, "c1")]),
      checkInstance: vi.fn(async () => invalidReport([deck])),
      planRepair: vi.fn(() => plan),
    });
    renderContainer(useCases, deck);
    expect(await screen.findByText(/Nothing in this deck can be changed until the data is repaired/)).toBeInTheDocument();
    expect(screen.getByText(/^c1/)).toBeInTheDocument();
    expect(screen.queryAllByRole("link").filter((link) => /^#\/(card|about)/.test(link.getAttribute("href")!))).toEqual([]);
    expect(screen.getByRole("button", { name: "Repair 1 problem" })).toBeEnabled();
  });

  it("lets a deck set aside go once Check again finds it mended in the pod", async () => {
    const checkInstance = vi.fn(async () => invalidReport([deck]));
    const useCases = makeUseCasesFake({ checkInstance, planRepair: vi.fn(() => plan) });
    renderContainer(useCases, deck);
    expect(await screen.findByText(/Nothing in this deck can be changed until the data is repaired/)).toBeInTheDocument();
    checkInstance.mockResolvedValue({ instanceUrl: instanceA.url, documents: [], violationCount: 0, conforms: true });
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(screen.queryByText(/Nothing in this deck can be changed/)).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "The deck's entry" })).toHaveAttribute("href", "#/about?deck=deck-1");
  });

  it("says why a deck could not be checked", async () => {
    renderContainer(makeUseCasesFake({ checkDeck: vi.fn(async () => Promise.reject(new Error("offline"))) as UseCases["checkDeck"] }), deck);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("checks the instance and lists its decks", async () => {
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [deck]) });
    renderContainer(useCases, null);
    expect(await screen.findByRole("heading", { name: "Health of Deck set A" })).toBeInTheDocument();
    expect(useCases.checkInstance).toHaveBeenCalledWith(instanceA.url);
    expect(screen.getByRole("link", { name: "Kanji N5" })).toHaveAttribute("href", "#/health?deck=deck-1");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(useCases.checkInstance).toHaveBeenCalledTimes(2));
  });

  it("says why the instance could not be checked", async () => {
    renderContainer(makeUseCasesFake({ checkInstance: vi.fn(async () => Promise.reject(new Error("offline"))) }), null);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
