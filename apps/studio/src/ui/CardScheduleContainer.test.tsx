import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { ReviewState } from "@solid-memo/domain/review";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { CardScheduleContainer, directionSchedules } from "./CardScheduleContainer";
import { instanceA, makeCard, makeDeck } from "../test/fixtures";

afterEach(() => vi.unstubAllGlobals());

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const card = makeCard(deck, "water");
const state: ReviewState = {
  cardId: "water",
  direction: "front-to-back",
  easeFactor: 2.5,
  intervalDays: 6,
  repetitions: 2,
  due: "2026-10-24",
  firstReviewedAt: "2026-09-21T12:00:00.000Z",
  lastReviewedAt: "2026-10-09T12:00:00.000Z",
  formatVersion: 2,
};
const backwards = { ...state, direction: "back-to-front" as const };

function renderContainer(useCases: UseCases, of: Deck = deck) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CardScheduleContainer useCases={useCases} deck={of} card={card} />
    </QueryClientProvider>,
  );
  return { queryClient };
}

describe("directionSchedules", () => {
  it("lists the directions the deck studies, then one it no longer does while the card has a state there", () => {
    const other = { ...state, cardId: "fire" };
    expect(directionSchedules(card, "front-to-back", [other, state])).toEqual([{ direction: "front-to-back", state, studied: true }]);
    expect(directionSchedules(card, "bidirectional", [state])).toEqual([
      { direction: "front-to-back", state, studied: true },
      { direction: "back-to-front", state: null, studied: true },
    ]);
    expect(directionSchedules(card, "front-to-back", [backwards])).toEqual([
      { direction: "front-to-back", state: null, studied: true },
      { direction: "back-to-front", state: backwards, studied: false },
    ]);
  });
});

describe("CardScheduleContainer", () => {
  it("reads the deck's review states and sets the card due in one direction, then reads them afresh", async () => {
    let states = [state, backwards];
    const useCases = makeUseCasesFake({
      listDeckReviewStates: vi.fn(async () => states),
      rescheduleCards: vi.fn(async () => {
        states = [{ ...state, due: "2026-10-12" }, backwards];
        return 1;
      }),
    });
    const { queryClient } = renderContainer(useCases, { ...deck, direction: "bidirectional" });
    queryClient.setQueryData(["studyQueue", deck.url], { due: [], newCards: [], studiedToday: 0 });
    expect(screen.getByText("Loading the schedule…")).toBeInTheDocument();
    const forward = within(await screen.findByRole("region", { name: "Front → back" }));
    fireEvent.input(forward.getByLabelText("Due on"), { target: { value: "2026-10-12" } });
    fireEvent.click(forward.getByRole("button", { name: "Set due date" }));
    expect(await screen.findByText("“Front → back” is now due on October 12, 2026.")).toBeInTheDocument();
    expect(useCases.rescheduleCards).toHaveBeenCalledWith(instanceA.url, expect.objectContaining({ url: deck.url }), ["water"], "2026-10-12", "front-to-back");
    await waitFor(() => expect(forward.getAllByRole("definition")[0]).toHaveTextContent("October 12, 2026"));
    expect(queryClient.getQueryData(["studyQueue", deck.url])).toBeUndefined();
  });

  it("forgets the card in one direction once the user confirms", async () => {
    vi.stubGlobal("confirm", () => true);
    let states = [state];
    const useCases = makeUseCasesFake({
      listDeckReviewStates: vi.fn(async () => states),
      resetCards: vi.fn(async () => {
        states = [];
        return 1;
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Forget progress" }));
    expect(await screen.findByText("Forgot the card's progress in the direction “Front → back”.")).toBeInTheDocument();
    expect(useCases.resetCards).toHaveBeenCalledWith(instanceA.url, deck, ["water"], "front-to-back");
    expect(await screen.findByText("Not studied this way yet: the card is new.")).toBeInTheDocument();
  });

  it("says why a change was not made", async () => {
    const useCases = makeUseCasesFake({
      listDeckReviewStates: vi.fn(async () => [state]),
      rescheduleCards: vi.fn(async () => {
        throw new Error("Pod unreachable");
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Set due date" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Pod unreachable"));
  });

  it("says why the review states could not be read", async () => {
    renderContainer(
      makeUseCasesFake({
        listDeckReviewStates: vi.fn(async () => {
          throw new Error("Pod unreachable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Pod unreachable");
  });
});
