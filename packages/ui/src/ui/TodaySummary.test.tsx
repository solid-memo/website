// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentChildren } from "preact";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Answer } from "@solid-memo/domain/answer";
import type { Deck } from "@solid-memo/domain/deck";
import type { TodaySummary as Today } from "@solid-memo/domain/statistics";
import { makeUseCasesFake } from "../test/useCasesFake";
import { todayFiguresFrom } from "../test/fakes/statistics";
import { statisticsHref } from "./router";
import { TodaySummary } from "./TodaySummary";
import { TodaySummaryContainer } from "./TodaySummaryContainer";

const INSTANCE = { url: "https://pod.example/solid-memo/a/", name: "A" };
const today = (summary: Partial<Today> = {}): Today => ({
  answers: 4,
  introduced: 2,
  recall: { reviews: 2, recalled: 1 },
  streak: 1,
  longestStreak: 1,
  week: { answers: 4, previous: 0 },
  ...summary,
});

describe("TodaySummary", () => {
  it("leads with the streak, then praises the day's work with its numbers", () => {
    render(<TodaySummary today={today()} statisticsHref="#/statistics" />);
    const strip = screen.getByRole("complementary", { name: "Today" });
    expect(strip).toHaveTextContent(
      "1-day streak Day one! Come back tomorrow for two." +
        "Nice work! 4 cards · 2 new · 50% remembered of 2 reviews · 4 this week · All statistics",
    );
    expect(screen.getByRole("link", { name: "All statistics" })).toHaveAttribute(
      "href",
      "#/statistics",
    );
  });

  it("gives the share remembered with its count, however few, and none without a review", () => {
    const { rerender } = render(
      <TodaySummary
        today={today({ recall: { reviews: 1, recalled: 1 } })}
        statisticsHref="#/statistics"
      />,
    );
    expect(screen.getByText(/· 100% remembered of 1 review ·/)).toBeInTheDocument();
    rerender(
      <TodaySummary
        today={today({ recall: { reviews: 0, recalled: 0 } })}
        statisticsHref="#/statistics"
      />,
    );
    expect(screen.getByRole("complementary", { name: "Today" })).toHaveTextContent(
      /Nice work! 4 cards · 2 new · 4 this week · All statistics$/,
    );
  });

  it("compares the week so far with the same days of last week, when it had any", () => {
    const { rerender } = render(
      <TodaySummary
        today={today({ week: { answers: 12, previous: 10 } })}
        statisticsHref="#/statistics"
      />,
    );
    expect(screen.getByText(/· 12 this week, \+20% on last week ·/)).toBeInTheDocument();
    rerender(
      <TodaySummary
        today={today({ week: { answers: 5, previous: 10 } })}
        statisticsHref="#/statistics"
      />,
    );
    expect(screen.getByText(/· 5 this week, -50% on last week ·/)).toBeInTheDocument();
  });

  it("celebrates a record streak, and otherwise names the record to beat", () => {
    const { rerender } = render(
      <TodaySummary today={today({ streak: 3, longestStreak: 3 })} statisticsHref="#/statistics" />,
    );
    expect(screen.getByText("3-day streak")).toBeInTheDocument();
    expect(screen.getByText("Your longest yet!")).toBeInTheDocument();
    rerender(
      <TodaySummary today={today({ streak: 3, longestStreak: 9 })} statisticsHref="#/statistics" />,
    );
    expect(screen.getByText("Record: 9 days")).toBeInTheDocument();
  });

  it("says how many cards are left to study today, once known and while there are any", () => {
    const { rerender } = render(
      <TodaySummary today={today()} left={7} statisticsHref="#/statistics" />,
    );
    expect(
      screen.getByText(/· 50% remembered of 2 reviews · 7 left to study today · 4 this week ·/),
    ).toBeInTheDocument();
    rerender(<TodaySummary today={today()} left={0} statisticsHref="#/statistics" />);
    expect(screen.queryByText(/left to study today/)).toBeNull();
  });

  it("says about how long the cards left will take, once known and while there are any", () => {
    const { rerender } = render(
      <TodaySummary today={today()} left={7} minutesLeft={3} statisticsHref="#/statistics" />,
    );
    expect(
      screen.getByText(/· 7 left to study today · about 3 minutes to go · 4 this week ·/),
    ).toBeInTheDocument();
    rerender(
      <TodaySummary today={today()} left={0} minutesLeft={1} statisticsHref="#/statistics" />,
    );
    expect(screen.queryByText(/to go/)).toBeNull();
    rerender(<TodaySummary today={today()} minutesLeft={1} statisticsHref="#/statistics" />);
    expect(screen.queryByText(/to go/)).toBeNull();
  });

  it("cheers louder the more was studied", () => {
    const { rerender } = render(
      <TodaySummary today={today({ answers: 10 })} statisticsHref="#/statistics" />,
    );
    expect(screen.getByText(/^Great session! 10 cards/)).toBeInTheDocument();
    rerender(
      <TodaySummary today={today({ answers: 50, introduced: 1 })} statisticsHref="#/statistics" />,
    );
    expect(screen.getByText(/^Impressive effort! 50 cards · 1 new/)).toBeInTheDocument();
  });
});

describe("TodaySummaryContainer", () => {
  function renderContainer(
    getTodayFigures: UseCases["getTodayFigures"],
    {
      decks = [],
      getStudyCounts,
    }: { decks?: Deck[]; getStudyCounts?: UseCases["getStudyCounts"] } = {},
  ) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = (node: ComponentChildren) => (
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    );
    return render(
      wrap(
        <TodaySummaryContainer
          useCases={makeUseCasesFake({
            getTodayFigures,
            ...(getStudyCounts === undefined ? {} : { getStudyCounts }),
          })}
          instance={INSTANCE}
          decks={decks}
        />,
      ),
    );
  }
  const deckOf = (id: string): Deck => ({
    id,
    url: `${INSTANCE.url}catalog.ttl#${id}`,
    title: { en: id },
    cardsDocumentUrl: `${INSTANCE.url}decks/${id}.ttl`,
    reviewsDocumentUrl: `${INSTANCE.url}reviews/${id}.ttl`,
    createdAt: "",
    formatVersion: 4,
    direction: "front-to-back",
    authors: [],
  });
  const answer = (studyDay: string): Answer => ({
    id: `answer-${studyDay}`,
    deckUrl: `${INSTANCE.url}catalog.ttl#deck-1`,
    cardUrl: `${INSTANCE.url}decks/deck-1.ttl#se`,
    direction: "front-to-back",
    grade: 4,
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    nextIntervalDays: 1,
  });

  it("shows today's study, linking to the statistics", async () => {
    const getTodayFigures = vi.fn(async () =>
      todayFiguresFrom([answer("2026-10-03")], "2026-10-03"),
    );
    renderContainer(getTodayFigures);
    expect(await screen.findByRole("link", { name: "All statistics" })).toHaveAttribute(
      "href",
      statisticsHref(INSTANCE.url),
    );
    expect(getTodayFigures).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date));
  });

  it("adds up the cards left today in every deck from their rows' counts, once all are known", async () => {
    const getTodayFigures = vi.fn(async () =>
      todayFiguresFrom([answer("2026-10-03")], "2026-10-03"),
    );
    let finish: (counts: { dueCount: number; newCount: number }) => void = () => undefined;
    const getStudyCounts = vi.fn(async (_instanceUrl: string, deck: Deck) =>
      deck.id === "deck-1"
        ? { dueCount: 3, newCount: 2 }
        : new Promise<{ dueCount: number; newCount: number }>((resolve) => {
            finish = resolve;
          }),
    );
    renderContainer(getTodayFigures, {
      decks: [deckOf("deck-1"), deckOf("deck-2")],
      getStudyCounts,
    });
    await screen.findByRole("link", { name: "All statistics" });
    expect(screen.queryByText(/left to study today/)).toBeNull();
    finish({ dueCount: 1, newCount: 0 });
    expect(await screen.findByText(/· 6 left to study today ·/)).toBeInTheDocument();
    expect(getStudyCounts).toHaveBeenCalledTimes(2);
  });

  it("says about how long the cards left will take, from how long an answer has taken", async () => {
    // Twenty seconds apart: an answer takes about 20 s.
    const getTodayFigures = vi.fn(async () =>
      todayFiguresFrom(
        [
          answer("2026-10-03"),
          { ...answer("2026-10-03"), id: "answer-2", answeredAt: "2026-10-03T10:00:20.000Z" },
        ],
        "2026-10-03",
      ),
    );
    const getStudyCounts = vi.fn(async () => ({ dueCount: 4, newCount: 2 }));
    renderContainer(getTodayFigures, { decks: [deckOf("deck-1")], getStudyCounts });
    // Six cards at 20 s, and no young review yet to expect any back: 2 minutes.
    expect(
      await screen.findByText(/· 6 left to study today · about 2 minutes to go ·/),
    ).toBeInTheDocument();
  });

  it("says no time while how long an answer takes is unknown", async () => {
    const getTodayFigures = vi.fn(async () =>
      todayFiguresFrom([answer("2026-10-03")], "2026-10-03"),
    );
    const getStudyCounts = vi.fn(async () => ({ dueCount: 1, newCount: 0 }));
    renderContainer(getTodayFigures, { decks: [deckOf("deck-1")], getStudyCounts });
    expect(await screen.findByText(/· 1 left to study today ·/)).toBeInTheDocument();
    expect(screen.queryByText(/to go/)).toBeNull();
  });

  it("welcomes back before the day's first answer, with the streak to keep and the cards left", async () => {
    // A two-day streak through yesterday, with an answer that took about 20 s.
    const getTodayFigures = vi.fn(async () =>
      todayFiguresFrom(
        [
          answer("2026-10-01"),
          answer("2026-10-02"),
          { ...answer("2026-10-02"), id: "answer-2", answeredAt: "2026-10-02T10:00:20.000Z" },
        ],
        "2026-10-03",
      ),
    );
    const getStudyCounts = vi.fn(async () => ({ dueCount: 4, newCount: 2 }));
    renderContainer(getTodayFigures, { decks: [deckOf("deck-1")], getStudyCounts });
    const note = await screen.findByRole("complementary", { name: "Your streak" });
    expect(note).toHaveTextContent(
      /^2-day streak .+6 left to study today · about 2 minutes to go$/,
    );
    expect(screen.queryByRole("complementary", { name: "Today" })).toBeNull();
  });

  it("shows nothing before the day's first answer without a study day to come back to", async () => {
    const getTodayFigures = vi.fn(async () => todayFiguresFrom([], "2026-10-03"));
    const { container } = renderContainer(getTodayFigures);
    await vi.waitFor(() => expect(getTodayFigures).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
