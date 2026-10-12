// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { MemoryWeek } from "@solid-memo/domain/memoryCurve";
import { MaturityOverTimeChart } from "./MaturityOverTimeChart";

describe("MaturityOverTimeChart", () => {
  const weeks: MemoryWeek[] = [
    { week: "2026-09-07", relearning: 0, young: 0, mature: 0, medianInterval: null },
    { week: "2026-09-14", relearning: 1, young: 3, mature: 1, medianInterval: 6 },
    { week: "2026-09-21", relearning: 0, young: 2, mature: 4, medianInterval: 25 },
  ];

  it("draws the young and the mature cards week by week, the relearning in the table", () => {
    const { container } = render(<MaturityOverTimeChart weeks={weeks} />);
    expect(screen.getByText("Young and mature cards over time")).toBeInTheDocument();
    expect(container.querySelector(".line-legend")).toHaveTextContent("YoungMature");
    expect(container.querySelector(".line-axis")).toHaveTextContent("40");
    fireEvent.pointerEnter(container.querySelector('[data-point="2026-09-14"]')!);
    expect(
      screen.getByText("Week of September 14, 2026: 3 young, 1 mature, 1 relearning."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "Week ofYoungMatureRelearning",
      "September 21, 2026240",
      "September 14, 2026311",
      "September 7, 2026000",
    ]);
  });
});
