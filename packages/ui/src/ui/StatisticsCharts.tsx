// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useId, useState } from "preact/hooks";
import type { CardProgress } from "@solid-memo/domain/cardProgress";
import type { Bin, ForecastDay } from "@solid-memo/domain/scheduleInsight";
import { shiftStudyDay } from "@solid-memo/domain/answer";
import {
  introducedOverTime,
  type DayActivity,
  type MonthRetention,
  type Quiz,
  type Recall,
} from "@solid-memo/domain/statistics";
import {
  weekdayOf,
  type AnswerButtons,
  type FirstTry,
  type GradeGroup,
  type PeriodToDate,
  type WeekdayRhythm,
  type WeekLoad,
} from "@solid-memo/domain/studyPatterns";
import { useI18n } from "./i18n";

/**
 * The pieces the statistics are shown with: a number in a tile, an
 * activity calendar, bar charts (of what recent days held, of the
 * weekdays, of new cards beside reviews by week, of coming days, or of
 * any figures), histograms of intervals and eases, line charts of cards
 * introduced and of recall by month, bars of the answer buttons pressed
 * and of how mature the cards are,
 * and a line under each chart that says what a day held when it is
 * pointed at (or tapped), with the same days as a table for whoever cannot
 * see the chart. All in one hue: more, a stronger green; where two series
 * meet, a step of the green each, told apart by a dash or a legend too.
 */

/** A headline number with what it counts, named by that label as a group. */
export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  const labelId = useId();
  return (
    <div class="stat-tile" role="group" aria-labelledby={labelId}>
      <span class="stat-label" id={labelId}>
        {label}
      </span>
      <strong class="stat-value">{value}</strong>
      {detail !== undefined && <span class="stat-detail hint">{detail}</span>}
    </div>
  );
}

/**
 * How well reviews were remembered, as a share, with the count of reviews
 * it is of, however few; a dash while there are none.
 */
export function RecallTile({ label, recall }: { label: string; recall: Recall }) {
  const { t, formatPercent } = useI18n();
  return recall.reviews === 0 ? (
    <StatTile label={label} value="–" detail={t("statistics.noReviews")} />
  ) : (
    <StatTile
      label={label}
      value={formatPercent(recall.recalled / recall.reviews)}
      detail={t("statistics.ofReviews", { count: recall.reviews })}
    />
  );
}

/** The share of graded course answers that were right, with the count it is of; the answers must not be none. */
export function QuizTile({ quiz }: { quiz: Quiz }) {
  const { t, formatPercent } = useI18n();
  return (
    <StatTile
      label={t("statistics.quizAccuracy")}
      value={formatPercent(quiz.right / quiz.answers)}
      detail={t("statistics.rightOfAnswers", { count: quiz.answers })}
    />
  );
}

/**
 * The share of prompts remembered the first time they were seen, with
 * the count it is of, however few; a dash while there are none.
 */
export function FirstTryTile({ firstTry }: { firstTry: FirstTry }) {
  const { t, formatPercent } = useI18n();
  return firstTry.introduced === 0 ? (
    <StatTile label={t("statistics.firstTry")} value="–" detail={t("statistics.noNewCards")} />
  ) : (
    <StatTile
      label={t("statistics.firstTry")}
      value={formatPercent(firstTry.recalled / firstTry.introduced)}
      detail={t("statistics.ofNewCards", { count: firstTry.introduced })}
    />
  );
}

/**
 * This week or this month so far (periodToDateOf), a tile a figure, each
 * with the same days of the one before under it.
 */
export function PeriodTiles({
  period,
  figures,
}: {
  period: "week" | "month";
  figures: PeriodToDate;
}) {
  const { t, formatPercent } = useI18n();
  const { current, previous } = figures;
  const before = (value: string) =>
    period === "week"
      ? t("statistics.sameDaysLastWeek", { value })
      : t("statistics.sameDaysLastMonth", { value });
  const share = ({ reviews, recalled }: Recall) =>
    reviews === 0
      ? t("statistics.noReviewsThen")
      : t("statistics.recallShare", { percent: formatPercent(recalled / reviews), count: reviews });
  const { reviews, recalled } = current.recall;
  return (
    <div class="stat-tiles">
      <StatTile
        label={t("statistics.answers")}
        value={String(current.answers)}
        detail={before(String(previous.answers))}
      />
      <StatTile
        label={t("statistics.studyDays")}
        value={String(current.studyDays)}
        detail={before(String(previous.studyDays))}
      />
      <StatTile
        label={t("statistics.introducedColumn")}
        value={String(current.introduced)}
        detail={before(String(previous.introduced))}
      />
      <StatTile
        label={t("statistics.recall")}
        value={reviews === 0 ? "–" : formatPercent(recalled / reviews)}
        detail={[
          reviews === 0 ? t("statistics.noReviews") : t("statistics.ofReviews", { count: reviews }),
          before(share(previous.recall)),
        ].join(" · ")}
      />
    </div>
  );
}

/**
 * Whether there is nothing to say of recall but course answers to show:
 * no scored review yet, and graded course answers (a course's deck
 * studied only in its chapters). Recall then gives way to them.
 */
export function onlyCourseAnswers({
  retention,
  quiz,
}: {
  retention: { young: Recall; mature: Recall };
  quiz: Quiz;
}): boolean {
  return retention.young.reviews + retention.mature.reviews === 0 && quiz.answers > 0;
}

/**
 * Where the figures begin when the log begins after the range asked for
 * (StatisticsReport.coverage): its first month, written out; nothing when
 * the log covers the whole range.
 */
export function CoverageNote({ coverage }: { coverage: string | null }) {
  const { t, formatMonth } = useI18n();
  return coverage === null ? null : (
    <p class="hint">{t("statistics.coverage", { month: formatMonth(coverage) })}</p>
  );
}

/** The step of the green a day's answers get: 0 for none, then 1 to 4 by share of the busiest day. */
export function levelOf(answers: number, most: number): number {
  return answers === 0 ? 0 : Math.max(1, Math.ceil((answers / most) * 4));
}

/** What a day held, in words. */
function useDayText() {
  const { t, formatDate } = useI18n();
  return (studyDay: string, day: DayActivity | undefined) =>
    day === undefined
      ? t("statistics.dayNothing", { date: formatDate(studyDay) })
      : t("statistics.dayDetail", {
          date: formatDate(studyDay),
          answers: t("statistics.answerCount", { count: day.answers }),
          introduced: t("statistics.newCount", { count: day.introduced }),
          remembered: t("statistics.rememberedCount", { count: day.reviews - day.lapses }),
          lapses: t("statistics.lapseCount", { count: day.lapses }),
          repeats: t("statistics.repeatCount", { count: day.repeats }),
        });
}

/**
 * The line under a chart: the day pointed at, or how to point at one.
 * Not a live region: sweeping the pointer over the grid would read out
 * every day crossed, and the table below says the same to everyone.
 */
function Inspector({ text, prompt }: { text: string | null; prompt: string }) {
  return <p class="chart-inspector hint">{text ?? prompt}</p>;
}

/** The days with answers as a table, newest first. */
export function DayTable({ days }: { days: readonly DayActivity[] }) {
  const { t, formatDate } = useI18n();
  return (
    <details class="chart-table">
      <summary>{t("statistics.showTable")}</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">{t("statistics.day")}</th>
            <th scope="col">{t("statistics.answers")}</th>
            <th scope="col">{t("statistics.introduced")}</th>
            <th scope="col">{t("statistics.rememberedColumn")}</th>
            <th scope="col">{t("statistics.lapses")}</th>
            <th scope="col">{t("statistics.repeats")}</th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((day) => (
            <tr key={day.studyDay}>
              <td>{formatDate(day.studyDay)}</td>
              <td>{day.answers}</td>
              <td>{day.introduced}</td>
              <td>{day.reviews - day.lapses}</td>
              <td>{day.lapses}</td>
              <td>{day.repeats}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/**
 * The last `weeks` weeks, a column a week from Monday down to Sunday, a
 * cell a day in the step of green its answers give it; days after today
 * are left out. The columns share the figure's width, so a year fills it.
 */
export function ActivityCalendar({
  days,
  today,
  weeks = 52,
}: {
  days: readonly DayActivity[];
  today: string;
  weeks?: number;
}) {
  const { t } = useI18n();
  const dayText = useDayText();
  const [pointed, setPointed] = useState<string | null>(null);
  const byDay = new Map(days.map((day) => [day.studyDay, day]));
  const first = shiftStudyDay(today, -weekdayOf(today) - (weeks - 1) * 7);
  const shown = Array.from({ length: weeks * 7 }, (_, i) => shiftStudyDay(first, i)).filter(
    (day) => day <= today,
  );
  const most = Math.max(1, ...shown.map((day) => byDay.get(day)?.answers ?? 0));
  return (
    <figure class="activity-calendar">
      <figcaption>{t("statistics.activity", { weeks })}</figcaption>
      <div
        class="calendar-grid"
        role="img"
        aria-label={t("statistics.activityLabel", { weeks })}
        style={{ "--weeks": weeks }}
      >
        {shown.map((day, i) => (
          <span
            key={day}
            class={`calendar-day level-${levelOf(byDay.get(day)?.answers ?? 0, most)}${day === pointed ? " pointed" : ""}`}
            style={{ gridRow: weekdayOf(day) + 1, gridColumn: Math.floor(i / 7) + 1 }}
            data-day={day}
            onPointerEnter={() => setPointed(day)}
            onClick={() => setPointed(day)}
          />
        ))}
      </div>
      <div class="calendar-legend hint" aria-hidden="true">
        {t("statistics.less")}
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} class={`calendar-day level-${level}`} />
        ))}
        {t("statistics.more")}
      </div>
      <Inspector
        text={pointed === null ? null : dayText(pointed, byDay.get(pointed))}
        prompt={t("statistics.pointAtDay")}
      />
      <DayTable days={days} />
    </figure>
  );
}

/** One bar of a BarChart: its key, its figures (one a series), and what it holds, in words. */
export interface Bar {
  key: string;
  values: readonly number[];
  text: string;
}

/** A series of a BarChart with more than one: its words in the legend, and its step of the green, 1 lightest to 4. */
export interface BarSeries {
  label: string;
  step: 1 | 2 | 3 | 4;
}

/**
 * Figures as bars on one baseline, scaled to the largest, then the line
 * that says what a bar holds when it is pointed at (or tapped), or how
 * to point at one (`prompt`), then `children`: the same figures as a
 * table, for whoever cannot see the chart. A bar of several series
 * stacks them, the first at the bottom, or (`grouped`) stands them side
 * by side; a legend then names them. `ticks`, when given, name the bars
 * under them.
 */
export function BarChart({
  caption,
  label,
  bars,
  series = [],
  grouped = false,
  ticks,
  prompt,
  children,
}: {
  caption: string;
  /** The chart's text alternative. */
  label: string;
  bars: readonly Bar[];
  series?: readonly BarSeries[];
  grouped?: boolean;
  ticks?: readonly string[];
  prompt: string;
  children: ComponentChildren;
}) {
  const [pointed, setPointed] = useState<string | null>(null);
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  const most = Math.max(
    1,
    ...bars.map(({ values }) => (grouped ? Math.max(...values) : sum(values))),
  );
  const width = 8;
  const gap = 2;
  const height = 64;
  const count = bars.length;
  const scaled = (value: number) => (value === 0 ? 0 : Math.max(2, (value / most) * (height - 4)));
  // Each figure's rectangle in a bar: side by side, or stacked, the bar as tall as its total.
  const partsOf = (values: readonly number[], x: number) => {
    if (grouped) {
      const part = (width - (values.length - 1)) / values.length;
      return values.map((value, j) => ({
        x: x + j * (part + 1),
        width: part,
        y: height - scaled(value),
        height: scaled(value),
      }));
    }
    const total = sum(values);
    const tall = scaled(total);
    let top = height;
    return values.map((value) => {
      const part = total === 0 ? 0 : (value / total) * tall;
      top -= part;
      // A unit of the surface between a part and the one above it.
      const gapAbove = top - (height - tall) > 0.01 ? 1 : 0;
      return { x, width, y: top + gapAbove, height: Math.max(0, part - gapAbove) };
    });
  };
  return (
    <figure class="bar-chart">
      <figcaption>{caption}</figcaption>
      {series.length > 1 && (
        <ul class="bar-legend hint">
          {series.map((one) => (
            <li key={one.label}>
              <span class={`bar-swatch bar-step-${one.step}`} />
              {one.label}
            </li>
          ))}
        </ul>
      )}
      <svg
        viewBox={`0 0 ${count * (width + gap)} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
        <line
          class="baseline"
          x1="0"
          x2={count * (width + gap)}
          y1={height - 0.5}
          y2={height - 0.5}
        />
        {bars.map(({ key, values }, i) => (
          <g
            key={key}
            data-bar={key}
            onPointerEnter={() => setPointed(key)}
            onClick={() => setPointed(key)}
          >
            <rect class="bar-hit" x={i * (width + gap)} y="0" width={width + gap} height={height} />
            {partsOf(values, i * (width + gap)).map(
              (part, j) =>
                part.height > 0 && (
                  <rect
                    key={j}
                    class={`bar${series.length > 1 ? ` bar-step-${series[j]!.step}` : ""}${key === pointed ? " pointed" : ""}`}
                    x={part.x}
                    y={part.y}
                    width={part.width}
                    height={part.height}
                    rx={series.length > 1 && !grouped ? 0 : 2}
                  />
                ),
            )}
          </g>
        ))}
      </svg>
      {ticks !== undefined && (
        <span class="bar-ticks hint" aria-hidden="true">
          {ticks.map((tick, i) => (
            <span key={i}>{tick}</span>
          ))}
        </span>
      )}
      <Inspector text={bars.find((bar) => bar.key === pointed)?.text ?? null} prompt={prompt} />
      {children}
    </figure>
  );
}

/** The words a histogram's bins (scheduleInsight.ts) take: intervals in days, eases to a tenth. */
export function useBinRanges() {
  const { t } = useI18n();
  return {
    interval: (bin: Bin) =>
      bin.to === undefined
        ? t("statistics.intervalFrom", { from: bin.from })
        : bin.to - bin.from === 1
          ? t("statistics.dayCount", { count: bin.from })
          : t("statistics.intervalRange", { from: bin.from, to: bin.to - 1 }),
    ease: (bin: Bin) =>
      bin.to === undefined
        ? t("statistics.easeFrom", { from: bin.from.toFixed(1) })
        : t("statistics.easeRange", { from: bin.from.toFixed(1), to: bin.to.toFixed(1) }),
  };
}

/**
 * A histogram's bins as bars, each named by `range`, a note under them
 * when given, then the same as a table.
 */
export function Histogram({
  caption,
  label,
  heading,
  bins,
  range,
  note,
}: {
  caption: string;
  label: string;
  /** The table's first column: what the bins spread. */
  heading: string;
  bins: readonly Bin[];
  range: (bin: Bin) => string;
  note?: string;
}) {
  const { t } = useI18n();
  return (
    <BarChart
      caption={caption}
      label={label}
      bars={bins.map((bin) => ({
        key: String(bin.from),
        values: [bin.count],
        text: t("statistics.binText", { range: range(bin), count: bin.count }),
      }))}
      prompt={t("statistics.pointAtBar")}
    >
      {note !== undefined && <p class="chart-note hint">{note}</p>}
      <details class="chart-table">
        <summary>{t("statistics.showTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{heading}</th>
              <th scope="col">{t("statistics.prompts")}</th>
            </tr>
          </thead>
          <tbody>
            {bins.map((bin) => (
              <tr key={bin.from}>
                <td>{range(bin)}</td>
                <td>{bin.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </BarChart>
  );
}

/**
 * How the studied prompts' intervals are spread, with why some bins stay
 * nearly empty, and, folded away until opened, how their eases are.
 */
export function SpreadCharts({
  intervals,
  eases,
}: {
  intervals: readonly Bin[];
  eases: readonly Bin[];
}) {
  const { t } = useI18n();
  const ranges = useBinRanges();
  return (
    <>
      <Histogram
        caption={t("statistics.intervals")}
        label={t("statistics.intervalsLabel")}
        heading={t("statistics.interval")}
        bins={intervals}
        range={ranges.interval}
        note={t("statistics.intervalsNote")}
      />
      <details class="chart-fold">
        <summary>{t("statistics.showEases")}</summary>
        <Histogram
          caption={t("statistics.eases")}
          label={t("statistics.easesLabel")}
          heading={t("statistics.ease")}
          bins={eases}
          range={ranges.ease}
          note={t("statistics.easesNote")}
        />
      </details>
    </>
  );
}

/** The parts of a day DayHeldBars stacks, bottom first, with their words and steps of the green. */
const DAY_PARTS = [
  ["remembered", "statistics.rememberedColumn", 4],
  ["introduced", "statistics.introduced", 3],
  ["lapses", "statistics.lapses", 2],
  ["repeats", "statistics.repeats", 1],
] as const;

/**
 * What each of the last `count` study days up to today held, as stacked
 * bars on one baseline: reviews remembered, new cards, lapses and
 * repeats. A course answer to a card seen before is none of them, so a
 * day's bar can fall short of its answers, which the table gives.
 */
export function DayHeldBars({
  days,
  today,
  count = 30,
}: {
  days: readonly DayActivity[];
  today: string;
  count?: number;
}) {
  const { t } = useI18n();
  const dayText = useDayText();
  const byDay = new Map(days.map((day) => [day.studyDay, day]));
  const shown = Array.from({ length: count }, (_, i) => shiftStudyDay(today, i - count + 1));
  const partsOf = (day: DayActivity | undefined) =>
    day === undefined
      ? [0, 0, 0, 0]
      : [day.reviews - day.lapses, day.introduced, day.lapses, day.repeats];
  return (
    <BarChart
      caption={t("statistics.dayHeld", { count })}
      label={t("statistics.dayHeldLabel", { count })}
      bars={shown.map((day) => ({
        key: day,
        values: partsOf(byDay.get(day)),
        text: dayText(day, byDay.get(day)),
      }))}
      series={DAY_PARTS.map(([, key, step]) => ({ label: t(key), step }))}
      prompt={t("statistics.pointAtDay")}
    >
      <p class="chart-note hint">{t("statistics.dayHeldNote")}</p>
      <DayTable days={days.filter((day) => day.studyDay >= shown[0]!)} />
    </BarChart>
  );
}

/**
 * The answers on each weekday on average (weekdayRhythmOf), Monday to
 * Sunday, each named under its bar in this language, with how many of
 * that weekday were studied in the table.
 */
export function WeekdayChart({ weekdays }: { weekdays: readonly WeekdayRhythm[] }) {
  const { t, locale } = useI18n();
  const average = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  // 2024-01-01 was a Monday: weekday i is i days after it.
  const nameOf = (weekday: number, form: "short" | "long") =>
    new Date(Date.UTC(2024, 0, 1 + weekday)).toLocaleDateString(locale, {
      weekday: form,
      timeZone: "UTC",
    });
  const averageOf = ({ answers, days }: WeekdayRhythm) => (days === 0 ? 0 : answers / days);
  return (
    <BarChart
      caption={t("statistics.weekdays")}
      label={t("statistics.weekdaysLabel")}
      bars={weekdays.map((weekday) => ({
        key: String(weekday.weekday),
        values: [averageOf(weekday)],
        text: t("statistics.weekdayDetail", {
          weekday: nameOf(weekday.weekday, "long"),
          // To the tenth the table shows, which also picks the plural form.
          average: t("statistics.averageAnswerCount", {
            count: Math.round(averageOf(weekday) * 10) / 10,
          }),
          studied: weekday.studied,
          count: weekday.days,
        }),
      }))}
      ticks={weekdays.map((weekday) => nameOf(weekday.weekday, "short"))}
      prompt={t("statistics.pointAtWeekday")}
    >
      <p class="chart-note hint">{t("statistics.weekdaysNote")}</p>
      <details class="chart-table">
        <summary>{t("statistics.showTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("statistics.weekday")}</th>
              <th scope="col">{t("statistics.averageAnswers")}</th>
              <th scope="col">{t("statistics.studied")}</th>
            </tr>
          </thead>
          <tbody>
            {weekdays.map((weekday) => (
              <tr key={weekday.weekday}>
                <td>{nameOf(weekday.weekday, "long")}</td>
                <td>{average.format(averageOf(weekday))}</td>
                <td>
                  {t("statistics.studiedOf", { studied: weekday.studied, count: weekday.days })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </BarChart>
  );
}

/**
 * The new cards beside the reviews done, week by week (intakeVsLoadOf),
 * as pairs of bars: whether new cards are taken on faster than their
 * reviews can be kept up with.
 */
export function IntakeChart({ weeks }: { weeks: readonly WeekLoad[] }) {
  const { t, formatDate } = useI18n();
  return (
    <BarChart
      caption={t("statistics.intake")}
      label={t("statistics.intakeLabel")}
      bars={weeks.map((week) => ({
        key: week.week,
        values: [week.introduced, week.reviews],
        text: t("statistics.intakeDetail", {
          date: formatDate(week.week),
          introduced: week.introduced,
          reviews: t("statistics.reviewCount", { count: week.reviews }),
        }),
      }))}
      series={[
        { label: t("statistics.introduced"), step: 2 },
        { label: t("statistics.reviews"), step: 4 },
      ]}
      grouped
      prompt={t("statistics.pointAtWeek")}
    >
      <p class="chart-note hint">{t("statistics.intakeNote")}</p>
      <details class="chart-table">
        <summary>{t("statistics.showTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("statistics.weekOf")}</th>
              <th scope="col">{t("statistics.introduced")}</th>
              <th scope="col">{t("statistics.reviews")}</th>
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((week) => (
              <tr key={week.week}>
                <td>{formatDate(week.week)}</td>
                <td>{week.introduced}</td>
                <td>{week.reviews}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </BarChart>
  );
}

/**
 * The prompts falling due on each day of a forecast (forecastOf,
 * scheduleInsight.ts), today first with every overdue one, as pairs of
 * bars: what falls due, beside what the daily cap lets through. The
 * table lists the days with any.
 */
export function ForecastBars({ forecast }: { forecast: readonly ForecastDay[] }) {
  const { t, formatDate } = useI18n();
  const count = forecast.length;
  // The table lists only the days with reviews due or let through, or says there are none.
  const dueDays = forecast.filter((day) => day.due > 0 || day.reviews > 0);
  const textOf = (day: ForecastDay, i: number) =>
    t(i === 0 ? "statistics.dueTodayDetail" : "statistics.dueDetail", {
      date: formatDate(day.studyDay),
      reviews: t("statistics.reviewCount", { count: day.due }),
      capped: day.reviews,
    });
  return (
    <BarChart
      caption={t("statistics.forecast", { count })}
      label={t("statistics.forecastLabel", { count })}
      bars={forecast.map((day, i) => ({
        key: day.studyDay,
        values: [day.due, day.reviews],
        text: textOf(day, i),
      }))}
      series={[
        { label: t("statistics.due"), step: 2 },
        { label: t("statistics.withinLimit"), step: 4 },
      ]}
      grouped
      prompt={t("statistics.pointAtDayAhead")}
    >
      <p class="chart-note hint">{t("statistics.forecastNote")}</p>
      <details class="chart-table">
        <summary>{t("statistics.showTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("statistics.day")}</th>
              <th scope="col">{t("statistics.due")}</th>
              <th scope="col">{t("statistics.withinLimit")}</th>
            </tr>
          </thead>
          <tbody>
            {dueDays.map((day) => (
              <tr key={day.studyDay}>
                <td>{formatDate(day.studyDay)}</td>
                <td>{day.due}</td>
                <td>{day.reviews}</td>
              </tr>
            ))}
            {dueDays.length === 0 && (
              <tr>
                <td colSpan={3}>{t("statistics.nothingDue", { count })}</td>
              </tr>
            )}
          </tbody>
        </table>
      </details>
    </BarChart>
  );
}

/** One line of a LineChart: a value a point, null where it has none (a gap in the line). */
export interface LineSeries {
  /** Names the series in the legend's words and, as `line-<name>`, in the styles (its tint and dash). */
  name: string;
  label: string;
  values: readonly (number | null)[];
}

/**
 * One or two lines over evenly spaced points, on one scale from 0 up to
 * `max`. Pointing at a point puts a guide through
 * it and a dot on each line there, and says what it holds; a point of a
 * line with no neighbor is drawn as a dot of its own. With two lines a
 * legend names them, each by its own stroke.
 */
function LineChart({
  name,
  caption,
  label,
  note,
  keys,
  series,
  max,
  formatValue,
  formatKey,
  textAt,
  prompt,
  table,
}: {
  name: string;
  caption: string;
  label: string;
  note: string;
  keys: readonly string[];
  series: readonly LineSeries[];
  /** The scale's top, above 0. */
  max: number;
  formatValue: (value: number) => string;
  formatKey: (key: string) => string;
  textAt: (index: number) => string;
  prompt: string;
  table: ComponentChildren;
}) {
  const [pointed, setPointed] = useState<number | null>(null);
  const width = 300;
  const height = 100;
  const step = keys.length === 1 ? width : width / (keys.length - 1);
  const xOf = (i: number) => (keys.length === 1 ? width / 2 : i * step);
  const yOf = (value: number) => height - 2 - (value / max) * (height - 4);
  const at = (i: number, value: number) => `${xOf(i)},${yOf(value)}`;
  // The runs of points with a value: a line each, or a dot when one long.
  const runsOf = (values: readonly (number | null)[]) =>
    values
      .reduce<number[][]>((runs, value, i) => {
        if (value === null) return runs;
        if (i > 0 && values[i - 1] !== null) runs.at(-1)!.push(i);
        else runs.push([i]);
        return runs;
      }, [])
      .map((run) =>
        run.length === 1
          ? `M${at(run[0]!, values[run[0]!]!)}h0`
          : `M${run.map((i) => at(i, values[i]!)).join("L")}`,
      );
  return (
    <figure class={`line-chart ${name}`}>
      <figcaption>{caption}</figcaption>
      <p class="chart-note hint">{note}</p>
      {series.length > 1 && (
        <ul class="line-legend hint">
          {series.map((line) => (
            <li key={line.name}>
              <svg class="line-key" viewBox="0 0 24 8" aria-hidden="true">
                <line class={`line line-${line.name}`} x1="1" x2="23" y1="4" y2="4" />
              </svg>
              {line.label}
            </li>
          ))}
        </ul>
      )}
      <div class="line-plot">
        <span class="line-axis hint" aria-hidden="true">
          <span>{formatValue(max)}</span>
          <span>{formatValue(0)}</span>
        </span>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
        >
          <line class="gridline" x1="0" x2={width} y1={yOf(max)} y2={yOf(max)} />
          <line class="baseline" x1="0" x2={width} y1={yOf(0)} y2={yOf(0)} />
          {pointed !== null && (
            <line class="crosshair" x1={xOf(pointed)} x2={xOf(pointed)} y1="0" y2={height} />
          )}
          {series.map((line) =>
            runsOf(line.values).map((d) => (
              <path
                key={`${line.name} ${d}`}
                class={`line line-${line.name}${d.endsWith("h0") ? " lone" : ""}`}
                d={d}
              />
            )),
          )}
          {pointed !== null &&
            series.map((line) => {
              const value = line.values[pointed]!;
              return value === null ? null : (
                <path
                  key={line.name}
                  class={`line-point line-${line.name}`}
                  d={`M${at(pointed, value)}h0`}
                />
              );
            })}
          {keys.map((key, i) => (
            <rect
              key={key}
              class="bar-hit"
              data-point={key}
              x={xOf(i) - step / 2}
              y="0"
              width={step}
              height={height}
              onPointerEnter={() => setPointed(i)}
              onClick={() => setPointed(i)}
            />
          ))}
        </svg>
        <span class="line-keys hint" aria-hidden="true">
          <span>{formatKey(keys[0]!)}</span>
          {keys.length > 1 && <span>{formatKey(keys.at(-1)!)}</span>}
        </span>
      </div>
      <Inspector text={pointed === null ? null : textAt(pointed)} prompt={prompt} />
      {table}
    </figure>
  );
}

/**
 * The running total of cards introduced (introducedOverTime), a point a
 * study day from the first with answers to today, the total carried over
 * days of nothing new. The days must not be empty. An answer's study day
 * is kept as it was when given, so a later day boundary or another time
 * zone can leave answers after today; the line then runs on to the last.
 */
export function IntroducedChart({ days, today }: { days: readonly DayActivity[]; today: string }) {
  const { t, locale, formatDate } = useI18n();
  const number = new Intl.NumberFormat(locale);
  const totals = introducedOverTime(days);
  const byDay = new Map(totals.map((total) => [total.studyDay, total.introduced]));
  const keys: string[] = [];
  const values: number[] = [];
  const lastDay = totals.at(-1)!.studyDay > today ? totals.at(-1)!.studyDay : today;
  for (let day = totals[0]!.studyDay; day <= lastDay; day = shiftStudyDay(day, 1)) {
    keys.push(day);
    values.push(byDay.get(day) ?? values.at(-1)!);
  }
  return (
    <LineChart
      name="introduced-chart"
      caption={t("statistics.introducedOverTime")}
      label={t("statistics.introducedLabel")}
      note={t("statistics.introducedNote")}
      keys={keys}
      series={[{ name: "introduced", label: t("statistics.introducedTotal"), values }]}
      max={Math.max(1, values.at(-1)!)}
      formatValue={(value) => number.format(value)}
      formatKey={formatDate}
      textAt={(i) =>
        t("statistics.introducedDetail", { date: formatDate(keys[i]!), count: values[i]! })
      }
      prompt={t("statistics.pointAtDay")}
      table={
        <details class="chart-table">
          <summary>{t("statistics.showTable")}</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("statistics.day")}</th>
                <th scope="col">{t("statistics.introduced")}</th>
                <th scope="col">{t("statistics.introducedTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((day) => (
                <tr key={day.studyDay}>
                  <td>{formatDate(day.studyDay)}</td>
                  <td>{day.introduced}</td>
                  <td>{byDay.get(day.studyDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      }
    />
  );
}

/** The study month after `month` ("YYYY-MM"). */
function nextMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  // Date.UTC counts months from 0, so the month's own number is the next one's index.
  return new Date(Date.UTC(year!, number!, 1)).toISOString().slice(0, 7);
}

/**
 * How well reviews were remembered, month by month (monthlyRetention), on
 * a fixed scale of 0 to 100%: young cards dashed, mature cards solid. A
 * month without reviews of a kind, or without answers at all, is a gap in
 * that line, not a 0. The table adds each month's first tries. The
 * months must not be empty.
 */
export function RecallChart({ months }: { months: readonly MonthRetention[] }) {
  const { t, locale, formatPercent } = useI18n();
  const formatMonth = (month: string) =>
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  const byMonth = new Map(months.map((entry) => [entry.month, entry.retention]));
  const keys = [months[0]!.month];
  while (keys.at(-1)! < months.at(-1)!.month) keys.push(nextMonth(keys.at(-1)!));
  const none: Recall = { reviews: 0, recalled: 0 };
  const retentionAt = (month: string) => byMonth.get(month) ?? { young: none, mature: none };
  const share = (recall: Recall) =>
    recall.reviews === 0
      ? t("statistics.noReviewsThen")
      : t("statistics.recallShare", {
          percent: formatPercent(recall.recalled / recall.reviews),
          count: recall.reviews,
        });
  const firstTryShare = ({ introduced, recalled }: FirstTry) =>
    introduced === 0
      ? "–"
      : t("statistics.firstTryShare", {
          percent: formatPercent(recalled / introduced),
          count: introduced,
        });
  const line = (kind: "young" | "mature") =>
    keys.map((month) => {
      const recall = retentionAt(month)[kind];
      return recall.reviews === 0 ? null : (recall.recalled / recall.reviews) * 100;
    });
  const detail = (month: string) =>
    t("statistics.recallDetail", {
      month: formatMonth(month),
      young: share(retentionAt(month).young),
      mature: share(retentionAt(month).mature),
    });
  return (
    <LineChart
      name="recall-chart"
      caption={t("statistics.recallByMonth")}
      label={t("statistics.recallLabel")}
      note={t("statistics.recallNote")}
      keys={keys}
      series={[
        { name: "young", label: t("statistics.youngShort"), values: line("young") },
        { name: "mature", label: t("statistics.matureShort"), values: line("mature") },
      ]}
      max={100}
      formatValue={(value) => formatPercent(value / 100)}
      formatKey={formatMonth}
      textAt={(i) => detail(keys[i]!)}
      prompt={t("statistics.pointAtMonth")}
      table={
        <details class="chart-table">
          <summary>{t("statistics.showTable")}</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("statistics.month")}</th>
                <th scope="col">{t("statistics.youngShort")}</th>
                <th scope="col">{t("statistics.matureShort")}</th>
                <th scope="col">{t("statistics.firstTry")}</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((entry) => (
                <tr key={entry.month}>
                  <td>{formatMonth(entry.month)}</td>
                  <td>{share(entry.retention.young)}</td>
                  <td>{share(entry.retention.mature)}</td>
                  <td>{firstTryShare(entry.firstTry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      }
    />
  );
}

/** The answer buttons, in order, with the words the study screen gives them. */
export const GRADE_GROUPS = [
  ["again", "study.minimal.again"],
  ["hard", "study.minimal.hard"],
  ["good", "study.minimal.good"],
  ["easy", "study.minimal.easy"],
] as const;

/**
 * The answer buttons pressed (gradeGroupsOf) for first answers and for
 * young and mature reviews: a bar each, its four steps of the green as
 * wide as their shares, Again the lightest; a kind with no answers has
 * an empty bar. Pointing at a step says its share; the table gives every
 * count.
 */
export function GradeBars({ buttons }: { buttons: AnswerButtons }) {
  const { t, formatPercent } = useI18n();
  const [pointed, setPointed] = useState<string | null>(null);
  const kinds = [
    ["introductions", t("statistics.buttonsFirst")],
    ["young", t("statistics.youngShort")],
    ["mature", t("statistics.matureShort")],
  ] as const;
  const totalOf = (kind: keyof AnswerButtons) =>
    GRADE_GROUPS.reduce((total, [group]) => total + buttons[kind][group], 0);
  const cell = (kind: keyof AnswerButtons, group: GradeGroup) => {
    const count = buttons[kind][group];
    return count === 0
      ? "0"
      : t("statistics.buttonCell", { count, percent: formatPercent(count / totalOf(kind)) });
  };
  const textOf = (key: string) => {
    const [kind, group] = key.split(" ") as [keyof AnswerButtons, GradeGroup];
    const count = buttons[kind][group];
    return t("statistics.buttonDetail", {
      kind: kinds.find(([name]) => name === kind)![1],
      button: t(GRADE_GROUPS.find(([name]) => name === group)![1]),
      percent: formatPercent(count / totalOf(kind)),
      count,
    });
  };
  return (
    <figure class="grade-bars">
      <figcaption>{t("statistics.buttons")}</figcaption>
      <p class="chart-note hint">{t("statistics.buttonsNote")}</p>
      <ul class="maturity-legend hint" aria-hidden="true">
        {GRADE_GROUPS.map(([group, key]) => (
          <li key={group}>
            <span class={`maturity-swatch grade-${group}`} />
            {t(key)}
          </li>
        ))}
      </ul>
      <div class="grade-rows">
        {kinds.map(([kind, name]) => (
          <div key={kind} class="grade-row">
            <span class="grade-kind" aria-hidden="true">
              {name}
            </span>
            <div
              class="grade-bar"
              role="img"
              aria-label={t("statistics.buttonsLabel", {
                kind: name,
                counts: GRADE_GROUPS.map(([group, key]) =>
                  t("statistics.buttonCount", { button: t(key), count: buttons[kind][group] }),
                ).join(", "),
              })}
            >
              {GRADE_GROUPS.filter(([group]) => buttons[kind][group] > 0).map(([group]) => (
                <span
                  key={group}
                  class={`grade-segment grade-${group}${pointed === `${kind} ${group}` ? " pointed" : ""}`}
                  style={{ flexGrow: buttons[kind][group] }}
                  data-part={`${kind} ${group}`}
                  onPointerEnter={() => setPointed(`${kind} ${group}`)}
                  onClick={() => setPointed(`${kind} ${group}`)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <Inspector
        text={pointed === null ? null : textOf(pointed)}
        prompt={t("statistics.pointAtButton")}
      />
      <details class="chart-table">
        <summary>{t("statistics.showTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("statistics.answers")}</th>
              {GRADE_GROUPS.map(([group, key]) => (
                <th key={group} scope="col">
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kinds.map(([kind, name]) => (
              <tr key={kind}>
                <th scope="row">{name}</th>
                {GRADE_GROUPS.map(([group]) => (
                  <td key={group}>{cell(kind, group)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** The stages a prompt goes through, in order, with the words their counts take. */
const STAGES = [
  ["new", "statistics.maturityNew"],
  ["relearning", "statistics.maturityRelearning"],
  ["young", "statistics.maturityYoung"],
  ["mature", "statistics.maturityMature"],
] as const;

/**
 * How many prompts are new, relearning, young and mature, as one bar of
 * four steps of the green, each as wide as its share; an empty stage takes no room.
 * The legend under it gives every count, so no table is needed.
 */
export function MaturityBar({
  progress,
  caption,
}: {
  progress: CardProgress;
  caption: ComponentChildren;
}) {
  const { t } = useI18n();
  return (
    <figure class="maturity">
      <figcaption>{caption}</figcaption>
      <div
        class="maturity-bar"
        role="img"
        aria-label={t("statistics.maturityLabel", {
          new: t("statistics.maturityNew", { count: progress.new }),
          relearning: t("statistics.maturityRelearning", { count: progress.relearning }),
          young: t("statistics.maturityYoung", { count: progress.young }),
          mature: t("statistics.maturityMature", { count: progress.mature }),
        })}
      >
        {STAGES.filter(([stage]) => progress[stage] > 0).map(([stage]) => (
          <span
            key={stage}
            class={`maturity-segment maturity-${stage}`}
            style={{ flexGrow: progress[stage] }}
          />
        ))}
      </div>
      <ul class="maturity-legend hint" aria-hidden="true">
        {STAGES.map(([stage, key]) => (
          <li key={stage}>
            <span class={`maturity-swatch maturity-${stage}`} />
            {t(key, { count: progress[stage] })}
          </li>
        ))}
      </ul>
    </figure>
  );
}
