// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { IntervalRecall } from "@solid-memo/domain/memoryCurve";
import { IntervalRecallChart } from "./IntervalRecallChart";

describe("IntervalRecallChart", () => {
  const bins: IntervalRecall[] = [
    { from: 1, to: 2, recall: { reviews: 4, recalled: 3 } },
    { from: 2, to: 4, recall: { reviews: 0, recalled: 0 } },
    { from: 366, recall: { reviews: 1, recalled: 1 } },
  ];

  it("draws each span's share of reviews remembered on a scale to 100%, with its count", () => {
    const { container } = render(<IntervalRecallChart bins={bins} />);
    expect(screen.getByText("Recall by interval")).toBeInTheDocument();
    const heights = [...container.querySelectorAll("g[data-bar]")].map(
      (bar) => bar.querySelector("rect.bar")?.getAttribute("height") ?? null,
    );
    expect(heights).toEqual(["45", null, "60"]);
    fireEvent.pointerEnter(container.querySelector('g[data-bar="1"]')!);
    expect(screen.getByText("1 day: 75% of 4 reviews.")).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "IntervalRecall",
      "1 day75% of 4 reviews",
      "2–3 daysno reviews",
      "366 days or more100% of 1 review",
    ]);
  });
});
