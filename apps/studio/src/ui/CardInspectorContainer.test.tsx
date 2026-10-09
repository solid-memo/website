import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card } from "@solid-memo/domain/deck";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { CardInspectorContainer, releaseLinkOf } from "./CardInspectorContainer";
import type { CardTab } from "./router";
import { makeCard, makeDeck } from "../test/fixtures";

afterEach(() => vi.unstubAllGlobals());

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const copy = { ...deck, sourceUrl: "https://solid-memo.com/decks/kanji/v1.ttl" };
const card: Card = { ...makeCard(deck, "water"), distractors: [{ id: "water-d1", text: { en: "fire" } }] };
const release = (cards: Partial<Card>[]) => ({ cards }) as unknown as LibraryDeckContent;

function renderContainer(useCases: UseCases, { tab = "distractors" as CardTab, of = deck, shown = card } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const onRemoved = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <CardInspectorContainer
        useCases={useCases}
        deck={of}
        card={shown}
        tab={tab}
        tabHref={(each) => `#${each}`}
        onTab={vi.fn()}
        appHref="#/card"
        onRemoved={onRemoved}
      />
    </QueryClientProvider>,
  );
  return { invalidate, queryClient, onRemoved };
}

describe("releaseLinkOf", () => {
  it("says how a card stands to its deck's release", () => {
    expect(releaseLinkOf(card, null)).toBe("none");
    expect(releaseLinkOf(card, undefined)).toBe("none");
    expect(releaseLinkOf(card, release([{ id: "other" }]))).toBe("none");
    expect(releaseLinkOf(card, release([{ ...card }]))).toBe("same");
    expect(releaseLinkOf(card, release([{ ...card, back: { en: "H2O" } }]))).toBe("changed");
  });
});

describe("CardInspectorContainer", () => {
  it("edits the card's content in Solid Memo's editor, without its wrong options", async () => {
    const useCases = makeUseCasesFake({ updateCard: vi.fn(async () => card) });
    renderContainer(useCases, { tab: "content" });
    expect(screen.queryByRole("group", { name: "Wrong options" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Card" })).toBeNull();
    fireEvent.input(screen.getByLabelText("Back"), { target: { value: "H2O" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(useCases.updateCard).toHaveBeenCalledWith(deck, card, { front: { en: "water" }, back: { en: "H2O" } }));
  });

  it("shows the card's schedule on its tab", async () => {
    const useCases = makeUseCasesFake();
    renderContainer(useCases, { tab: "schedule" });
    expect(await screen.findByText("Not studied this way yet: the card is new.")).toBeInTheDocument();
    expect(useCases.listDeckReviewStates).toHaveBeenCalledWith(deck);
  });

  it("saves each change of the wrong options as it is made, then reads the cards afresh", async () => {
    const useCases = makeUseCasesFake({ updateCard: vi.fn(async () => card) });
    const { invalidate, queryClient } = renderContainer(useCases);
    queryClient.setQueryData(["studyQueue", deck.url], { due: [card], newCards: [], studiedToday: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Retire the wrong option “fire”" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));
    expect(useCases.updateCard).toHaveBeenCalledWith(deck, card, { ...card, distractors: [{ id: "water-d1", text: { en: "fire" }, retired: true }] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cards", deck.cardsDocumentUrl] });
    expect(queryClient.getQueryData(["studyQueue", deck.url])).toBeUndefined();
  });

  it("says why a change could not be saved", async () => {
    renderContainer(
      makeUseCasesFake({
        updateCard: vi.fn(async () => {
          throw new Error("save refused");
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retire the wrong option “fire”" }));
    expect(await screen.findByText("save refused")).toBeInTheDocument();
  });

  it("keeps an option being written, as written, while it could not be saved", async () => {
    renderContainer(
      makeUseCasesFake({
        updateCard: vi.fn(async () => {
          throw new Error("save refused");
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add a wrong option" }));
    fireEvent.input(screen.getByLabelText("Wrong option"), { target: { value: "earth" } });
    fireEvent.input(screen.getByLabelText("Why it is wrong (optional)"), { target: { value: "Soil is not water." } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("save refused")).toBeInTheDocument();
    expect(screen.getByLabelText("Wrong option")).toHaveValue("earth");
    expect(screen.getByLabelText("Why it is wrong (optional)")).toHaveValue("Soil is not water.");
  });

  it("warns that an edit detaches the card from the release of a library copy, and deletes no option it published", async () => {
    renderContainer(makeUseCasesFake({ deckRelease: vi.fn(async () => release([card])) }), { of: copy });
    expect(await screen.findByRole("note")).toHaveTextContent("An edit detaches it");
    fireEvent.click(screen.getByRole("button", { name: "Delete the wrong option “fire”" }));
    expect(screen.getByText("This wrong option is in the release the deck came from, so it cannot be deleted. Retire it instead.")).toBeInTheDocument();
  });

  it("says when the card has no wrong options", () => {
    renderContainer(makeUseCasesFake(), { shown: makeCard(deck, "air") });
    expect(screen.getByText("This card has no wrong options.")).toBeInTheDocument();
  });

  it("deletes an option the deck's release does not have, once the user confirms", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const useCases = makeUseCasesFake({ updateCard: vi.fn(async () => card) });
    renderContainer(useCases);
    fireEvent.click(screen.getByRole("button", { name: "Delete the wrong option “fire”" }));
    await waitFor(() => expect(useCases.updateCard).toHaveBeenCalledWith(deck, card, { ...card, distractors: [] }));
  });
});
