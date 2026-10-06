import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LibraryPreviewContainer } from "./LibraryPreviewContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { LibraryCard, LibraryDeck } from "@solid-memo/domain/library";
import { makeUseCasesFake } from "../test/useCasesFake";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";

const capitals: LibraryDeck = {
  url: "https://solid-memo.com/decks/capitals/v1.ttl",
  ...firstRelease("https://solid-memo.com/decks/capitals/v1.ttl"),
  title: { en: "Capitals" },
  cardCount: 3,
  authors: [],
  direction: "front-to-back",
  sources: [],
};

function card(front: string, back: string): LibraryCard {
  return { id: front.toLowerCase(), front: { "": front }, back: { "": back }, formatVersion: 1 };
}

const CARDS = [
  card("Sweden", "Stockholm"),
  card("Norway", "Oslo"),
  card("Finland", "Helsinki"),
];

/** A random source handing out the given values in turn. */
function randomOf(...values: number[]) {
  return vi.fn(() => values.shift()!);
}

function renderContainer({
  useCases = makeUseCasesFake({ listLibraryCards: vi.fn(async () => CARDS) }),
  deck = capitals,
  random = randomOf(0),
}: {
  useCases?: UseCases;
  deck?: LibraryDeck;
  random?: () => number;
} = {}) {
  const onExit = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <LibraryPreviewContainer
        useCases={useCases}
        deck={deck}
        deckHref="#/library-deck?deck=capitals"
        onExit={onExit}
        random={random}
      />
    </QueryClientProvider>,
  );
  return { onExit };
}

function question() {
  return document.querySelector(".card-question p")!.textContent;
}

describe("LibraryPreviewContainer", () => {
  it("shows a loading state, then a random card of the deck", async () => {
    const listLibraryCards = vi.fn(async () => CARDS);
    renderContainer({
      useCases: makeUseCasesFake({ listLibraryCards }),
      random: randomOf(0.5),
    });
    expect(screen.getByText("Loading cards…")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Preview: Capitals" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Capitals" })).toHaveAttribute(
      "href",
      "#/library-deck?deck=capitals",
    );
    expect(screen.getByText(/Nothing is recorded/)).toBeInTheDocument();
    expect(question()).toBe("Norway");
    expect(screen.queryByText("Oslo")).toBeNull();
    expect(listLibraryCards).toHaveBeenCalledWith(capitals);
  });

  it("shows the question's note only once the answer is revealed", async () => {
    const noted = [{ ...card("Sweden", "Stockholm"), frontNote: { en: "A kingdom." } }];
    renderContainer({ useCases: makeUseCasesFake({ listLibraryCards: vi.fn(async () => noted) }) });
    await screen.findByRole("button", { name: "Reveal" });
    expect(screen.queryByText("A kingdom.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("A kingdom.")).toBeInTheDocument();
  });

  it("reveals the answer, then moves on to another random card, unrevealed", async () => {
    renderContainer({ random: randomOf(0.5, 0, 0.99) });
    fireEvent.click(await screen.findByRole("button", { name: "Reveal" }));
    expect(screen.getByText("Oslo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Again|Good/ })).toBeNull();

    expect(document.activeElement).toHaveTextContent("Answer: Oslo");

    fireEvent.click(screen.getByRole("button", { name: "Next card" }));
    expect(question()).toBe("Finland");
    expect(screen.queryByText("Helsinki")).toBeNull();
    expect(document.activeElement).toHaveTextContent("Question: Finland");

    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    fireEvent.click(screen.getByRole("button", { name: "Next card" }));
    expect(question()).toBe("Norway");
  });

  it("asks both ways in a deck studied in both directions", async () => {
    renderContainer({
      useCases: makeUseCasesFake({
        listLibraryCards: vi.fn(async () => [card("Sweden", "Stockholm")]),
      }),
      deck: { ...capitals, direction: "bidirectional" },
      random: randomOf(0, 0),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Reveal" }));
    expect(question()).toBe("Sweden");
    fireEvent.click(screen.getByRole("button", { name: "Next card" }));
    expect(question()).toBe("Stockholm");
  });

  it("shows the only card again, unrevealed, when it is the only one", async () => {
    renderContainer({
      useCases: makeUseCasesFake({
        listLibraryCards: vi.fn(async () => [card("Sweden", "Stockholm")]),
      }),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Reveal" }));
    fireEvent.click(screen.getByRole("button", { name: "Next card" }));
    expect(question()).toBe("Sweden");
    expect(screen.getByRole("button", { name: "Reveal" })).toBeInTheDocument();
  });

  it("says so when the deck has no cards", async () => {
    renderContainer({
      useCases: makeUseCasesFake({ listLibraryCards: vi.fn(async () => []) }),
    });
    expect(
      await screen.findByText("This deck has no cards."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reveal" })).toBeNull();
  });

  it("goes back to the library", async () => {
    const { onExit } = renderContainer();
    fireEvent.click(
      await screen.findByRole("button", { name: "Back to library" }),
    );
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("shows an error when the deck cannot be read", async () => {
    renderContainer({
      useCases: makeUseCasesFake({
        listLibraryCards: vi.fn(async () => {
          throw new Error("library offline");
        }),
      }),
    });
    expect((await screen.findByText("library offline")).closest(".error")).toBeInTheDocument();
  });
});
