import type { ComponentChildren } from "preact";
import { useId, useState } from "preact/hooks";
import type { CardProgress } from "@solid-memo/domain/cardProgress";
import type { ForecastDay } from "@solid-memo/domain/scheduleInsight";
import {
  introducedOverTime,
  shiftStudyDay,
  type DayActivity,
  type MonthRetention,
  type Recall,
} from "@solid-memo/domain/statistics";
import { useI18n } from "./i18n";

/**
 * The pieces the statistics are shown with: a number in a tile, an
 * activity calendar, bar charts (of recent and coming days, or of any
 * figures), line charts of cards introduced and of recall by month, a bar
 * of how mature the cards are, and a line under each chart that says what a day held when it is
 * pointed at (or tapped), with the same days as a table for whoever cannot
 * see the chart. All in one hue: more, a stronger green; where two series
 * meet, a step of the green each, told apart by a dash or a legend too.
 */

/** A headline number with what it counts, named by that label as a group. */
export function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
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

/** How well reviews were remembered, as a share; a dash while there are none. */
export function RecallTile({ label, recall }: { label: string; recall: Recall }) {
  const { t, locale } = useI18n();
  const percent = new Intl.NumberFormat(locale, { style: "percent" });
  return recall.reviews === 0 ? (
    <StatTile label={label} value="–" detail={t("statistics.noReviews")} />
  ) : (
    <StatTile
      label={label}
      value={percent.format(recall.recalled / recall.reviews)}
      detail={t("statistics.ofReviews", { count: recall.reviews })}
    />
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
          introduced: day.introduced,
          forgotten: day.forgotten,
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
            <th scope="col">{t("statistics.forgotten")}</th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((day) => (
            <tr key={day.studyDay}>
              <td>{formatDate(day.studyDay)}</td>
              <td>{day.answers}</td>
              <td>{day.introduced}</td>
              <td>{day.forgotten}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Weekday of a study day, Monday 0 to Sunday 6. */
function weekdayOf(studyDay: string): number {
  return (new Date(`${studyDay}T00:00:00Z`).getUTCDay() + 6) % 7;
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
  const shown = Array.from({ length: weeks * 7 }, (_, i) => shiftStudyDay(first, i)).filter((day) => day <= today);
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
      <Inspector text={pointed === null ? null : dayText(pointed, byDay.get(pointed))} prompt={t("statistics.pointAtDay")} />
      <DayTable days={days} />
    </figure>
  );
}

/** One bar of a BarChart: its key, its figure, and what it holds, in words. */
export interface Bar {
  key: string;
  value: number;
  text: string;
}

/**
 * Figures as bars on one baseline, scaled to the largest, then the line
 * that says what a bar holds when it is pointed at (or tapped), or how
 * to point at one (`prompt`), then `children`: the same figures as a
 * table, for whoever cannot see the chart.
 */
export function BarChart({
  caption,
  label,
  bars,
  prompt,
  children,
}: {
  caption: string;
  /** The chart's text alternative. */
  label: string;
  bars: readonly Bar[];
  prompt: string;
  children: ComponentChildren;
}) {
  const [pointed, setPointed] = useState<string | null>(null);
  const most = Math.max(1, ...bars.map((bar) => bar.value));
  const width = 8;
  const gap = 2;
  const height = 64;
  const count = bars.length;
  return (
    <figure class="bar-chart">
      <figcaption>{caption}</figcaption>
      <svg viewBox={`0 0 ${count * (width + gap)} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <line class="baseline" x1="0" x2={count * (width + gap)} y1={height - 0.5} y2={height - 0.5} />
        {bars.map(({ key, value }, i) => {
          const bar = value === 0 ? 0 : Math.max(2, (value / most) * (height - 4));
          return (
            <g key={key} data-bar={key} onPointerEnter={() => setPointed(key)} onClick={() => setPointed(key)}>
              <rect class="bar-hit" x={i * (width + gap)} y="0" width={width + gap} height={height} />
              {bar > 0 && (
                <rect
                  class={`bar${key === pointed ? " pointed" : ""}`}
                  x={i * (width + gap)}
                  y={height - bar}
                  width={width}
                  height={bar}
                  rx="2"
                />
              )}
            </g>
          );
        })}
      </svg>
      <Inspector text={bars.find((bar) => bar.key === pointed)?.text ?? null} prompt={prompt} />
      {children}
    </figure>
  );
}

/** Answers on each of the last `count` study days up to today, as bars on one baseline. */
export function DayBars({ days, today, count = 30 }: { days: readonly DayActivity[]; today: string; count?: number }) {
  const { t } = useI18n();
  const dayText = useDayText();
  const byDay = new Map(days.map((day) => [day.studyDay, day]));
  const shown = Array.from({ length: count }, (_, i) => shiftStudyDay(today, i - count + 1));
  return (
    <BarChart
      caption={t("statistics.lastDays", { count })}
      label={t("statistics.lastDaysLabel", { count })}
      bars={shown.map((day) => ({ key: day, value: byDay.get(day)?.answers ?? 0, text: dayText(day, byDay.get(day)) }))}
      prompt={t("statistics.pointAtDay")}
    >
      <DayTable days={days.filter((day) => day.studyDay >= shown[0]!)} />
    </BarChart>
  );
}

/**
 * The prompts falling due on each day of a forecast (forecastOf,
 * scheduleInsight.ts), today first with every overdue one, as bars: what
 * falls due, not what the daily cap lets through. The table lists the
 * days with any.
 */
export function ForecastBars({ forecast }: { forecast: readonly ForecastDay[] }) {
  const { t, formatDate } = useI18n();
  const count = forecast.length;
  // The table lists only the days with reviews due, or says there are none.
  const dueDays = forecast.filter((day) => day.due > 0);
  const textOf = (day: ForecastDay, i: number) =>
    t(i === 0 ? "statistics.dueTodayDetail" : "statistics.dueDetail", {
      date: formatDate(day.studyDay),
      reviews: t("statistics.reviewCount", { count: day.due }),
    });
  return (
    <BarChart
      caption={t("statistics.forecast", { count })}
      label={t("statistics.forecastLabel", { count })}
      bars={forecast.map((day, i) => ({ key: day.studyDay, value: day.due, text: textOf(day, i) }))}
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
            </tr>
          </thead>
          <tbody>
            {dueDays.map((day) => (
              <tr key={day.studyDay}>
                <td>{formatDate(day.studyDay)}</td>
                <td>{day.due}</td>
              </tr>
            ))}
            {dueDays.length === 0 && (
              <tr>
                <td colSpan={2}>{t("statistics.nothingDue", { count })}</td>
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
 * line with no neighbour is drawn as a dot of its own. With two lines a
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
        run.length === 1 ? `M${at(run[0]!, values[run[0]!]!)}h0` : `M${run.map((i) => at(i, values[i]!)).join("L")}`,
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
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
          <line class="gridline" x1="0" x2={width} y1={yOf(max)} y2={yOf(max)} />
          <line class="baseline" x1="0" x2={width} y1={yOf(0)} y2={yOf(0)} />
          {pointed !== null && <line class="crosshair" x1={xOf(pointed)} x2={xOf(pointed)} y1="0" y2={height} />}
          {series.map((line) =>
            runsOf(line.values).map((d) => (
              <path key={`${line.name} ${d}`} class={`line line-${line.name}${d.endsWith("h0") ? " lone" : ""}`} d={d} />
            )),
          )}
          {pointed !== null &&
            series.map((line) => {
              const value = line.values[pointed]!;
              return value === null ? null : (
                <path key={line.name} class={`line-point line-${line.name}`} d={`M${at(pointed, value)}h0`} />
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
      textAt={(i) => t("statistics.introducedDetail", { date: formatDate(keys[i]!), count: values[i]! })}
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
 * that line, not a 0. The months must not be empty.
 */
export function RecallChart({ months }: { months: readonly MonthRetention[] }) {
  const { t, locale } = useI18n();
  const percent = new Intl.NumberFormat(locale, { style: "percent" });
  const formatMonth = (month: string) =>
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale, { year: "numeric", month: "long", timeZone: "UTC" });
  const byMonth = new Map(months.map((entry) => [entry.month, entry.retention]));
  const keys = [months[0]!.month];
  while (keys.at(-1)! < months.at(-1)!.month) keys.push(nextMonth(keys.at(-1)!));
  const none: Recall = { reviews: 0, recalled: 0 };
  const retentionAt = (month: string) => byMonth.get(month) ?? { young: none, mature: none };
  const share = (recall: Recall) =>
    recall.reviews === 0
      ? t("statistics.noReviewsThen")
      : t("statistics.recallShare", { percent: percent.format(recall.recalled / recall.reviews), count: recall.reviews });
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
      formatValue={(value) => percent.format(value / 100)}
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
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((entry) => (
                <tr key={entry.month}>
                  <td>{formatMonth(entry.month)}</td>
                  <td>{share(entry.retention.young)}</td>
                  <td>{share(entry.retention.mature)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      }
    />
  );
}

/** The stages a prompt goes through, in order, with the words their counts take. */
const STAGES = [
  ["new", "statistics.maturityNew"],
  ["young", "statistics.maturityYoung"],
  ["mature", "statistics.maturityMature"],
] as const;

/**
 * How many prompts are new, young and mature, as one bar of three steps
 * of the green, each as wide as its share; an empty stage takes no room.
 * The legend under it gives every count, so no table is needed.
 */
export function MaturityBar({ progress, caption }: { progress: CardProgress; caption: ComponentChildren }) {
  const { t } = useI18n();
  return (
    <figure class="maturity">
      <figcaption>{caption}</figcaption>
      <div
        class="maturity-bar"
        role="img"
        aria-label={t("statistics.maturityLabel", {
          new: t("statistics.maturityNew", { count: progress.new }),
          young: t("statistics.maturityYoung", { count: progress.young }),
          mature: t("statistics.maturityMature", { count: progress.mature }),
        })}
      >
        {STAGES.filter(([stage]) => progress[stage] > 0).map(([stage]) => (
          <span key={stage} class={`maturity-segment maturity-${stage}`} style={{ flexGrow: progress[stage] }} />
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
