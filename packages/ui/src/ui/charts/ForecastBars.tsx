// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ForecastDay } from "@solid-memo/domain/scheduleInsight";
import { useI18n } from "../i18n";
import { BarChart } from "./BarChart";

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
