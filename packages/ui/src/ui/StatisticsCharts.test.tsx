// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { DayActivity, MonthRetention } from "@solid-memo/domain/statistics";
import { I18nProvider } from "./i18n";
import {
  ActivityCalendar,
  BarChart,
  DayHeldBars,
  FirstTryTile,
  ForecastBars,
  GradeBars,
  IntakeChart,
  IntroducedChart,
  levelOf,
  MaturityBar,
  PeriodTiles,
  QuizTile,
  RecallChart,
  RecallTile,
  StatTile,
  WeekdayChart,
} from "./StatisticsCharts";

const day = (
  studyDay: string,
  answers: number,
  introduced: number,
  lapses: number,
  repeats = 0,
) => ({
  studyDay,
  answers,
  introduced,
  reviews: answers - introduced - repeats,
  lapses,
  repeats,
});
const days: DayActivity[] = [
  day("2026-09-14", 40, 10, 4),
  day("2026-09-20", 10, 0, 1),
  day("2026-09-21", 1, 1, 0),
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

  it("give a share of a single review, with its count beside it", () => {
    render(<RecallTile label="Young cards" recall={{ reviews: 1, recalled: 0 }} />);
    expect(screen.getByRole("group", { name: "Young cards" })).toHaveTextContent("0%of 1 review");
  });

  it("give the share of new cards remembered the first time, with their count, and a dash before any", () => {
    const { rerender } = render(<FirstTryTile firstTry={{ introduced: 4, recalled: 3 }} />);
    expect(screen.getByRole("group", { name: "First try" })).toHaveTextContent(
      "75%remembered, of 4 new cards",
    );
    rerender(<FirstTryTile firstTry={{ introduced: 0, recalled: 0 }} />);
    expect(screen.getByRole("group", { name: "First try" })).toHaveTextContent("–No new cards yet");
  });

  it("give this week so far beside the same days of last week, and this month beside last month's", () => {
    const figures = {
      current: { answers: 12, studyDays: 2, introduced: 3, recall: { reviews: 4, recalled: 3 } },
      previous: { answers: 8, studyDays: 1, introduced: 5, recall: { reviews: 0, recalled: 0 } },
    };
    const { rerender } = render(<PeriodTiles period="week" figures={figures} />);
    expect(screen.getByRole("group", { name: "Answers" })).toHaveTextContent(
      "12Same days last week: 8",
    );
    expect(screen.getByRole("group", { name: "Study days" })).toHaveTextContent(
      "2Same days last week: 1",
    );
    expect(screen.getByRole("group", { name: "Introduced" })).toHaveTextContent(
      "3Same days last week: 5",
    );
    expect(screen.getByRole("group", { name: "Recall" })).toHaveTextContent(
      "75%of 4 reviews · Same days last week: no reviews",
    );
    rerender(
      <PeriodTiles
        period="month"
        figures={{ current: figures.previous, previous: figures.current }}
      />,
    );
    expect(screen.getByRole("group", { name: "Recall" })).toHaveTextContent(
      "–No reviews yet · Same days last month: 75% of 4 reviews",
    );
  });

  it("give the share of graded course answers right, with their count", () => {
    render(<QuizTile quiz={{ answers: 4, right: 3 }} />);
    expect(screen.getByRole("group", { name: "Graded course answers" })).toHaveTextContent(
      "75%right, of 4 answers",
    );
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

describe("BarChart", () => {
  it("stands a bar's figures side by side when grouped, and names the bars under them", () => {
    const { container } = render(
      <BarChart
        caption="Pairs"
        label="Pairs of bars"
        bars={[
          { key: "a", values: [2, 4], text: "A" },
          { key: "b", values: [0, 1], text: "B" },
        ]}
        series={[
          { label: "One", step: 2 },
          { label: "Two", step: 4 },
        ]}
        grouped
        ticks={["Mo", "Tu"]}
        prompt="Point"
      >
        {null}
      </BarChart>,
    );
    const [first, second] = container.querySelectorAll('g[data-bar="a"] rect.bar');
    expect(Number(second!.getAttribute("x"))).toBeGreaterThan(Number(first!.getAttribute("x")));
    expect(Number(second!.getAttribute("height"))).toBe(60);
    expect(container.querySelectorAll('g[data-bar="b"] rect.bar')).toHaveLength(1);
    expect(container.querySelector(".bar-ticks")).toHaveTextContent("MoTu");
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
    expect(
      screen.getByRole("img", { name: /Reviews due on each of the next 3 days/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/without your daily review limit/)).toBeInTheDocument();
    expect(container.querySelectorAll("rect.bar")).toHaveLength(2);
    expect(
      screen.getByText("Point at a day to see what falls due, or open the table below."),
    ).toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector('g[data-bar="2026-09-21"]')!);
    expect(
      screen.getByText("September 21, 2026, today: 5 reviews due, overdue ones included."),
    ).toBeInTheDocument();
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

describe("RecallChart", () => {
  const recall = (reviews: number, recalled: number) => ({ reviews, recalled });
  const months: MonthRetention[] = [
    {
      month: "2026-06",
      retention: { young: recall(4, 3), mature: recall(0, 0) },
      firstTry: { introduced: 8, recalled: 6 },
    },
    {
      month: "2026-07",
      retention: { young: recall(10, 9), mature: recall(1, 1) },
      firstTry: { introduced: 1, recalled: 1 },
    },
    {
      month: "2026-09",
      retention: { young: recall(0, 0), mature: recall(2, 1) },
      firstTry: { introduced: 0, recalled: 0 },
    },
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
    expect(
      screen.getByText(
        "Point at a month to see how well it was remembered, or open the table below.",
      ),
    ).toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector('[data-point="2026-07"]')!);
    expect(
      screen.getByText("July 2026: young cards 90% of 10 reviews, mature cards 100% of 1 review."),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("path.line-point")).toHaveLength(2);
    fireEvent.click(container.querySelector('[data-point="2026-08"]')!);
    expect(
      screen.getByText("August 2026: young cards no reviews, mature cards no reviews."),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("path.line-point")).toHaveLength(0);
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "MonthYoungMatureFirst try",
      "September 2026no reviews50% of 2 reviews–",
      "July 202690% of 10 reviews100% of 1 review100% of 1 new card",
      "June 202675% of 4 reviewsno reviews75% of 8 new cards",
    ]);
  });

  it("names a single month once under the plot", () => {
    const { container } = render(<RecallChart months={[months[0]!]} />);
    expect(container.querySelector(".line-keys")!.children).toHaveLength(1);
    fireEvent.pointerEnter(container.querySelector('[data-point="2026-06"]')!);
    expect(
      screen.getByText("June 2026: young cards 75% of 4 reviews, mature cards no reviews."),
    ).toBeInTheDocument();
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

describe("WeekdayChart", () => {
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    answers: weekday === 0 ? 5 : 0,
    days: weekday < 2 ? 2 : 1,
    studied: weekday === 0 ? 2 : 0,
  }));

  it("draws the answers on each weekday on average, Monday first, named under the bars", () => {
    const { container } = render(<WeekdayChart weekdays={weekdays} />);
    expect(screen.getByText("Answers by weekday")).toBeInTheDocument();
    expect(container.querySelectorAll("g[data-bar]")).toHaveLength(7);
    expect(container.querySelectorAll("rect.bar")).toHaveLength(1);
    expect(container.querySelector(".bar-ticks")).toHaveTextContent("MonTueWedThuFriSatSun");
    fireEvent.pointerEnter(container.querySelector('g[data-bar="0"]')!);
    expect(screen.getByText("Monday: 2.5 answers on average; studied 2 of 2.")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("row")
        .map((row) => row.textContent)
        .slice(0, 3),
    ).toEqual(["WeekdayAnswers on averageStudied", "Monday2.52 of 2", "Tuesday00 of 2"]);
  });

  it("says an average to the tenth, in its plural form", () => {
    const { container } = render(
      <WeekdayChart
        weekdays={weekdays.map((weekday) =>
          weekday.weekday === 1
            ? { ...weekday, answers: 2, studied: 1 }
            : weekday.weekday === 2
              ? { ...weekday, answers: 4, days: 3, studied: 3 }
              : weekday,
        )}
      />,
    );
    fireEvent.click(container.querySelector('g[data-bar="1"]')!);
    expect(screen.getByText("Tuesday: 1 answer on average; studied 1 of 2.")).toBeInTheDocument();
    fireEvent.click(container.querySelector('g[data-bar="2"]')!);
    expect(
      screen.getByText("Wednesday: 1.3 answers on average; studied 3 of 3."),
    ).toBeInTheDocument();
  });

  it("names the weekdays in the spoken language", () => {
    const { container } = render(
      <I18nProvider locale="de" onChoose={() => undefined}>
        <WeekdayChart weekdays={weekdays.map((weekday) => ({ ...weekday, days: 0, studied: 0 }))} />
      </I18nProvider>,
    );
    expect(container.querySelector(".bar-ticks")!.firstChild).toHaveTextContent("Mo");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Montag00 von 0");
  });
});

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

describe("GradeBars", () => {
  const buttons = {
    introductions: { again: 1, hard: 0, good: 3, easy: 0 },
    young: { again: 0, hard: 1, good: 2, easy: 1 },
    mature: { again: 0, hard: 0, good: 0, easy: 0 },
  };

  it("gives each kind of answer a bar of the buttons pressed, its share when pointed at, and every count in the table", () => {
    const { container } = render(<GradeBars buttons={buttons} />);
    expect(screen.getByText("Answer buttons")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "First answers: Again 1, Hard 0, Good 3, Easy 0." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Mature: Again 0, Hard 0, Good 0, Easy 0." }),
    ).toBeEmptyDOMElement();
    expect(container.querySelectorAll(".grade-segment")).toHaveLength(2 + 3);
    fireEvent.pointerEnter(container.querySelector('[data-part="introductions good"]')!);
    expect(screen.getByText("First answers: Good on 3 answers, 75%.")).toBeInTheDocument();
    expect(container.querySelector('[data-part="introductions good"]')).toHaveClass("pointed");
    fireEvent.click(container.querySelector('[data-part="young easy"]')!);
    expect(screen.getByText("Young: Easy on 1 answer, 25%.")).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "AnswersAgainHardGoodEasy",
      "First answers1 (25%)03 (75%)0",
      "Young01 (25%)2 (50%)1 (25%)",
      "Mature0000",
    ]);
  });
});
