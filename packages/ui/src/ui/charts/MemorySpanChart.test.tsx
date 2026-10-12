// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { MemoryWeek } from "@solid-memo/domain/memoryCurve";
import { MemorySpanChart } from "./MemorySpanChart";

describe("MemorySpanChart", () => {
  const weeks: MemoryWeek[] = [
    { week: "2026-09-07", relearning: 0, young: 0, mature: 0, medianInterval: null },
    { week: "2026-09-14", relearning: 0, young: 2, mature: 0, medianInterval: 3.5 },
    { week: "2026-09-21", relearning: 0, young: 1, mature: 1, medianInterval: 13 },
  ];

  it("draws the median interval week by week in whole days, a gap before any card", () => {
    const { container } = render(<MemorySpanChart weeks={weeks} />);
    expect(screen.getByText("Memory span")).toBeInTheDocument();
    expect(container.querySelector(".line-axis")).toHaveTextContent("13 days0 days");
    expect(container.querySelectorAll("path.line-span")).toHaveLength(1);
    fireEvent.pointerEnter(container.querySelector('[data-point="2026-09-14"]')!);
    expect(screen.getByText("Week of September 14, 2026: 4 days.")).toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector('[data-point="2026-09-07"]')!);
    expect(screen.getByText("Week of September 7, 2026: –.")).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "Week ofMedian interval",
      "September 21, 202613 days",
      "September 14, 20264 days",
      "September 7, 2026–",
    ]);
  });
});
