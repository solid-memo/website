// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import type { Answer } from "@solid-memo/domain/answer";
import type { Deck } from "@solid-memo/domain/deck";
import { statisticsReportOf } from "../test/useCasesFake";
import { ActivitySection, MemorySection, OverviewSection } from "./StatisticsSections";

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
    answer("2026-09-21", deck.url, 1, { nextIntervalDays: 21 }),
    answer("2026-09-21", `${INSTANCE.url}catalog.ttl#gone`),
  ],
  "2026-09-21",
);
const headings = () => screen.queryAllByRole("heading").map((heading) => heading.textContent);

describe("OverviewSection", () => {
  it("shows the totals, streaks, the calendar and each deck's share, a removed deck named as such", () => {
    render(
      <OverviewSection statistics={statistics} decks={[deck]} allTime={false} cardsYouKnow={3} />,
    );
    expect(headings()).toEqual(["By deck"]);
    expect(screen.getAllByText("2 days")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "Last 30 days" })).toHaveTextContent("2 of 30 days7%");
    expect(screen.getByRole("group", { name: "Cards you know" })).toHaveTextContent(
      "3Mature now: reviewed at 21 days or more",
    );
    expect(screen.getByText("Activity, the last 52 weeks")).toBeInTheDocument();
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
        "By direction",
        "First try",
        "Lapses",
        "Graded course answers",
        "Last studied",
      ],
      [
        "Capitals",
        "2",
        "1",
        "100% of 1 review",
        "–",
        "–",
        "100% of 1 new card",
        "0",
        "–",
        "September 21, 2026",
      ],
      [
        "A removed deck",
        "1",
        "1",
        "–",
        "–",
        "–",
        "100% of 1 new card",
        "0",
        "–",
        "September 21, 2026",
      ],
    ]);
  });

  it("gives the whole log's cards introduced and grown mature when the range is all of it, and no cards known before they are read", () => {
    render(<OverviewSection statistics={statistics} decks={[deck]} allTime={true} />);
    expect(headings()).toEqual(["All time", "By deck"]);
    expect(screen.getByRole("group", { name: "Cards introduced" })).toHaveTextContent(
      /^Cards introduced2Each/,
    );
    expect(screen.getByRole("group", { name: "Cards grown mature" })).toHaveTextContent(
      /^Cards grown mature1Each/,
    );
    expect(screen.queryByRole("group", { name: "Cards you know" })).toBeNull();
  });

  it("has no table by deck for one deck's statistics", () => {
    render(<OverviewSection statistics={statistics} allTime={false} />);
    expect(headings()).toEqual([]);
    expect(screen.queryByRole("region", { name: "By deck" })).toBeNull();
  });

  it("gives a deck's recall each way only when it has reviews both ways", () => {
    const both = statisticsReportOf(
      [
        answer("2026-09-21", deck.url, 1),
        answer("2026-09-21", deck.url, 1, {
          id: "answer-back",
          direction: "back-to-front",
          grade: 1,
        }),
      ],
      "2026-09-21",
    );
    render(<OverviewSection statistics={both} decks={[deck]} allTime={false} />);
    const row = within(screen.getByRole("region", { name: "By deck" })).getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("cell")[4]).toHaveTextContent(
      "Front → back: 100% of 1 review · Back → front: 0% of 1 review",
    );
  });

  it("gives a course's graded answers in its deck's row", () => {
    render(<OverviewSection statistics={courseOnly} decks={[deck]} allTime={false} />);
    const row = within(screen.getByRole("region", { name: "By deck" })).getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("cell")[7]).toHaveTextContent("50% of 2 answers");
  });

  it("says since when, when the log begins after the range read, and nothing of it otherwise", () => {
    const { rerender } = render(
      <OverviewSection
        statistics={statisticsReportOf([answer("2026-09-21", deck.url)], "2026-09-21", "2026-03")}
        allTime={false}
      />,
    );
    expect(screen.getByText("Since March 2026, your first month of study.")).toBeInTheDocument();
    rerender(<OverviewSection statistics={statistics} allTime={false} />);
    expect(screen.queryByText(/your first month of study/)).toBeNull();
  });
});

describe("ActivitySection", () => {
  it("shows what each day held, the weekdays, this week and month, and the cards introduced", () => {
    render(<ActivitySection statistics={statistics} />);
    expect(headings()).toEqual(["This week so far", "This month so far", "Progress"]);
    expect(screen.getByText("What each day held, the last 30 days")).toBeInTheDocument();
    expect(screen.getByText("Answers by weekday")).toBeInTheDocument();
    // September 21 was a Monday: this week holds that day alone.
    expect(screen.getAllByRole("group", { name: "Answers" })[0]).toHaveTextContent(
      "2Same days last week: 0",
    );
    expect(screen.getByText("Cards introduced over time")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "First try" })).toHaveTextContent(
      "100%remembered, of 2 new cards",
    );
    expect(screen.getByText("New cards and reviews, by week")).toBeInTheDocument();
    expect(screen.getByText("Young and mature cards over time")).toBeInTheDocument();
    expect(screen.getByText("Memory span")).toBeInTheDocument();
    // The card reviewed reached 21 days a day after its first answer.
    expect(screen.getByRole("group", { name: "Time to mature (median)" })).toHaveTextContent(
      "1 dayand 1 review, of 1 card",
    );
  });

  it("gives no first try for course answers alone, and how long cards took to grow mature all the same", () => {
    render(<ActivitySection statistics={courseOnly} />);
    expect(screen.queryByRole("group", { name: "First try" })).toBeNull();
    expect(screen.getByRole("group", { name: "Time to mature (median)" })).toHaveTextContent(
      "–No card grew mature in this range",
    );
  });

  it("says since when, when the log begins after the range read", () => {
    render(
      <ActivitySection
        statistics={statisticsReportOf([answer("2026-09-21", deck.url)], "2026-09-21", "2026-03")}
      />,
    );
    expect(screen.getByText("Since March 2026, your first month of study.")).toBeInTheDocument();
  });
});

describe("MemorySection", () => {
  it("shows recall, the answer buttons, recall by week, by interval and by lateness, and nothing of courses without course answers", () => {
    render(<MemorySection statistics={statistics} byDirection={false} />);
    expect(headings()).toEqual(["Remembered in reviews"]);
    expect(screen.getAllByText("100%")).not.toHaveLength(0);
    expect(screen.getByText("Answer buttons")).toBeInTheDocument();
    expect(screen.getByText("Recall by week")).toBeInTheDocument();
    expect(screen.queryByText("Recall by month")).toBeNull();
    expect(screen.getByText("Recall by interval")).toBeInTheDocument();
    expect(screen.getByText("What a late review costs")).toBeInTheDocument();
  });

  it("shows recall by week over a range of 90 days that starts on a Wednesday", () => {
    render(
      <MemorySection
        statistics={statisticsReportOf(
          [
            answer("2026-06-24", deck.url, undefined, { nextIntervalDays: 1 }),
            answer("2026-06-25", deck.url, 1),
          ],
          "2026-09-21",
        )}
        byDirection={false}
      />,
    );
    expect(screen.getByText("Recall by week")).toBeInTheDocument();
    expect(screen.queryByText("Recall by month")).toBeNull();
  });

  it("shows recall by month once the reviews span more than 14 weeks, and since when the log begins", () => {
    render(
      <MemorySection
        statistics={statisticsReportOf(
          [
            answer("2026-05-01", deck.url, undefined, { nextIntervalDays: 1 }),
            answer("2026-06-01", deck.url, 1),
          ],
          "2026-09-21",
          "2026-05",
        )}
        byDirection={false}
      />,
    );
    expect(screen.getByText("Recall by month")).toBeInTheDocument();
    expect(screen.queryByText("Recall by week")).toBeNull();
    expect(screen.getByText("Since May 2026, your first month of study.")).toBeInTheDocument();
  });

  it("shows graded course answers apart, in place of recall when there is no review", () => {
    render(<MemorySection statistics={courseOnly} byDirection={false} />);
    expect(headings()).toEqual(["In courses"]);
    expect(screen.queryByText("Answer buttons")).toBeNull();
    expect(screen.getByRole("group", { name: "Graded course answers" })).toHaveTextContent(
      "50%right, of 2 answers",
    );
    expect(screen.queryByRole("group", { name: /Young cards/ })).toBeNull();
  });

  it("leaves out recall over time while there are no reviews, only first answers, and gives no reviews by interval and lateness", () => {
    render(
      <MemorySection
        statistics={statisticsReportOf([answer("2026-09-21", deck.url)], "2026-09-21")}
        byDirection={false}
      />,
    );
    expect(screen.queryByText("Recall by week")).toBeNull();
    expect(screen.getByText("Recall by interval")).toBeInTheDocument();
    expect(screen.getAllByText("no reviews")).toHaveLength(9 + 7);
    expect(screen.getAllByText("No reviews yet")).toHaveLength(2);
  });

  it("gives recall each way, when asked and there are reviews both ways", () => {
    const both = statisticsReportOf(
      [
        answer("2026-09-21", deck.url, 1),
        answer("2026-09-21", deck.url, 1, { id: "answer-back", direction: "back-to-front" }),
      ],
      "2026-09-21",
    );
    const { rerender } = render(<MemorySection statistics={both} byDirection={true} />);
    expect(screen.getByRole("group", { name: "Front → back" })).toHaveTextContent(
      "100%of 1 review",
    );
    expect(screen.getByRole("group", { name: "Back → front" })).toHaveTextContent(
      "100%of 1 review",
    );
    rerender(<MemorySection statistics={both} byDirection={false} />);
    expect(screen.queryByRole("group", { name: "Front → back" })).toBeNull();
    rerender(<MemorySection statistics={statistics} byDirection={true} />);
    expect(screen.queryByRole("group", { name: "Front → back" })).toBeNull();
  });
});
