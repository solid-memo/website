import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import { DEFAULT_CARD_QUERY, type CardQuery } from "@solid-memo/domain/cardQuery";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ReviewState } from "@solid-memo/domain/review";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CardWorkbenchContainer } from "./CardWorkbenchContainer";
import { instanceA, makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const water = { ...makeCard(deck, "water"), back: { en: "**Water**" }, textFormat: SM.markdown };
const fire = makeCard(deck, "fire");
const today = studyDayOf(new Date(), DEFAULT_PREFERENCES.dayBoundaryHour);
const dueToday: ReviewState = {
  cardId: "fire",
  direction: "front-to-back",
  easeFactor: 2.5,
  intervalDays: 3,
  repetitions: 2,
  due: today,
  firstReviewedAt: "2026-09-21T10:00:00.000Z",
  lastReviewedAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 2,
};

function renderContainer(useCases: UseCases, query: CardQuery = DEFAULT_CARD_QUERY, of = deck) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CardWorkbenchContainer
        useCases={useCases}
        instance={instanceA}
        deck={of}
        query={query}
        onQuery={() => undefined}
        cardHref={(card) => `../#/card?card=${card.id}`}
        onOpen={() => undefined}
      />
    </QueryClientProvider>,
  );
}

const fronts = () =>
  within(screen.getByRole("table", { name: "The cards of Kanji N5" }))
    .getAllByRole("rowheader")
    .map((cell) => cell.textContent);

describe("CardWorkbenchContainer", () => {
  it("reads the deck's cards and review states, and lists those the query keeps", async () => {
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => [water, fire]),
      listDeckReviewStates: vi.fn(async () => [dueToday]),
    });
    renderContainer(useCases, { ...DEFAULT_CARD_QUERY, state: "due" });
    expect(screen.getByText("Loading cards…")).toBeInTheDocument();
    expect(await screen.findByText("1 of 2 cards")).toBeInTheDocument();
    expect(fronts()).toEqual(["fire"]);
    expect(useCases.listCards).toHaveBeenCalledWith(deck);
    expect(useCases.listDeckReviewStates).toHaveBeenCalledWith(deck);
    expect(useCases.getPreferences).toHaveBeenCalledWith(instanceA.url);
  });

  it("finds a card in Markdown by its plain text, and offers the cards' languages", async () => {
    renderContainer(makeUseCasesFake({ listCards: vi.fn(async () => [water, fire]) }), {
      ...DEFAULT_CARD_QUERY,
      text: "water",
      field: "back",
    });
    expect(await screen.findByText("1 of 2 cards")).toBeInTheDocument();
    expect(fronts()).toEqual(["water"]);
    expect(within(screen.getByRole("combobox", { name: "Language" })).getAllByRole("option")).toHaveLength(2);
  });

  it("labels a copy of a course", async () => {
    const url = "https://solid-memo.com/decks/solid/v1.ttl";
    const course: LibraryDeck = {
      url,
      ...firstRelease(url),
      title: { en: "Solid" },
      cardCount: 1,
      authors: [],
      direction: "front-to-back",
      sources: [],
      isCourse: true,
    };
    const copy = { ...deck, sourceUrl: url };
    renderContainer(
      makeUseCasesFake({ listCards: vi.fn(async () => [fire]), listLibraryDecks: vi.fn(async () => [course]) }),
      DEFAULT_CARD_QUERY,
      copy,
    );
    expect(await screen.findByText("A copy of a course: its cards are the course's questions.")).toBeInTheDocument();
  });

  it("says why the cards could not be read", async () => {
    renderContainer(
      makeUseCasesFake({
        listDeckReviewStates: vi.fn(async () => {
          throw new Error("Pod unreachable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Pod unreachable");
  });

  it("makes an edit of the selected cards with the plan the user saw, reads them afresh, and undoes it", async () => {
    let cards = [water, fire];
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => cards),
      listDeckReviewStates: vi.fn(async () => [dueToday]),
    });
    vi.mocked(useCases.editCards).mockImplementation(async (_instance, _deck, _ids, _edit, plan) => {
      cards = [water, { ...fire, retired: true }];
      return plan;
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select fire" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Selected cards" })).getByRole("button", { name: "Retire" }));
    expect(await screen.findByText("Retired 1 card.")).toBeInTheDocument();
    expect(useCases.editCards).toHaveBeenCalledWith(
      instanceA.url,
      deck,
      ["fire"],
      { kind: "retire" },
      expect.objectContaining({ save: [expect.objectContaining({ id: "fire", retired: true })] }),
    );
    // Read afresh: the card says it is retired.
    await waitFor(() => expect(screen.getByRole("row", { name: /fire/ })).toHaveClass("retired"));
    const undo = screen.getByRole("button", { name: "Undo" });
    await waitFor(() => expect(undo).toBeEnabled());
    fireEvent.click(undo);
    expect(await screen.findByText("Undone: the cards are as they were.")).toBeInTheDocument();
    expect(useCases.undoCardEdit).toHaveBeenCalledWith(instanceA.url, deck, vi.mocked(useCases.editCards).mock.calls[0]![4]);
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("says why an edit, or its undo, was not made", async () => {
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => [water, fire]),
      editCards: vi.fn(async () => {
        throw new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select fire" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Selected cards" })).getByRole("button", { name: "Retire" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This was changed elsewhere"));
    vi.mocked(useCases.editCards).mockImplementation(async (_instance, _deck, _ids, _edit, plan) => plan);
    vi.mocked(useCases.undoCardEdit).mockRejectedValue(new AppError("changedElsewhere", { url: deck.cardsDocumentUrl }));
    const retire = within(screen.getByRole("group", { name: "Selected cards" })).getByRole("button", { name: "Retire" });
    await waitFor(() => expect(retire).toBeEnabled());
    fireEvent.click(retire);
    // The error goes as the edit is made again.
    await waitFor(() => expect(screen.getByRole("alert")).toBeEmptyDOMElement());
    const undo = await screen.findByRole("button", { name: "Undo" });
    await waitFor(() => expect(undo).toBeEnabled());
    fireEvent.click(undo);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This was changed elsewhere"));
  });
});
