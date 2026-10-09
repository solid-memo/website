import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { DayActivity } from "@solid-memo/domain/statistics";
import { I18nProvider } from "./i18n";
import { ActivityCalendar, DayBars, levelOf, RecallTile, StatTile } from "./StatisticsCharts";

const days: DayActivity[] = [
  { studyDay: "2026-09-14", answers: 40, introduced: 10, forgotten: 4 },
  { studyDay: "2026-09-20", answers: 10, introduced: 0, forgotten: 1 },
  { studyDay: "2026-09-21", answers: 1, introduced: 1, forgotten: 0 },
];

describe("levelOf", () => {
  it("gives no answers the lightest step and the busiest day the strongest", () => {
    expect(levelOf(0, 40)).toBe(0);
    expect(levelOf(1, 40)).toBe(1);
    expect(levelOf(10, 40)).toBe(1);
    expect(levelOf(11, 40)).toBe(2);
    expect(levelOf(40, 40)).toBe(4);
  });
});

describe("tiles", () => {
  it("show a number with what it counts, and a share of reviews in the spoken language", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <StatTile label="Svar" value="51" />
        <RecallTile label="Unga kort" recall={{ reviews: 8, recalled: 6 }} />
        <RecallTile label="Mogna kort" recall={{ reviews: 0, recalled: 0 }} />
      </I18nProvider>,
    );
    expect(screen.getByRole("group", { name: "Svar" })).toHaveTextContent("51");
    expect(screen.getByRole("group", { name: "Unga kort" })).toHaveTextContent("75 %");
    expect(screen.getByText("75 %")).toBeInTheDocument();
    expect(screen.getByText("av 8 repetitioner")).toBeInTheDocument();
    expect(screen.getByText("Inga repetitioner än")).toBeInTheDocument();
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
    const inspector = screen.getByText("Point at a day to see what it held, or open the table below.");
    expect(inspector).not.toHaveAttribute("aria-live");
    fireEvent.pointerEnter(container.querySelector('[data-day="2026-09-14"]')!);
    expect(screen.getByText("September 14, 2026: 40 answers, 10 new, 4 forgotten.")).toBeInTheDocument();
    expect(container.querySelector('[data-day="2026-09-14"]')).toHaveClass("pointed");
    fireEvent.click(container.querySelector('[data-day="2026-09-15"]')!);
    expect(screen.getByText("September 15, 2026: nothing studied.")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1 + days.length);
  });

  it("shows a year of weeks by default, each week its own column across the full width", () => {
    const { container } = render(<ActivityCalendar days={days} today="2026-09-21" />);
    expect(screen.getByText("Activity, the last 52 weeks")).toBeInTheDocument();
    const grid = container.querySelector<HTMLElement>(".calendar-grid")!;
    expect(grid.style.getPropertyValue("--weeks")).toBe("52");
    expect(container.querySelectorAll(".calendar-grid .calendar-day")).toHaveLength(51 * 7 + 1);
    expect(container.querySelector<HTMLElement>('[data-day="2026-09-21"]')!.style.gridColumn).toMatch(/^52/);
    expect(container.querySelector<HTMLElement>('[data-day="2026-09-14"]')!.style.gridColumn).toMatch(/^51/);
  });
});

describe("DayBars", () => {
  it("draws a bar for each day with answers on one baseline, and says what a pointed day held", () => {
    const { container } = render(<DayBars days={days} today="2026-09-21" count={7} />);
    expect(container.querySelectorAll("g[data-bar]")).toHaveLength(7);
    expect(container.querySelectorAll("rect.bar")).toHaveLength(2);
    fireEvent.pointerEnter(container.querySelector('g[data-bar="2026-09-21"]')!);
    expect(screen.getByText("September 21, 2026: 1 answer, 1 new, 0 forgotten.")).toBeInTheDocument();
    expect(container.querySelector('g[data-bar="2026-09-21"] rect.bar')).toHaveClass("pointed");
    fireEvent.click(container.querySelector('g[data-bar="2026-09-19"]')!);
    expect(screen.getByText("September 19, 2026: nothing studied.")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1 + 2);
  });
});
