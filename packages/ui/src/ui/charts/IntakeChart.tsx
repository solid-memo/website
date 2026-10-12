// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { WeekLoad } from "@solid-memo/domain/studyPatterns";
import { useI18n } from "../i18n";
import { BarChart } from "./BarChart";

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
