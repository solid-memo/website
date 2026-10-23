// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DeckProgress } from "@solid-memo/application/statistics";
import type { Answer } from "@solid-memo/domain/answer";
import type { Deck } from "@solid-memo/domain/deck";
import { easeHistogram, intervalHistogram } from "@solid-memo/domain/scheduleInsight";
import { makeUseCasesFake } from "../test/useCasesFake";
import { statisticsReportOf } from "../test/fakes/statistics";
import { DeckStatisticsContainer } from "./DeckStatisticsContainer";
import type { StatisticsRange, StatisticsView } from "./router";
import { StatisticsContainer } from "./StatisticsContainer";
import { StatisticsScreen, type StatisticsChange } from "./StatisticsScreen";

const INSTANCE = { url: "https://pod.example/solid-memo/a/", name: "A" };
const deck: Deck = {
  id: "deck-1",
  url: `${INSTANCE.url}catalog.ttl#deck-1`,
  title: { en: "Capitals" },
  cardsDocumentUrl: `${INSTANCE.url}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${INSTANCE.url}reviews/deck-1.ttl`,
  createdAt: "",
  formatVersion: 4,
  direction: "front-to-back",
  authors: [],
};
const answer = (
  studyDay: string,
  deckUrl: string,
  prior?: number,
  extra: Partial<Answer> = {},
): Answer => ({
  id: `answer-${studyDay}-${deckUrl}`,
  deckUrl,
  cardUrl: `${INSTANCE.url}decks/deck-1.ttl#se`,
  direction: "front-to-back",
  grade: 4,
  answeredAt: `${studyDay}T10:00:00.000Z`,
  studyDay,
  ...(prior === undefined ? {} : { priorIntervalDays: prior }),
  nextIntervalDays: 6,
  ...extra,
});
/** A deck studied only in a course's chapters: one question right, one wrong. */
const courseOnly = statisticsReportOf(
  [
    answer("2026-09-21", deck.url, undefined, { mode: "multiple-choice", grade: 3 }),
    answer("2026-09-21", deck.url, undefined, {
      id: "answer-wrong",
      cardUrl: `${INSTANCE.url}decks/deck-1.ttl#no`,
      mode: "multiple-choice",
      grade: 1,
    }),
  ],
  "2026-09-21",
);
const statistics = statisticsReportOf(
  [
    answer("2026-09-20", deck.url),
    answer("2026-09-21", deck.url, 1),
    answer("2026-09-21", `${INSTANCE.url}catalog.ttl#gone`),
  ],
  "2026-09-21",
);
const progressOf = (extra: Partial<DeckProgress> = {}): DeckProgress => ({
  deck,
  progress: { new: 1, relearning: 0, young: 2, mature: 3 },
  forecast: [],
  intervals: intervalHistogram([]),
  eases: easeHistogram([]),
  overdue: 0,
  daysToClear: 0,
  newCardsPerDay: 5,
  introducedToday: 0,
  hardest: { reviews: 0, cards: [] },
  courseAnswers: 0,
  confusions: [],
  ...extra,
});

function withQueries(node: preact.ComponentChildren) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}

const hrefOf = ({ range, view }: StatisticsChange) => `#/s?range=${range}&view=${view}`;

describe("StatisticsScreen", () => {
  const shown = (view: StatisticsView, onChange = vi.fn()) => {
    render(
      <StatisticsScreen range="90d" view={view} hrefOf={hrefOf} onChange={onChange}>
        <p>The tab</p>
      </StatisticsScreen>,
    );
    return onChange;
  };

  it("names the tabs as links to their own address, the one shown selected over its panel", () => {
    shown("memory");
    const tabs = within(screen.getByRole("tablist", { name: "Statistics views" })).getAllByRole(
      "tab",
    );
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Overview", "Activity", "Memory", "Cards"]);
    expect(tabs[0]).toHaveAttribute("href", "#/s?range=undefined&view=overview");
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Memory");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, 0, -1]);
    expect(screen.getByRole("tabpanel", { name: "Memory" })).toHaveTextContent("The tab");
    expect(screen.getByRole("heading", { name: "Statistics", level: 2 })).toBeInTheDocument();
  });

  it("changes the range as it is picked", () => {
    const onChange = shown("overview");
    const picker = screen.getByRole("combobox", { name: "Range" });
    expect(picker).toHaveValue("90d");
    expect(
      within(picker)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Last 30 days", "Last 3 months", "Last 12 months", "All time"]);
    fireEvent.input(picker, { target: { value: "all" } });
    expect(onChange).toHaveBeenCalledWith({ range: "all" });
  });

  it("changes the tab in place on a plain click, and leaves a click to open it elsewhere to the browser", () => {
    const onChange = shown("overview");
    const cards = screen.getByRole("tab", { name: "Cards" });
    expect(fireEvent.click(cards)).toBe(false);
    expect(onChange).toHaveBeenCalledWith({ view: "cards" });
    onChange.mockClear();
    for (const modified of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { button: 1 },
    ]) {
      expect(fireEvent.click(cards, modified)).toBe(true);
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves along the tabs with the arrow keys, Home and End, round from end to end", () => {
    const keys: [StatisticsView, string, StatisticsView][] = [
      ["overview", "ArrowRight", "activity"],
      ["overview", "ArrowLeft", "cards"],
      ["cards", "ArrowRight", "overview"],
      ["memory", "Home", "overview"],
      ["activity", "End", "cards"],
    ];
    for (const [from, key, to] of keys) {
      const onChange = vi.fn();
      const { unmount } = render(
        <StatisticsScreen range="90d" view={from} hrefOf={hrefOf} onChange={onChange}>
          {null}
        </StatisticsScreen>,
      );
      fireEvent.keyDown(screen.getByRole("tab", { selected: true }), { key });
      expect(onChange, `${from} ${key}`).toHaveBeenCalledWith({ view: to });
      expect(document.activeElement).toHaveTextContent(
        { overview: "Overview", activity: "Activity", memory: "Memory", cards: "Cards" }[to],
      );
      unmount();
    }
    const onChange = shown("overview");
    expect(fireEvent.keyDown(screen.getByRole("tab", { name: "Overview" }), { key: "a" })).toBe(
      true,
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("StatisticsContainer", () => {
  const open = (
    useCases: ReturnType<typeof makeUseCasesFake>,
    {
      view = "overview",
      range = "90d",
      decks = [deck],
      one,
    }: {
      view?: StatisticsView;
      range?: StatisticsRange;
      decks?: Deck[];
      one?: Deck;
    } = {},
  ) =>
    withQueries(
      <StatisticsContainer
        useCases={useCases}
        instance={INSTANCE}
        decks={decks}
        deck={one}
        range={range}
        view={view}
        hrefOf={hrefOf}
        onChange={() => undefined}
      />,
    );

  it("reads the range's statistics, showing a loading state, then them with the cards known, or an error", async () => {
    const useCases = makeUseCasesFake({
      getStatistics: vi.fn(async () => statistics),
      getCardProgress: vi.fn(async () => ({ today: "2026-09-21", decks: [progressOf()] })),
    });
    open(useCases);
    expect(screen.getByText("Loading statistics…")).toBeInTheDocument();
    expect(await screen.findByText("Capitals")).toBeInTheDocument();
    expect(useCases.getStatistics).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {
      range: 90,
    });
    expect(await screen.findByRole("group", { name: "Cards you know" })).toHaveTextContent(
      /^Cards you know3/,
    );

    const failing = makeUseCasesFake({
      getStatistics: vi.fn(async () => Promise.reject(new Error("offline"))),
    });
    open(failing, { view: "activity" });
    expect(await screen.findByText("offline")).toBeInTheDocument();
  });

  it("reads the range picked: 30 days, the last 12 months as the today strip does, or the whole log", async () => {
    for (const [range, read] of [
      ["30d", { range: 30 }],
      ["12m", {}],
      ["all", { range: "all" }],
    ] as const) {
      const useCases = makeUseCasesFake({ getStatistics: vi.fn(async () => statistics) });
      const { unmount } = open(useCases, { range });
      await waitFor(() =>
        expect(useCases.getStatistics).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), read),
      );
      unmount();
    }
  });

  it("shows each tab: the activity, the memory with what is hard, and where the cards stand with the courses", async () => {
    const useCases = makeUseCasesFake({
      getStatistics: vi.fn(async () => statistics),
      getCardProgress: vi.fn(async () => ({
        today: "2026-09-21",
        decks: [progressOf({ hardest: { reviews: 1, cards: [] } })],
      })),
    });
    const activity = open(useCases, { view: "activity" });
    expect(await screen.findByText("What each day held, the last 30 days")).toBeInTheDocument();
    activity.unmount();
    const memory = open(useCases, { view: "memory" });
    expect(await screen.findByText("Answer buttons")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "What is hard" })).toBeInTheDocument();
    memory.unmount();
    open(useCases, { view: "cards" });
    expect(await screen.findByText("Card maturity")).toBeInTheDocument();
    expect(useCases.getCardProgress).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {});
  });

  it("says there is nothing yet on the tabs of answers, and shows where the cards stand before any answer", async () => {
    const useCases = makeUseCasesFake();
    const first = open(useCases, { decks: [] });
    expect(
      await screen.findByText("No answers yet: the statistics begin with your next study session."),
    ).toBeInTheDocument();
    first.unmount();
    open(useCases, { view: "cards", decks: [] });
    expect(await screen.findByText("Card maturity")).toBeInTheDocument();
  });

  it("says a range without answers has none, and that a longer one may, while the log has some", async () => {
    const useCases = makeUseCasesFake({
      getStatistics: vi.fn(async () => statisticsReportOf([], "2026-09-21", null, "2026-05")),
    });
    const short = open(useCases, { range: "30d" });
    expect(
      await screen.findByText("No answers in this range. A longer range may show earlier ones."),
    ).toBeInTheDocument();
    short.unmount();
    // The whole log has no longer range.
    open(useCases, { range: "all" });
    expect(
      await screen.findByText("No answers yet: the statistics begin with your next study session."),
    ).toBeInTheDocument();
  });

  it("says the statistics begin with the next session when the range takes in the whole log, its month's answers reset", async () => {
    const useCases = makeUseCasesFake({
      getStatistics: vi.fn(async () => statisticsReportOf([], "2026-09-21", "2026-09", "2026-09")),
    });
    open(useCases, { range: "30d" });
    expect(
      await screen.findByText("No answers yet: the statistics begin with your next study session."),
    ).toBeInTheDocument();
  });

  it("is of one deck's answers, with no figures by deck, recall each way and its own progress", async () => {
    const useCases = makeUseCasesFake({ getStatistics: vi.fn(async () => statistics) });
    const overview = open(useCases, { one: deck });
    expect(await screen.findByText("Activity, the last 52 weeks")).toBeInTheDocument();
    expect(useCases.getStatistics).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {
      range: 90,
      deckUrl: deck.url,
    });
    expect(screen.queryByRole("list", { name: "By deck" })).toBeNull();
    overview.unmount();
    open(useCases, { one: deck, view: "cards" });
    expect(await screen.findByText("Card maturity")).toBeInTheDocument();
    expect(useCases.getCardProgress).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), { deck });
  });

  it("saves the range's answers as a file, of every deck or of one, and says when it cannot", async () => {
    const useCases = makeUseCasesFake({ getStatistics: vi.fn(async () => statistics) });
    const all = open(useCases, { range: "all" });
    fireEvent.click(await screen.findByRole("button", { name: "Download my answers (CSV)" }));
    expect(useCases.saveAnswers).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {
      range: "all",
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Download my answers (CSV)" })).toBeEnabled(),
    );
    all.unmount();

    const failing = makeUseCasesFake({
      getStatistics: vi.fn(async () => statistics),
      saveAnswers: vi.fn(async () => Promise.reject(new Error("no room"))),
    });
    open(failing, { one: deck, range: "30d" });
    fireEvent.click(await screen.findByRole("button", { name: "Download my answers (CSV)" }));
    expect(await screen.findByText("no room")).toBeInTheDocument();
    expect(failing.saveAnswers).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {
      range: 30,
      deckUrl: deck.url,
    });
  });
});

describe("DeckStatisticsContainer", () => {
  it("sums up the deck's recall once it has answers, and only where its cards stand before, always with a link to the rest", async () => {
    const useCases = makeUseCasesFake({ getStatistics: vi.fn(async () => statistics) });
    withQueries(<DeckStatisticsContainer useCases={useCases} instance={INSTANCE} deck={deck} />);
    expect(await screen.findByRole("group", { name: "First try" })).toBeInTheDocument();
    expect(useCases.getStatistics).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {
      range: 90,
      deckUrl: deck.url,
    });
    expect(screen.getByRole("link", { name: "More statistics" })).toHaveAttribute(
      "href",
      `#/deck-statistics?instance=${encodeURIComponent(INSTANCE.url)}&deck=${encodeURIComponent(deck.url)}`,
    );
    expect(screen.queryByRole("group", { name: "Front → back" })).toBeNull();
    expect(useCases.getCardProgress).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), { deck });

    const empty = makeUseCasesFake();
    const quiet = within(
      withQueries(<DeckStatisticsContainer useCases={empty} instance={INSTANCE} deck={deck} />)
        .container as HTMLElement,
    );
    await vi.waitFor(() => expect(empty.getStatistics).toHaveBeenCalled());
    expect(await quiet.findByText("Card maturity")).toBeInTheDocument();
    expect(quiet.queryByRole("group", { name: "First try" })).toBeNull();
    // Its older answers are a longer range away.
    expect(quiet.getByRole("link", { name: "More statistics" })).toBeInTheDocument();
  });

  it("shows a deck's recall each way when it has reviews both ways", async () => {
    const both = statisticsReportOf(
      [
        answer("2026-09-21", deck.url, 1),
        answer("2026-09-21", deck.url, 1, { id: "answer-back", direction: "back-to-front" }),
      ],
      "2026-09-21",
    );
    const useCases = makeUseCasesFake({ getStatistics: vi.fn(async () => both) });
    withQueries(<DeckStatisticsContainer useCases={useCases} instance={INSTANCE} deck={deck} />);
    expect(await screen.findByRole("group", { name: "Front → back" })).toHaveTextContent(
      "100%of 1 review",
    );
    expect(screen.getByRole("group", { name: "Back → front" })).toHaveTextContent(
      "100%of 1 review",
    );
  });

  it("shows a deck studied only in a course's chapters by its graded course answers alone", async () => {
    const useCases = makeUseCasesFake({ getStatistics: vi.fn(async () => courseOnly) });
    withQueries(<DeckStatisticsContainer useCases={useCases} instance={INSTANCE} deck={deck} />);
    expect(await screen.findByRole("group", { name: "Graded course answers" })).toHaveTextContent(
      "50%",
    );
    expect(screen.queryByRole("group", { name: /Young cards/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "First try" })).toBeNull();
  });
});
