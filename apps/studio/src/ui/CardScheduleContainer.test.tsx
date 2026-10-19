// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { CardScheduleContainer, directionSchedules } from "./CardScheduleContainer";
import { instanceA, makeCard, makeDeck } from "../test/fixtures";
import { answer } from "../test/dialogs";

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
const fsrsState: FsrsState = {
  cardId: "water",
  direction: "front-to-back",
  stability: 4,
  difficulty: 5,
  due: "2026-10-13",
  firstReviewedAt: state.firstReviewedAt,
  lastReviewedAt: state.lastReviewedAt,
  formatVersion: 1,
};
const sm2Only = { scheduler: "sm2" as const, dayBoundaryHour: 4 };
const fsrs6 = { scheduler: "fsrs6" as const, dayBoundaryHour: 4 };
// Four study days after the last review, in local time as study days are.
const now = new Date(new Date(state.lastReviewedAt).getTime() + 4 * 86_400_000);

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
    const of = (sm2: ReviewState[]) => ({ sm2, fsrs: [] });
    expect(directionSchedules(card, "front-to-back", of([other, state]), sm2Only, now)).toEqual([
      { direction: "front-to-back", state, studied: true, fsrs: null },
    ]);
    expect(directionSchedules(card, "bidirectional", of([state]), sm2Only, now)).toEqual([
      { direction: "front-to-back", state, studied: true, fsrs: null },
      { direction: "back-to-front", state: null, studied: true, fsrs: null },
    ]);
    expect(directionSchedules(card, "front-to-back", of([backwards]), sm2Only, now)).toEqual([
      { direction: "front-to-back", state: null, studied: true, fsrs: null },
      { direction: "back-to-front", state: backwards, studied: false, fsrs: null },
    ]);
  });

  it("gives FSRS-6's memory of a direction it has a state of, and whether it sets the due days", () => {
    const memory = {
      kind: "memory",
      stability: 4,
      difficulty: 5,
      // As many days after the last review as the stability: 90%.
      recall: expect.closeTo(0.9, 10),
      due: "2026-10-13",
    };
    const states = { sm2: [state, backwards], fsrs: [fsrsState] };
    expect(directionSchedules(card, "bidirectional", states, fsrs6, now)).toEqual([
      { direction: "front-to-back", state, studied: true, fsrs: { ...memory, sets: true } },
      {
        direction: "back-to-front",
        state: backwards,
        studied: true,
        fsrs: { kind: "estimated" },
      },
    ]);
    expect(directionSchedules(card, "bidirectional", states, sm2Only, now)).toEqual([
      { direction: "front-to-back", state, studied: true, fsrs: { ...memory, sets: false } },
      { direction: "back-to-front", state: backwards, studied: true, fsrs: null },
    ]);
  });

  it("says a stale FSRS-6 state is estimated anew while FSRS-6 schedules, and shows it while SM-2 does", () => {
    const stale = { ...fsrsState, lastReviewedAt: state.firstReviewedAt };
    const states = { sm2: [state], fsrs: [stale] };
    expect(directionSchedules(card, "front-to-back", states, fsrs6, now)[0]!.fsrs).toEqual({
      kind: "estimated",
    });
    expect(directionSchedules(card, "front-to-back", states, sm2Only, now)[0]!.fsrs).toMatchObject({
      kind: "memory",
      sets: false,
    });
  });

  it("leaves out an FSRS-6 state with no SM-2 state beside it", () => {
    expect(
      directionSchedules(card, "front-to-back", { sm2: [], fsrs: [fsrsState] }, fsrs6, now),
    ).toEqual([{ direction: "front-to-back", state: null, studied: true, fsrs: null }]);
  });
});

describe("CardScheduleContainer", () => {
  it("reads the deck's review states and sets the card due in one direction, then reads them afresh", async () => {
    let states = [state, backwards];
    const useCases = makeUseCasesFake({
      listDeckReviewStates: vi.fn(async () => ({ sm2: states, fsrs: [] })),
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
    expect(
      await screen.findByText("“Front → back” is now due on October 12, 2026."),
    ).toBeInTheDocument();
    expect(useCases.rescheduleCards).toHaveBeenCalledWith(
      instanceA.url,
      expect.objectContaining({ url: deck.url }),
      ["water"],
      "2026-10-12",
      "front-to-back",
    );
    await waitFor(() =>
      expect(forward.getAllByRole("definition")[0]).toHaveTextContent("October 12, 2026"),
    );
    expect(queryClient.getQueryData(["studyQueue", deck.url])).toBeUndefined();
  });

  it("forgets the card in one direction once the user confirms", async () => {
    let states = [state];
    const useCases = makeUseCasesFake({
      listDeckReviewStates: vi.fn(async () => ({ sm2: states, fsrs: [] })),
      resetCards: vi.fn(async () => {
        states = [];
        return 1;
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Forget progress" }));
    answer("Forget the card's progress", "Forget progress");
    expect(
      await screen.findByText("Forgot the card's progress in the direction “Front → back”."),
    ).toBeInTheDocument();
    expect(useCases.resetCards).toHaveBeenCalledWith(
      instanceA.url,
      deck,
      ["water"],
      "front-to-back",
    );
    expect(
      await screen.findByText("Not studied this way yet: the card is new."),
    ).toBeInTheDocument();
  });

  it("says why a change was not made", async () => {
    const useCases = makeUseCasesFake({
      listDeckReviewStates: vi.fn(async () => ({ sm2: [state], fsrs: [] })),
      rescheduleCards: vi.fn(async () => {
        throw new Error("Pod unreachable");
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Set due date" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Pod unreachable"));
  });

  it("shows FSRS-6's memory when the instance's preferences name it", async () => {
    const useCases = makeUseCasesFake({
      listDeckReviewStates: vi.fn(async () => ({ sm2: [state], fsrs: [fsrsState] })),
      getPreferences: vi.fn(async () => ({ ...DEFAULT_PREFERENCES, scheduler: "fsrs6" as const })),
    });
    renderContainer(useCases);
    const forward = within(await screen.findByRole("region", { name: "Front → back" }));
    expect(forward.getByRole("heading", { name: "FSRS-6" })).toBeInTheDocument();
    expect(forward.getByLabelText("Due on")).toHaveValue("2026-10-13");
    expect(useCases.getPreferences).toHaveBeenCalledWith(instanceA.url);
  });

  it("says why the preferences could not be read", async () => {
    renderContainer(
      makeUseCasesFake({
        getPreferences: vi.fn(async () => {
          throw new Error("Pod unreachable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Pod unreachable");
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
