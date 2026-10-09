import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardContainer } from "./CardContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { statusTexts } from "../test/liveRegions";
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

function renderContainer(useCases: UseCases, { shown = card, of = deck }: { shown?: Card; of?: Deck } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const onRemoved = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <CardContainer
        useCases={useCases}
        deck={of}
        card={shown}
        onRemoved={onRemoved}
      />
    </QueryClientProvider>,
  );
  return { onRemoved, invalidate, queryClient };
}

describe("CardContainer", () => {
  it("saves an edit, refreshes the deck's cards and confirms", async () => {
    const useCases = makeUseCasesFake({
      updateCard: vi.fn(async () => ({ ...card, back: { en: "water (mizu)" } })),
    });
    const { invalidate, queryClient } = renderContainer(useCases);
    const queueKey = ["studyQueue", deck.url];
    queryClient.setQueryData(queueKey, { due: [card], newCards: [], studiedToday: 0 });

    fireEvent.input(screen.getByLabelText("Back"), {
      target: { value: "water (mizu)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(statusTexts()).toEqual(["Saved."]));
    expect(useCases.updateCard).toHaveBeenCalledWith(deck, card, {
      front: { ja: "水" },
      back: { en: "water (mizu)" },
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["cards", deck.cardsDocumentUrl],
    });
    await waitFor(() => {
      expect(queryClient.getQueryData(queueKey)).toBeUndefined();
    });
  });

  it("starts the card's new text in the language the deck's cards have", async () => {
    const other: Card = { ...card, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2`, backNote: { sv: "Ett element." } };
    renderContainer(makeUseCasesFake({ listCards: vi.fn(async () => [card, other]) }));
    await waitFor(() => expect(document.getElementById("card-back-label-language-0")).toHaveTextContent("Language: Swedish"));
  });

  it("deletes none of the wrong options the deck's release published, nor any while it is read", async () => {
    const withOptions: Card = { ...card, distractors: [{ id: "card-1-d1", text: { en: "fire" } }, { id: "card-1-d2", text: { en: "air" } }] };
    const release = { cards: [{ ...withOptions, distractors: [withOptions.distractors![0]!] }] };
    let read: (value: never) => void = () => undefined;
    const deckRelease = vi.fn(() => new Promise<never>((resolve) => (read = resolve)));
    const of = { ...deck, sourceUrl: "https://solid-memo.com/decks/kanji/v1.ttl" };
    renderContainer(makeUseCasesFake({ deckRelease }), { shown: withOptions, of });
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const refusal = "This wrong option is in the release the deck came from, so it cannot be deleted. Retire it instead.";
    fireEvent.click(screen.getByRole("button", { name: "Delete the wrong option “air”" }));
    expect(await screen.findByText(refusal)).toBeInTheDocument();
    await waitFor(() => expect(deckRelease).toHaveBeenCalled());
    read(release as never);
    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "Delete the wrong option “air”" }));
      expect(confirm).toHaveBeenCalledWith("Delete the wrong option “air”?");
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete the wrong option “fire”" }));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("shows a save error", async () => {
    renderContainer(
      makeUseCasesFake({
        updateCard: vi.fn(async () => {
          throw new Error("update refused");
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("update refused")).toBeInTheDocument();
  });

  it("removes the card, refreshes cards and reviews, then leaves", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const useCases = makeUseCasesFake();
    const { onRemoved, invalidate, queryClient } = renderContainer(useCases);
    const queueKey = ["studyQueue", deck.url];
    queryClient.setQueryData(queueKey, { due: [card], newCards: [], studiedToday: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Remove card" }));

    await waitFor(() => {
      expect(onRemoved).toHaveBeenCalledOnce();
    });
    expect(useCases.removeCard).toHaveBeenCalledWith(deck, card);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["cards", deck.cardsDocumentUrl],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["reviews", deck.reviewsDocumentUrl],
    });
    expect(queryClient.getQueryData(queueKey)).toBeUndefined();
  });

  it("shows a remove error and stays", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const { onRemoved } = renderContainer(
      makeUseCasesFake({
        removeCard: vi.fn(async () => {
          throw new Error("remove refused");
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove card" }));
    expect(await screen.findByText("remove refused")).toBeInTheDocument();
    expect(onRemoved).not.toHaveBeenCalled();
  });
});
