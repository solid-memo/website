// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { IntakeChart } from "./IntakeChart";

describe("IntakeChart", () => {
  it("draws the new cards beside the reviews of each week, and lists the weeks newest first", () => {
    const { container } = render(
      <IntakeChart
        weeks={[
          { week: "2026-09-07", introduced: 10, reviews: 0 },
          { week: "2026-09-14", introduced: 4, reviews: 12 },
        ]}
      />,
    );
    expect(screen.getByText("New cards and reviews, by week")).toBeInTheDocument();
    expect(container.querySelector(".bar-legend")).toHaveTextContent("NewReviews");
    expect(container.querySelectorAll('g[data-bar="2026-09-14"] rect.bar')).toHaveLength(2);
    fireEvent.click(container.querySelector('g[data-bar="2026-09-14"]')!);
    expect(screen.getByText("Week of September 14, 2026: 4 new, 12 reviews.")).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "Week ofNewReviews",
      "September 14, 2026412",
      "September 7, 2026100",
    ]);
  });
});
