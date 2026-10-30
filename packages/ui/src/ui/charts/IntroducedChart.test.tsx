// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { CHART_YEARS } from "@solid-memo/domain/answer";
import { day, days } from "../../test/dayActivity";
import { IntroducedChart } from "./IntroducedChart";

describe("IntroducedChart", () => {
  it("draws the running total a day up to today, carried over days of nothing new", () => {
    const { container } = render(<IntroducedChart days={days} today="2026-09-22" />);
    expect(screen.getByText("Cards introduced over time")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /A line rising/ })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-point]")).toHaveLength(9);
    expect(container.querySelectorAll("path.line")).toHaveLength(1);
    expect(container.querySelector(".line-legend")).toBeNull();
    expect(container.querySelector(".line-axis")).toHaveTextContent("110");
    expect(container.querySelector(".line-keys")).toHaveTextContent(
      "September 14, 2026September 22, 2026",
    );
    fireEvent.pointerEnter(container.querySelector('[data-point="2026-09-17"]')!);
    expect(screen.getByText("September 17, 2026: 10 introduced in all.")).toBeInTheDocument();
    expect(container.querySelector(".crosshair")).not.toBeNull();
    expect(container.querySelectorAll("path.line-point")).toHaveLength(1);
    fireEvent.click(container.querySelector('[data-point="2026-09-22"]')!);
    expect(screen.getByText("September 22, 2026: 11 introduced in all.")).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "DayNewIntroduced in all",
      "September 21, 2026111",
      "September 20, 2026010",
      "September 14, 20261010",
    ]);
  });

  it("runs on past today to answers a later day boundary left after it", () => {
    const { container } = render(<IntroducedChart days={days} today="2026-09-20" />);
    expect(container.querySelectorAll("[data-point]")).toHaveLength(8);
    expect(container.querySelector(".line-keys")).toHaveTextContent(
      "September 14, 2026September 21, 2026",
    );
    fireEvent.click(container.querySelector('[data-point="2026-09-21"]')!);
    expect(screen.getByText("September 21, 2026: 11 introduced in all.")).toBeInTheDocument();
  });

  it.each(["9999-12-31", "9000-01-01"])(
    "spans at most CHART_YEARS of days, the last, up to a day as far ahead as %s",
    (far) => {
      const { container } = render(
        <IntroducedChart days={[...days, day(far, 1, 1, 0)]} today="2026-09-22" />,
      );
      const points = container.querySelectorAll("[data-point]");
      expect(points).toHaveLength(CHART_YEARS * 366);
      expect(points[points.length - 1]).toHaveAttribute("data-point", far);
      fireEvent.click(points[points.length - 1]!);
      expect(screen.getByText(/: 12 introduced in all\.$/)).toBeInTheDocument();
    },
  );

  it("carries in the total of the days before the ones it spans", () => {
    const { container } = render(
      <IntroducedChart days={[day("1000-01-01", 5, 5, 0), ...days]} today="2026-09-22" />,
    );
    const points = container.querySelectorAll("[data-point]");
    expect(points).toHaveLength(CHART_YEARS * 366);
    fireEvent.click(points[0]!);
    expect(screen.getByText(/: 5 introduced in all\.$/)).toBeInTheDocument();
  });
});
