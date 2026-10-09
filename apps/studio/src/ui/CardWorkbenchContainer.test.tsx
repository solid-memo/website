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
const nouns = makeDeck("nouns", { en: "Nouns" });
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
        decks={[deck, nouns]}
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

  it("forgets or reschedules the selected cards' progress, says what it did, and reads the review states afresh", async () => {
    let states = [dueToday];
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => [water, fire]),
      listDeckReviewStates: vi.fn(async () => states),
      rescheduleCards: vi.fn(async () => {
        states = [{ ...dueToday, due: "2099-01-01" }];
        return 1;
      }),
    });
    vi.mocked(useCases.editCards).mockImplementation(async (_instance, _deck, _ids, _edit, plan) => plan);
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select fire" }));
    const bulk = () => within(screen.getByRole("group", { name: "Selected cards" }));
    fireEvent.click(bulk().getByRole("button", { name: "Retire" }));
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
    await waitFor(() => expect(bulk().getByRole("button", { name: "Set due date" })).toBeEnabled());
    fireEvent.click(bulk().getByRole("button", { name: "Set due date" }));
    expect(screen.getByLabelText("Due on")).toHaveValue(today);
    fireEvent.input(screen.getByLabelText("Due on"), { target: { value: "2099-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("Set 1 card due on January 1, 2099.")).toBeInTheDocument();
    expect(useCases.rescheduleCards).toHaveBeenCalledWith(instanceA.url, deck, ["fire"], "2099-01-01");
    // The card edit before it is no longer the last one: it cannot be undone.
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("row", { name: /fire/ })).toHaveTextContent("January 1, 2099"));

    vi.stubGlobal("confirm", () => true);
    fireEvent.click(bulk().getByRole("button", { name: "Forget progress" }));
    expect(await screen.findByText("Forgot the progress of 1 card.")).toBeInTheDocument();
    expect(useCases.resetCards).toHaveBeenCalledWith(instanceA.url, deck, ["fire"]);
    vi.unstubAllGlobals();
  });

  it("says why progress could not be forgotten", async () => {
    vi.stubGlobal("confirm", () => true);
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async () => [water, fire]),
      resetCards: vi.fn(async () => {
        throw new Error("Pod unreachable");
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select fire" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Selected cards" })).getByRole("button", { name: "Forget progress" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Pod unreachable"));
    vi.unstubAllGlobals();
  });

  it("moves the selected cards to another deck, says what it did, and reads both decks afresh", async () => {
    let cards = [water, fire];
    const useCases = makeUseCasesFake({
      listCards: vi.fn(async (of) => (of.url === deck.url ? cards : [])),
      transferCards: vi.fn(async () => {
        cards = [water];
        return {
          cards: [{ from: "fire", to: "fire-2", present: false }],
          missing: ["gone"],
          target: { save: [], reviewSaves: [], reviewRemovals: [] },
          source: { remove: ["fire"], reviewRemovals: [] },
        };
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select fire" }));
    const bulk = () => within(screen.getByRole("group", { name: "Selected cards" }));
    fireEvent.click(bulk().getByRole("button", { name: "Move to deck…" }));
    // The deck itself is no choice.
    expect(within(screen.getByRole("combobox", { name: "To the deck" })).getAllByRole("option").map((o) => o.textContent)).toEqual(["Nouns"]);
    fireEvent.click(screen.getByRole("button", { name: "Move 1 card" }));
    expect(
      await screen.findByText("Moved 1 card to Nouns. 1 card got a new id: the deck already had one with its id. 1 card was left as it was."),
    ).toBeInTheDocument();
    expect(useCases.transferCards).toHaveBeenCalledWith(instanceA.url, deck, nouns, ["fire"], { mode: "move", keepProgress: true });
    await waitFor(() => expect(fronts()).toEqual(["water"]));
    expect(screen.getByText("0 cards selected")).toBeInTheDocument();
  });

  it("says when a copy found cards there already, and why a transfer was not made", async () => {
    const useCases = makeUseCasesFake({ listCards: vi.fn(async () => [water, fire]) });
    vi.mocked(useCases.transferCards).mockResolvedValueOnce({
      cards: [{ from: "fire", to: "fire", present: true }],
      missing: [],
      target: { save: [], reviewSaves: [], reviewRemovals: [] },
      source: { remove: [], reviewRemovals: [] },
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select fire" }));
    const bulk = () => within(screen.getByRole("group", { name: "Selected cards" }));
    fireEvent.click(bulk().getByRole("button", { name: "Copy to deck…" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy 1 card" }));
    expect(await screen.findByText("Copied 1 card to Nouns. 1 card was there already.")).toBeInTheDocument();
    // Still selected: a copy leaves the cards where they are.
    expect(screen.getByText("1 card selected")).toBeInTheDocument();

    vi.mocked(useCases.transferCards).mockRejectedValueOnce(new Error("Pod unreachable"));
    await waitFor(() => expect(bulk().getByRole("button", { name: "Copy to deck…" })).toBeEnabled());
    fireEvent.click(bulk().getByRole("button", { name: "Copy to deck…" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy 1 card" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Pod unreachable"));
  });
});
