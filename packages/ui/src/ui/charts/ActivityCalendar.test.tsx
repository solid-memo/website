// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { day, days } from "../../test/dayActivity";
import { ActivityCalendar, levelOf } from "./ActivityCalendar";

describe("levelOf", () => {
  it("gives no answers the lightest step and the busiest day the strongest", () => {
    expect(levelOf(0, 40)).toBe(0);
    expect(levelOf(1, 40)).toBe(1);
    expect(levelOf(10, 40)).toBe(1);
    expect(levelOf(11, 40)).toBe(2);
    expect(levelOf(40, 40)).toBe(4);
  });
});

describe("ActivityCalendar", () => {
  it("draws a cell a day up to today, in steps of green, and says what a pointed day held", () => {
    const { container } = render(<ActivityCalendar days={days} today="2026-09-21" weeks={2} />);
    const cells = container.querySelectorAll(".calendar-grid .calendar-day");
    expect(cells).toHaveLength(7 + 1);
    expect(container.querySelector('[data-day="2026-09-14"]')).toHaveClass("level-4");
    expect(container.querySelector('[data-day="2026-09-20"]')).toHaveClass("level-1");
    expect(container.querySelector('[data-day="2026-09-15"]')).toHaveClass("level-0");
    const inspector = screen.getByText(
      "Point at a day to see what it held, or open the table below.",
    );
    expect(inspector).not.toHaveAttribute("aria-live");
    fireEvent.pointerEnter(container.querySelector('[data-day="2026-09-14"]')!);
    expect(
      screen.getByText(
        "September 14, 2026: 40 answers (10 new, 26 remembered, 4 lapses, 0 repeats).",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-day="2026-09-14"]')).toHaveClass("pointed");
    fireEvent.click(container.querySelector('[data-day="2026-09-15"]')!);
    expect(screen.getByText("September 15, 2026: nothing studied.")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1 + days.length);
  });

  it("leaves a day before its weeks out of its table", () => {
    render(
      <ActivityCalendar
        days={[day("2026-09-13", 5, 5, 0), ...days]}
        today="2026-09-21"
        weeks={2}
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(1 + days.length);
  });

  it("shows a year of weeks by default, each week its own column across the full width", () => {
    const { container } = render(<ActivityCalendar days={days} today="2026-09-21" />);
    expect(screen.getByText("Activity, the last 52 weeks")).toBeInTheDocument();
    const grid = container.querySelector<HTMLElement>(".calendar-grid")!;
    expect(grid.style.getPropertyValue("--weeks")).toBe("52");
    expect(container.querySelectorAll(".calendar-grid .calendar-day")).toHaveLength(51 * 7 + 1);
    expect(
      container.querySelector<HTMLElement>('[data-day="2026-09-21"]')!.style.gridColumn,
    ).toMatch(/^52/);
    expect(
      container.querySelector<HTMLElement>('[data-day="2026-09-14"]')!.style.gridColumn,
    ).toMatch(/^51/);
  });
});
