// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CardProgressReport, DeckProgress } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { easeHistogram, intervalHistogram } from "@solid-memo/domain/scheduleInsight";
import type { ReviewState } from "@solid-memo/domain/review";
import { courseLibraryDeck } from "../test/course";
import { makeUseCasesFake } from "../test/useCasesFake";
import { CardProgressContainer } from "./CardProgressContainer";

const INSTANCE = { url: "https://pod.example/solid-memo/a/", name: "A" };
const deckOf = (id: string, title: string): Deck => ({
  id,
  url: `${INSTANCE.url}catalog.ttl#${id}`,
  title: { en: title },
  cardsDocumentUrl: `${INSTANCE.url}decks/${id}.ttl`,
  reviewsDocumentUrl: `${INSTANCE.url}reviews/${id}.ttl`,
  createdAt: "",
  formatVersion: 4,
  direction: "front-to-back",
  authors: [],
});
const capitals = deckOf("deck-1", "Capitals");
const rivers = deckOf("deck-2", "Rivers");
const state = (intervalDays: number): ReviewState => ({
  cardId: "a",
  direction: "front-to-back",
  easeFactor: 2.5,
  intervalDays,
  repetitions: 1,
  due: "2026-09-22",
  firstReviewedAt: "2026-09-01T10:00:00.000Z",
  lastReviewedAt: "2026-09-20T10:00:00.000Z",
  formatVersion: 2,
});
/** A deck's figures: nothing studied, nothing due, unless given. */
const progressOf = (deck: Deck, extra: Partial<DeckProgress> = {}): DeckProgress => ({
  deck,
  progress: { new: 0, relearning: 0, young: 0, mature: 0 },
  forecast: [],
  intervals: intervalHistogram([]),
  eases: easeHistogram([]),
  overdue: 0,
  daysToClear: 0,
  newCardsPerDay: 5,
  introducedToday: 0,
  ...extra,
});
const report: CardProgressReport = {
  today: "2026-09-21",
  decks: [
    progressOf(capitals, {
      progress: { new: 12, relearning: 0, young: 1, mature: 0 },
      forecast: [
        { studyDay: "2026-09-21", due: 1, reviews: 1 },
        { studyDay: "2026-09-22", due: 0, reviews: 0 },
      ],
      intervals: intervalHistogram([state(1)]),
      eases: easeHistogram([state(1)]),
      overdue: 1,
    }),
    progressOf(rivers, {
      progress: { new: 0, relearning: 1, young: 0, mature: 3 },
      forecast: [
        { studyDay: "2026-09-21", due: 0, reviews: 0 },
        { studyDay: "2026-09-22", due: 2, reviews: 1 },
        { studyDay: "2026-09-23", due: 0, reviews: 1 },
      ],
      intervals: intervalHistogram([state(1), state(30), state(40), state(50)]),
      eases: easeHistogram([state(1), state(30), state(40), state(50)]),
      overdue: 2,
      daysToClear: 2,
      newCardsPerDay: 0,
    }),
  ],
};

function withQueries(node: preact.ComponentChildren) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}

describe("CardProgressContainer", () => {
  it("shows every deck's maturity, figures, forecast and spread together, then each deck's maturity", async () => {
    const useCases = makeUseCasesFake({ getCardProgress: vi.fn(async () => report) });
    const { container } = withQueries(
      <CardProgressContainer useCases={useCases} instance={INSTANCE} />,
    );
    expect(screen.getByRole("heading", { name: "Where your cards stand" })).toBeInTheDocument();
    expect(screen.getByText("Loading your cards' progress…")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: "12 new, 1 relearning, 1 young and 3 mature." }),
    ).toBeInTheDocument();
    expect(useCases.getCardProgress).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {});
    expect(screen.getByRole("group", { name: "Overdue" })).toHaveTextContent("3");
    // The deck that takes longest: two days after today.
    expect(screen.getByRole("group", { name: "Caught up with reviews" })).toHaveTextContent(
      "September 23, 2026in 2 days, at your daily review limit",
    );
    // When new cards run out is each deck's own.
    expect(screen.queryByRole("group", { name: "New cards run out" })).toBeNull();
    const forecast = container.querySelector<HTMLElement>(".bar-chart")!;
    expect(forecast.querySelectorAll('g[data-bar="2026-09-22"] rect.bar')).toHaveLength(2);
    expect(within(forecast).getByRole("cell", { name: "2" })).toBeInTheDocument();
    // The intervals of both decks' studied prompts, merged bin by bin.
    fireEvent.click(container.querySelector('.bar-chart g[data-bar="1"]')!);
    expect(screen.getByText("1 day: 2.")).toBeInTheDocument();
    expect(screen.getByText("Show how easy cards feel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Maturity by deck" })).toBeInTheDocument();
    const decks = within(container.querySelector<HTMLElement>(".maturity-decks")!).getAllByRole(
      "figure",
    );
    expect(decks.map((figure) => figure.querySelector("figcaption")!.textContent)).toEqual([
      "Capitals",
      "Rivers",
    ]);
    expect(
      within(decks[1]!).getByRole("img", { name: "0 new, 1 relearning, 0 young and 3 mature." }),
    ).toBeInTheDocument();
    const lines = container.querySelectorAll(".maturity-decks li");
    // Twelve new at five a day: today, tomorrow and the day after.
    expect(lines[0]).toHaveTextContent(
      "New cards run out on September 23, 2026, studying each day.",
    );
    // None new: nothing to run out.
    expect(lines[1]!.querySelector(".run-out")).toBeNull();
  });

  it("shows one deck's progress alone, all new before its first answer, with when they run out", async () => {
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () => ({
        today: "2026-09-21",
        decks: [progressOf(capitals, { progress: { new: 4, relearning: 0, young: 0, mature: 0 } })],
      })),
    });
    const { container } = withQueries(
      <CardProgressContainer useCases={useCases} instance={INSTANCE} deck={capitals} />,
    );
    expect(
      await screen.findByRole("img", { name: "4 new, 0 relearning, 0 young and 0 mature." }),
    ).toBeInTheDocument();
    expect(useCases.getCardProgress).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {
      deck: capitals,
    });
    expect(container.querySelectorAll(".bar-chart rect.bar")).toHaveLength(0);
    expect(container.querySelectorAll(".bar-chart g[data-bar]")).toHaveLength(30);
    expect(screen.getByRole("group", { name: "Overdue" })).toHaveTextContent("0due before today");
    expect(screen.getByRole("group", { name: "Caught up with reviews" })).toHaveTextContent(
      "TodayYour daily review limit holds nothing back.",
    );
    expect(screen.getByRole("group", { name: "New cards run out" })).toHaveTextContent(
      "September 21, 2026at 5 new cards a day, studying each day",
    );
    // Nothing studied: no spread to show.
    expect(screen.queryByText("Days until cards come back")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Maturity by deck" })).toBeNull();
  });

  it("counts the new cards met today against today's cap when they run out", async () => {
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () => ({
        today: "2026-09-21",
        // Three of today's 5 met: 2 more today, the other 2 tomorrow.
        decks: [
          progressOf(capitals, {
            progress: { new: 4, relearning: 0, young: 3, mature: 0 },
            introducedToday: 3,
          }),
        ],
      })),
    });
    withQueries(<CardProgressContainer useCases={useCases} instance={INSTANCE} deck={capitals} />);
    expect(await screen.findByRole("group", { name: "New cards run out" })).toHaveTextContent(
      "September 22, 2026at 5 new cards a day, studying each day",
    );
  });

  it("says a deck's new cards never run out at a cap of 0, and nothing of it once none is new", async () => {
    const at = (extra: Partial<DeckProgress>) =>
      makeUseCasesFake({
        getCardProgress: vi.fn(async () => ({
          today: "2026-09-21",
          decks: [progressOf(capitals, extra)],
        })),
      });
    const never = withQueries(
      <CardProgressContainer
        useCases={at({
          progress: { new: 4, relearning: 0, young: 0, mature: 0 },
          newCardsPerDay: 0,
        })}
        instance={INSTANCE}
        deck={capitals}
      />,
    );
    expect(await screen.findByRole("group", { name: "New cards run out" })).toHaveTextContent(
      "NeverThis deck takes no new cards a day.",
    );
    never.unmount();
    const listed = withQueries(
      <CardProgressContainer
        useCases={at({
          progress: { new: 4, relearning: 0, young: 0, mature: 0 },
          newCardsPerDay: 0,
        })}
        instance={INSTANCE}
      />,
    );
    expect(await screen.findByText("No new cards a day: they never run out.")).toBeInTheDocument();
    listed.unmount();
    withQueries(<CardProgressContainer useCases={at({})} instance={INSTANCE} deck={capitals} />);
    await screen.findByRole("group", { name: "Overdue" });
    expect(screen.queryByRole("group", { name: "New cards run out" })).toBeNull();
  });

  it("says when the reviews held back are not caught up within the forecast, and how many wait then", async () => {
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () => ({
        today: "2026-09-21",
        decks: [
          progressOf(capitals, {
            forecast: [
              { studyDay: "2026-09-21", due: 9, reviews: 2 },
              { studyDay: "2026-09-22", due: 0, reviews: 2 },
            ],
            daysToClear: null,
          }),
          progressOf(rivers, {
            forecast: [
              { studyDay: "2026-09-21", due: 2, reviews: 1 },
              { studyDay: "2026-09-22", due: 0, reviews: 1 },
            ],
            daysToClear: 1,
          }),
        ],
      })),
    });
    withQueries(<CardProgressContainer useCases={useCases} instance={INSTANCE} />);
    expect(await screen.findByRole("group", { name: "Caught up with reviews" })).toHaveTextContent(
      "Not within 2 days5 reviews still waiting after them",
    );
  });

  it("says nothing of when a course's new cards run out: its cards join it as they are answered", async () => {
    const course = { ...capitals, sourceUrl: courseLibraryDeck.url };
    const useCases = makeUseCasesFake({
      listLibraryDecks: vi.fn(async () => [courseLibraryDeck]),
      getCardProgress: vi.fn(async () => ({
        today: "2026-09-21",
        decks: [progressOf(course, { progress: { new: 4, relearning: 0, young: 0, mature: 0 } })],
      })),
    });
    const { container } = withQueries(
      <CardProgressContainer useCases={useCases} instance={INSTANCE} />,
    );
    await screen.findByRole("heading", { name: "Maturity by deck" });
    await waitFor(() => expect(useCases.listLibraryDecks).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector(".run-out")).toBeNull());
    const alone = withQueries(
      <CardProgressContainer useCases={useCases} instance={INSTANCE} deck={course} />,
    ).container as HTMLElement;
    await within(alone).findByRole("group", { name: "Overdue" });
    await waitFor(() =>
      expect(within(alone).queryByRole("group", { name: "New cards run out" })).toBeNull(),
    );
  });

  it("leaves out the decks' own bars when there are no decks", async () => {
    withQueries(<CardProgressContainer useCases={makeUseCasesFake()} instance={INSTANCE} />);
    expect(
      await screen.findByRole("img", { name: "0 new, 0 relearning, 0 young and 0 mature." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Caught up with reviews" })).toHaveTextContent(
      "Today",
    );
    expect(screen.queryByRole("heading", { name: "Maturity by deck" })).toBeNull();
  });

  it("says quietly when the progress cannot be read", async () => {
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () => Promise.reject(new Error("offline"))),
    });
    withQueries(<CardProgressContainer useCases={useCases} instance={INSTANCE} />);
    expect(
      await screen.findByText("Your cards' progress cannot be read just now."),
    ).toBeInTheDocument();
    expect(screen.queryByText("offline")).toBeNull();
  });
});
