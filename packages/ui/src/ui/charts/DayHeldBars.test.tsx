// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { day, days } from "../../test/dayActivity";
import { DayHeldBars } from "./DayHeldBars";

describe("DayHeldBars", () => {
  it("stacks what each day held on one baseline, says what a pointed day held, and lists the days", () => {
    const { container } = render(
      <DayHeldBars
        days={[...days.slice(0, 2), day("2026-09-21", 3, 1, 1, 1)]}
        today="2026-09-21"
        count={7}
      />,
    );
    expect(screen.getByText("What each day held, the last 7 days")).toBeInTheDocument();
    expect(container.querySelector(".bar-legend")).toHaveTextContent("RememberedNewLapsesRepeats");
    expect(container.querySelectorAll("g[data-bar]")).toHaveLength(7);
    // The 21st: one new, one lapse and one repeat; the 20th: nine remembered and a lapse.
    expect(container.querySelectorAll('g[data-bar="2026-09-21"] rect.bar')).toHaveLength(3);
    expect(container.querySelectorAll('g[data-bar="2026-09-20"] rect.bar')).toHaveLength(2);
    expect(container.querySelectorAll('g[data-bar="2026-09-20"] rect.bar-step-4')).toHaveLength(1);
    fireEvent.pointerEnter(container.querySelector('g[data-bar="2026-09-21"]')!);
    expect(
      screen.getByText("September 21, 2026: 3 answers (1 new, 0 remembered, 1 lapse, 1 repeat)."),
    ).toBeInTheDocument();
    expect(container.querySelector('g[data-bar="2026-09-21"] rect.bar')).toHaveClass("pointed");
    fireEvent.click(container.querySelector('g[data-bar="2026-09-19"]')!);
    expect(screen.getByText("September 19, 2026: nothing studied.")).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "DayAnswersNewRememberedLapsesRepeats",
      "September 21, 2026" + "3" + "1" + "0" + "1" + "1",
      "September 20, 2026" + "10" + "0" + "9" + "1" + "0",
    ]);
  });
});
