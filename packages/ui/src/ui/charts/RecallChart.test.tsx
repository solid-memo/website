// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { MonthRetention } from "@solid-memo/domain/statistics";
import { statusTexts } from "../../test/liveRegions";
import { RecallChart } from "./RecallChart";

describe("RecallChart", () => {
  const recall = (reviews: number, recalled: number) => ({ reviews, recalled });
  const months: MonthRetention[] = [
    {
      month: "2026-06",
      retention: { young: recall(4, 3), mature: recall(0, 0) },
      firstTry: { introduced: 8, recalled: 6 },
    },
    {
      month: "2026-07",
      retention: { young: recall(10, 9), mature: recall(1, 1) },
      firstTry: { introduced: 1, recalled: 1 },
    },
    {
      month: "2026-09",
      retention: { young: recall(0, 0), mature: recall(2, 1) },
      firstTry: { introduced: 0, recalled: 0 },
    },
  ];

  it("draws young and mature recall a month on a scale to 100%, a month without reviews a gap", () => {
    const { container } = render(<RecallChart months={months} />);
    expect(screen.getByText("Recall by month")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-point]")).toHaveLength(4);
    expect(container.querySelector(".line-legend")).toHaveTextContent("YoungMature");
    expect(container.querySelector(".line-axis")).toHaveTextContent("100%0%");
    expect(container.querySelector(".line-keys")).toHaveTextContent("June 2026September 2026");
    // Young: June and July joined; mature: July alone, September alone.
    expect(container.querySelectorAll("path.line-young")).toHaveLength(1);
    expect(container.querySelectorAll("path.line-mature.lone")).toHaveLength(2);
    expect(
      screen.getByText(
        "Point at a month (or use the arrow keys) to see how well it was remembered, or open the table below.",
      ),
    ).toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector('[data-point="2026-07"]')!);
    expect(
      screen.getByText("July 2026: young cards 90% of 10 reviews, mature cards 100% of 1 review."),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("path.line-point")).toHaveLength(2);
    fireEvent.click(container.querySelector('[data-point="2026-08"]')!);
    expect(
      screen.getByText("August 2026: young cards no reviews, mature cards no reviews."),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("path.line-point")).toHaveLength(0);
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "MonthYoungMatureFirst try",
      "September 2026no reviews50% of 2 reviews–",
      "July 202690% of 10 reviews100% of 1 review100% of 1 new card",
      "June 202675% of 4 reviewsno reviews75% of 8 new cards",
    ]);
  });

  it("steps along the months with the arrow keys, guide and dots following, each read out", () => {
    const { container } = render(<RecallChart months={months} />);
    const plot = screen.getByRole("img", { name: /^The share of reviews remembered/ });
    expect(plot).toHaveAttribute("tabindex", "0");
    expect(plot).toHaveAccessibleDescription(/^Point at a month \(or use the arrow keys\)/);
    fireEvent.keyDown(plot, { key: "Home" });
    fireEvent.keyDown(plot, { key: "ArrowRight" });
    expect(container.querySelector(".crosshair")).toBeInTheDocument();
    expect(container.querySelectorAll("path.line-point")).toHaveLength(2);
    expect(statusTexts()).toEqual([
      "July 2026: young cards 90% of 10 reviews, mature cards 100% of 1 review.",
    ]);
  });

  it("says nothing of a month pointed at that a shorter range no longer holds", () => {
    const { container, rerender } = render(<RecallChart months={months} />);
    const plot = screen.getByRole("img", { name: /^The share of reviews remembered/ });
    fireEvent.keyDown(plot, { key: "End" });
    expect(statusTexts()).toHaveLength(1);
    rerender(<RecallChart months={months.slice(0, 2)} />);
    expect(container.querySelector(".crosshair")).not.toBeInTheDocument();
    expect(container.querySelector("path.line-point")).not.toBeInTheDocument();
    expect(container.querySelector(".chart-inspector")).toHaveTextContent(/^Point at a month/);
    expect(statusTexts()).toEqual([]);
  });

  it("names a single month once under the plot", () => {
    const { container } = render(<RecallChart months={[months[0]!]} />);
    expect(container.querySelector(".line-keys")!.children).toHaveLength(1);
    fireEvent.pointerEnter(container.querySelector('[data-point="2026-06"]')!);
    expect(
      screen.getByText("June 2026: young cards 75% of 4 reviews, mature cards no reviews."),
    ).toBeInTheDocument();
  });
});
