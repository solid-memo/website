// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { ForecastBars } from "./ForecastBars";

describe("ForecastBars", () => {
  it("draws the reviews due a day ahead, today's with the overdue, beside those the cap lets through, and lists the days with any", () => {
    const forecast = [
      { studyDay: "2026-09-21", due: 5, reviews: 3 },
      { studyDay: "2026-09-22", due: 0, reviews: 2 },
      { studyDay: "2026-09-23", due: 1, reviews: 1 },
      { studyDay: "2026-09-24", due: 0, reviews: 0 },
    ];
    const { container } = render(<ForecastBars forecast={forecast} />);
    expect(screen.getByText("Reviews due, the next 4 days")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Pairs of bars for each of the next 4 days/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/holds back waits for the next day/)).toBeInTheDocument();
    expect(container.querySelector(".bar-legend")).toHaveTextContent("DueWithin your limit");
    expect(container.querySelectorAll('g[data-bar="2026-09-21"] rect.bar')).toHaveLength(2);
    expect(container.querySelectorAll('g[data-bar="2026-09-22"] rect.bar')).toHaveLength(1);
    expect(container.querySelectorAll("rect.bar")).toHaveLength(5);
    expect(
      screen.getByText("Point at a day to see what falls due, or open the table below."),
    ).toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector('g[data-bar="2026-09-21"]')!);
    expect(
      screen.getByText(
        "September 21, 2026, today: 5 reviews due, overdue ones included, 3 within your limit.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(container.querySelector('g[data-bar="2026-09-23"]')!);
    expect(
      screen.getByText("September 23, 2026: 1 review due, 1 within your limit."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "DayDueWithin your limit",
      "September 21, 202653",
      "September 22, 202602",
      "September 23, 202611",
    ]);
  });

  it("says in the table that nothing is due when no day has a review", () => {
    render(
      <ForecastBars
        forecast={[
          { studyDay: "2026-09-21", due: 0, reviews: 0 },
          { studyDay: "2026-09-22", due: 0, reviews: 0 },
        ]}
      />,
    );
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "DayDueWithin your limit",
      "No reviews due in the next 2 days.",
    ]);
  });
});
