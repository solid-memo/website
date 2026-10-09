import { useId, useState } from "preact/hooks";
import { shiftStudyDay, type DayActivity, type Recall } from "@solid-memo/domain/statistics";
import { useI18n } from "./i18n";

/**
 * The pieces the statistics are shown with: a number in a tile, an
 * activity calendar, a bar chart of recent days, and a line under each
 * chart that says what a day held when it is pointed at (or tapped), with
 * the same days as a table for whoever cannot see the chart. One series
 * each, in one hue: more answers, a stronger green.
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
function Inspector({ text }: { text: string | null }) {
  const { t } = useI18n();
  return (
    <p class="chart-inspector hint">
      {text ?? t("statistics.pointAtDay")}
    </p>
  );
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
      <Inspector text={pointed === null ? null : dayText(pointed, byDay.get(pointed))} />
      <DayTable days={days} />
    </figure>
  );
}

/** Answers on each of the last `count` study days up to today, as bars on one baseline. */
export function DayBars({ days, today, count = 30 }: { days: readonly DayActivity[]; today: string; count?: number }) {
  const { t } = useI18n();
  const dayText = useDayText();
  const [pointed, setPointed] = useState<string | null>(null);
  const byDay = new Map(days.map((day) => [day.studyDay, day]));
  const shown = Array.from({ length: count }, (_, i) => shiftStudyDay(today, i - count + 1));
  const most = Math.max(1, ...shown.map((day) => byDay.get(day)?.answers ?? 0));
  const width = 8;
  const gap = 2;
  const height = 64;
  return (
    <figure class="day-bars">
      <figcaption>{t("statistics.lastDays", { count })}</figcaption>
      <svg
        viewBox={`0 0 ${count * (width + gap)} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("statistics.lastDaysLabel", { count })}
      >
        <line class="baseline" x1="0" x2={count * (width + gap)} y1={height - 0.5} y2={height - 0.5} />
        {shown.map((day, i) => {
          const answers = byDay.get(day)?.answers ?? 0;
          const bar = answers === 0 ? 0 : Math.max(2, (answers / most) * (height - 4));
          return (
            <g key={day} data-day={day} onPointerEnter={() => setPointed(day)} onClick={() => setPointed(day)}>
              <rect class="bar-hit" x={i * (width + gap)} y="0" width={width + gap} height={height} />
              {bar > 0 && (
                <rect
                  class={`bar${day === pointed ? " pointed" : ""}`}
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
      <Inspector text={pointed === null ? null : dayText(pointed, byDay.get(pointed))} />
      <DayTable days={days.filter((day) => day.studyDay >= shown[0]!)} />
    </figure>
  );
}
