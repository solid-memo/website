// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Deck } from "@solid-memo/domain/deck";
import type { Answer } from "@solid-memo/domain/answer";
import { makeUseCasesFake, statisticsReportOf } from "../test/useCasesFake";
import { DeckStatisticsContainer } from "./DeckStatisticsContainer";
import { StatisticsContainer } from "./StatisticsContainer";
import { StatisticsScreen } from "./StatisticsScreen";

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

function withQueries(node: preact.ComponentChildren) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}

describe("StatisticsScreen", () => {
  it("shows the totals, streaks, activity, recall and each deck's share, a removed deck named as such", () => {
    render(<StatisticsScreen statistics={statistics} decks={[deck]} />);
    expect(screen.getByRole("heading", { name: "Statistics" })).toBeInTheDocument();
    expect(screen.getAllByText("2 days")).toHaveLength(2);
    expect(screen.getAllByText("100%")).not.toHaveLength(0);
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual(["Statistics", "Progress", "Remembered in reviews", "By deck"]);
    expect(screen.getByText("Cards introduced over time")).toBeInTheDocument();
    expect(screen.getByText("Recall by month")).toBeInTheDocument();
    expect(screen.queryByText("In courses")).toBeNull();
    const byDeck = screen.getByRole("region", { name: "By deck" });
    const cells = (row: HTMLElement) =>
      within(row)
        .queryAllByRole(/columnheader|rowheader|cell/)
        .map((cell) => cell.textContent);
    expect(within(byDeck).getAllByRole("row").map(cells)).toEqual([
      [
        "Deck",
        "Answers",
        "Introduced",
        "Young recall",
        "Mature recall",
        "Lapses",
        "Graded course answers",
        "Last studied",
      ],
      ["Capitals", "2", "1", "100% of 1 review", "–", "0", "–", "September 21, 2026"],
      ["A removed deck", "1", "1", "–", "–", "0", "–", "September 21, 2026"],
    ]);
  });

  it("shows graded course answers apart, in place of recall when there is no review", () => {
    render(<StatisticsScreen statistics={courseOnly} decks={[deck]} />);
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual(["Statistics", "Progress", "In courses", "By deck"]);
    expect(screen.getByRole("group", { name: "Graded course answers" })).toHaveTextContent(
      "50%right, of 2 answers",
    );
    expect(screen.queryByRole("group", { name: /Young cards/ })).toBeNull();
    const row = within(screen.getByRole("region", { name: "By deck" })).getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("cell")[5]).toHaveTextContent("50% of 2 answers");
  });

  it("leaves out recall by month while there are no reviews, only first answers", () => {
    render(
      <StatisticsScreen
        statistics={statisticsReportOf([answer("2026-09-21", deck.url)], "2026-09-21")}
        decks={[deck]}
      />,
    );
    expect(screen.getByText("Cards introduced over time")).toBeInTheDocument();
    expect(screen.queryByText("Recall by month")).toBeNull();
    expect(screen.getAllByText("No reviews yet")).toHaveLength(2);
  });

  it("says since when, when the log begins after the range read, and nothing of it otherwise", () => {
    const { rerender } = render(
      <StatisticsScreen
        statistics={statisticsReportOf([answer("2026-09-21", deck.url)], "2026-09-21", "2026-03")}
        decks={[deck]}
      />,
    );
    expect(screen.getByText("Since March 2026, your first month of study.")).toBeInTheDocument();
    rerender(<StatisticsScreen statistics={statistics} decks={[deck]} />);
    expect(screen.queryByText(/your first month of study/)).toBeNull();
  });

  it("says when there is nothing to show yet", () => {
    render(<StatisticsScreen statistics={statisticsReportOf([], "2026-09-21")} decks={[]} />);
    expect(
      screen.getByText("No answers yet: the statistics begin with your next study session."),
    ).toBeInTheDocument();
  });
});

describe("StatisticsContainer", () => {
  it("reads the statistics up to now, showing a loading state, then them, or an error", async () => {
    const useCases = makeUseCasesFake({ getStatistics: vi.fn(async () => statistics) });
    withQueries(<StatisticsContainer useCases={useCases} instance={INSTANCE} decks={[deck]} />);
    expect(screen.getByText("Loading statistics…")).toBeInTheDocument();
    expect(await screen.findByText("Capitals")).toBeInTheDocument();
    expect(useCases.getStatistics).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date));

    const failing = makeUseCasesFake({
      getStatistics: vi.fn(async () => Promise.reject(new Error("offline"))),
    });
    withQueries(<StatisticsContainer useCases={failing} instance={INSTANCE} decks={[]} />);
    expect(await screen.findByText("offline")).toBeInTheDocument();
  });

  it("shows where the cards stand after the statistics, even before any answer", async () => {
    const useCases = makeUseCasesFake();
    withQueries(<StatisticsContainer useCases={useCases} instance={INSTANCE} decks={[]} />);
    expect(
      await screen.findByText("No answers yet: the statistics begin with your next study session."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Card maturity")).toBeInTheDocument();
    expect(useCases.getCardProgress).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {});
  });
});

describe("DeckStatisticsContainer", () => {
  it("shows the deck's last days and recall once it has answers, and only where its cards stand before", async () => {
    const useCases = makeUseCasesFake({ getStatistics: vi.fn(async () => statistics) });
    const { container } = withQueries(
      <DeckStatisticsContainer useCases={useCases} instance={INSTANCE} deck={deck} />,
    );
    expect(await screen.findByText("Answers, the last 30 days")).toBeInTheDocument();
    expect(useCases.getStatistics).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {
      deckUrl: deck.url,
    });
    expect(container.querySelectorAll("rect.bar")).toHaveLength(2);

    expect(useCases.getCardProgress).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), { deck });

    const empty = makeUseCasesFake();
    const quiet = within(
      withQueries(<DeckStatisticsContainer useCases={empty} instance={INSTANCE} deck={deck} />)
        .container as HTMLElement,
    );
    await vi.waitFor(() => expect(empty.getStatistics).toHaveBeenCalled());
    expect(await quiet.findByText("Card maturity")).toBeInTheDocument();
    expect(quiet.queryByText("Answers, the last 30 days")).toBeNull();
  });

  it("shows a deck studied only in a course's chapters by its graded course answers alone", async () => {
    const useCases = makeUseCasesFake({ getStatistics: vi.fn(async () => courseOnly) });
    withQueries(<DeckStatisticsContainer useCases={useCases} instance={INSTANCE} deck={deck} />);
    expect(await screen.findByRole("group", { name: "Graded course answers" })).toHaveTextContent(
      "50%",
    );
    expect(screen.queryByRole("group", { name: /Young cards/ })).toBeNull();
  });
});
