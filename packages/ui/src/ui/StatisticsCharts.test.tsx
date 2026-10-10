import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { DayActivity, MonthRetention } from "@solid-memo/domain/statistics";
import { I18nProvider } from "./i18n";
import {
  ActivityCalendar,
  DayBars,
  ForecastBars,
  IntroducedChart,
  levelOf,
  MaturityBar,
  RecallChart,
  RecallTile,
  StatTile,
} from "./StatisticsCharts";

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

describe("ForecastBars", () => {
  it("draws the reviews due a day ahead, today's with the overdue, and lists the days with any", () => {
    const forecast = [
      { studyDay: "2026-09-21", due: 5, reviews: 3 },
      { studyDay: "2026-09-22", due: 0, reviews: 2 },
      { studyDay: "2026-09-23", due: 1, reviews: 1 },
    ];
    const { container } = render(<ForecastBars forecast={forecast} />);
    expect(screen.getByText("Reviews due, the next 3 days")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Reviews due on each of the next 3 days/ })).toBeInTheDocument();
    expect(screen.getByText(/without your daily review limit/)).toBeInTheDocument();
    expect(container.querySelectorAll("rect.bar")).toHaveLength(2);
    expect(screen.getByText("Point at a day to see what falls due, or open the table below.")).toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector('g[data-bar="2026-09-21"]')!);
    expect(screen.getByText("September 21, 2026, today: 5 reviews due, overdue ones included.")).toBeInTheDocument();
    fireEvent.click(container.querySelector('g[data-bar="2026-09-23"]')!);
    expect(screen.getByText("September 23, 2026: 1 review due.")).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "DayDue",
      "September 21, 20265",
      "September 23, 20261",
    ]);
  });

  it("says in the table that nothing is due when no day has a review", () => {
    render(
      <ForecastBars
        forecast={[
          { studyDay: "2026-09-21", due: 0, reviews: 0 },
          { studyDay: "2026-09-22", due: 0, reviews: 0 },
        ]}
      />,
    );
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "DayDue",
      "No reviews due in the next 2 days.",
    ]);
  });
});

describe("IntroducedChart", () => {
  it("draws the running total a day up to today, carried over days of nothing new", () => {
    const { container } = render(<IntroducedChart days={days} today="2026-09-22" />);
    expect(screen.getByText("Cards introduced over time")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /A line rising/ })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-point]")).toHaveLength(9);
    expect(container.querySelectorAll("path.line")).toHaveLength(1);
    expect(container.querySelector(".line-legend")).toBeNull();
    expect(container.querySelector(".line-axis")).toHaveTextContent("110");
    expect(container.querySelector(".line-keys")).toHaveTextContent("September 14, 2026September 22, 2026");
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
    expect(container.querySelector(".line-keys")).toHaveTextContent("September 14, 2026September 21, 2026");
    fireEvent.click(container.querySelector('[data-point="2026-09-21"]')!);
    expect(screen.getByText("September 21, 2026: 11 introduced in all.")).toBeInTheDocument();
  });
});

describe("RecallChart", () => {
  const recall = (reviews: number, recalled: number) => ({ reviews, recalled });
  const months: MonthRetention[] = [
    { month: "2026-06", retention: { young: recall(4, 3), mature: recall(0, 0) } },
    { month: "2026-07", retention: { young: recall(10, 9), mature: recall(1, 1) } },
    { month: "2026-09", retention: { young: recall(0, 0), mature: recall(2, 1) } },
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
    expect(screen.getByText("Point at a month to see how well it was remembered, or open the table below.")).toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector('[data-point="2026-07"]')!);
    expect(
      screen.getByText("July 2026: young cards 90% of 10 reviews, mature cards 100% of 1 review."),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("path.line-point")).toHaveLength(2);
    fireEvent.click(container.querySelector('[data-point="2026-08"]')!);
    expect(screen.getByText("August 2026: young cards no reviews, mature cards no reviews.")).toBeInTheDocument();
    expect(container.querySelectorAll("path.line-point")).toHaveLength(0);
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "MonthYoungMature",
      "September 2026no reviews50% of 2 reviews",
      "July 202690% of 10 reviews100% of 1 review",
      "June 202675% of 4 reviewsno reviews",
    ]);
  });

  it("names a single month once under the plot", () => {
    const { container } = render(<RecallChart months={[months[0]!]} />);
    expect(container.querySelector(".line-keys")!.children).toHaveLength(1);
    fireEvent.pointerEnter(container.querySelector('[data-point="2026-06"]')!);
    expect(screen.getByText("June 2026: young cards 75% of 4 reviews, mature cards no reviews.")).toBeInTheDocument();
  });
});

describe("MaturityBar", () => {
  it("gives each stage with prompts a share of one bar, and every count, zeros too, in words", () => {
    const { container } = render(
      <MaturityBar progress={{ new: 3, young: 0, mature: 1 }} caption="Card maturity" />,
    );
    expect(screen.getByRole("img", { name: "3 new, 0 young and 1 mature." })).toBeInTheDocument();
    const segments = container.querySelectorAll<HTMLElement>(".maturity-segment");
    expect([...segments].map((segment) => segment.className)).toEqual([
      "maturity-segment maturity-new",
      "maturity-segment maturity-mature",
    ]);
    expect(segments[0]!.style.flexGrow).toBe("3");
    expect(container.querySelector(".maturity-legend")).toHaveTextContent("3 new0 young1 mature");
  });

  it("speaks the counts in the chosen language", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <MaturityBar progress={{ new: 1, young: 2, mature: 0 }} caption="Mognad" />
      </I18nProvider>,
    );
    expect(screen.getByRole("img", { name: "1 nytt, 2 unga och 0 mogna." })).toBeInTheDocument();
    expect(screen.getByText("1 nytt")).toBeInTheDocument();
  });
});
