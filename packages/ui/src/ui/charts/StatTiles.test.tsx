// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { I18nProvider } from "../i18n";
import {
  FirstTryTile,
  PeriodTiles,
  QuizTile,
  RecallTile,
  StatTile,
  TimeToMatureTile,
} from "./StatTiles";

describe("tiles", () => {
  it("show a number with what it counts, and a share of reviews in the spoken language", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <StatTile label="Svar" value="51" />
        <RecallTile label="Unga kort" recall={{ reviews: 8, recalled: 6 }} />
        <RecallTile label="Mogna kort" recall={{ reviews: 0, recalled: 0 }} />
      </I18nProvider>,
    );
    expect(screen.getByRole("group", { name: "Svar" })).toHaveTextContent("51");
    expect(screen.getByRole("group", { name: "Unga kort" })).toHaveTextContent("75 %");
    expect(screen.getByText("75 %")).toBeInTheDocument();
    expect(screen.getByText("av 8 repetitioner")).toBeInTheDocument();
    expect(screen.getByText("Inga repetitioner än")).toBeInTheDocument();
  });

  it("give a share of a single review, with its count beside it", () => {
    render(<RecallTile label="Young cards" recall={{ reviews: 1, recalled: 0 }} />);
    expect(screen.getByRole("group", { name: "Young cards" })).toHaveTextContent("0%of 1 review");
  });

  it("give the share of new cards remembered the first time, with their count, and a dash before any", () => {
    const { rerender } = render(<FirstTryTile firstTry={{ introduced: 4, recalled: 3 }} />);
    expect(screen.getByRole("group", { name: "First try" })).toHaveTextContent(
      "75%remembered, of 4 new cards",
    );
    rerender(<FirstTryTile firstTry={{ introduced: 0, recalled: 0 }} />);
    expect(screen.getByRole("group", { name: "First try" })).toHaveTextContent("–No new cards yet");
  });

  it("give this week so far beside the same days of last week, and this month beside last month's", () => {
    const figures = {
      current: { answers: 12, studyDays: 2, introduced: 3, recall: { reviews: 4, recalled: 3 } },
      previous: { answers: 8, studyDays: 1, introduced: 5, recall: { reviews: 0, recalled: 0 } },
    };
    const { rerender } = render(<PeriodTiles period="week" figures={figures} />);
    expect(screen.getByRole("group", { name: "Answers" })).toHaveTextContent(
      "12Same days last week: 8",
    );
    expect(screen.getByRole("group", { name: "Study days" })).toHaveTextContent(
      "2Same days last week: 1",
    );
    expect(screen.getByRole("group", { name: "Introduced" })).toHaveTextContent(
      "3Same days last week: 5",
    );
    expect(screen.getByRole("group", { name: "Recall" })).toHaveTextContent(
      "75%of 4 reviews · Same days last week: no reviews",
    );
    rerender(
      <PeriodTiles
        period="month"
        figures={{ current: figures.previous, previous: figures.current }}
      />,
    );
    expect(screen.getByRole("group", { name: "Recall" })).toHaveTextContent(
      "–No reviews yet · Same days last month: 75% of 4 reviews",
    );
  });

  it("give the share of graded course answers right, with their count", () => {
    render(<QuizTile quiz={{ answers: 4, right: 3 }} />);
    expect(screen.getByRole("group", { name: "Graded course answers" })).toHaveTextContent(
      "75%right, of 4 answers",
    );
  });

  it("give the median time cards took to grow mature, with how many it is of, and a dash before any", () => {
    const { rerender } = render(<TimeToMatureTile time={{ prompts: 1, days: 22.5, reviews: 3 }} />);
    expect(screen.getByRole("group", { name: "Time to mature (median)" })).toHaveTextContent(
      "23 daysand 3 reviews, of 1 card",
    );
    rerender(<TimeToMatureTile time={{ prompts: 0, days: null, reviews: null }} />);
    expect(screen.getByRole("group", { name: "Time to mature (median)" })).toHaveTextContent(
      "–No card grew mature in this range",
    );
  });
});
