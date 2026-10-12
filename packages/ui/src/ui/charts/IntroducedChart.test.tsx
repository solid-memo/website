// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { days } from "../../test/dayActivity";
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
});
