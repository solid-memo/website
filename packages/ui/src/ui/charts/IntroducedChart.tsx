// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { CHART_YEARS, shiftStudyDay } from "@solid-memo/domain/answer";
import { introducedOverTime, type DayActivity } from "@solid-memo/domain/statistics";
import { daysBetween } from "@solid-memo/domain/studyPatterns";
import { useI18n } from "../i18n";
import { LineChart } from "./LineChart";

/**
 * The running total of cards introduced (introducedOverTime), a point a
 * study day from the first with answers to today, the total carried over
 * days of nothing new. The days must not be empty. An answer's study day
 * is kept as it was when given, so a later day boundary or another time
 * zone can leave answers after today; the line then runs on to the last.
 * Of more than CHART_YEARS' worth of days it shows the last.
 */
export function IntroducedChart({ days, today }: { days: readonly DayActivity[]; today: string }) {
  const { t, locale, formatDate } = useI18n();
  const number = new Intl.NumberFormat(locale);
  const totals = introducedOverTime(days);
  const byDay = new Map(totals.map((total) => [total.studyDay, total.introduced]));
  const lastDay = totals.at(-1)!.studyDay > today ? totals.at(-1)!.studyDay : today;
  // A known count of days, at most CHART_YEARS' worth, the total carried in from the days left out.
  const count = Math.min(daysBetween(totals[0]!.studyDay, lastDay) + 1, CHART_YEARS * 366);
  const keys = Array.from({ length: count }, (_, i) => shiftStudyDay(lastDay, i - count + 1));
  let next = 0;
  let total = 0;
  const values = keys.map((day) => {
    while (next < totals.length && totals[next]!.studyDay <= day)
      total = totals[next++]!.introduced;
    return total;
  });
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
