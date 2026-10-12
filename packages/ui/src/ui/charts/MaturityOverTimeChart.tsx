// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MemoryWeek } from "@solid-memo/domain/memoryCurve";
import { useI18n } from "../i18n";
import { LineChart } from "./LineChart";

/**
 * How many prompts were young and how many mature at the end of each
 * week (memoryOverTime), young dashed and mature solid, on a scale up to
 * the most of either; the table adds those relearning. Approximate, as
 * its note says. The weeks must not be empty.
 */
export function MaturityOverTimeChart({ weeks }: { weeks: readonly MemoryWeek[] }) {
  const { t, locale, formatDate } = useI18n();
  const number = new Intl.NumberFormat(locale);
  const keys = weeks.map((week) => week.week);
  const detail = (week: MemoryWeek) =>
    t("statistics.maturityWeekDetail", {
      date: formatDate(week.week),
      young: t("statistics.maturityYoung", { count: week.young }),
      mature: t("statistics.maturityMature", { count: week.mature }),
      relearning: t("statistics.maturityRelearning", { count: week.relearning }),
    });
  return (
    <LineChart
      name="maturity-chart"
      caption={t("statistics.maturityOverTime")}
      label={t("statistics.maturityOverTimeLabel")}
      note={t("statistics.maturityOverTimeNote")}
      keys={keys}
      series={[
        {
          name: "young",
          label: t("statistics.youngShort"),
          values: weeks.map((week) => week.young),
        },
        {
          name: "mature",
          label: t("statistics.matureShort"),
          values: weeks.map((week) => week.mature),
        },
      ]}
      max={Math.max(1, ...weeks.map((week) => Math.max(week.young, week.mature)))}
      formatValue={(value) => number.format(value)}
      formatKey={formatDate}
      textAt={(i) => detail(weeks[i]!)}
      prompt={t("statistics.pointAtWeek")}
      table={
        <details class="chart-table">
          <summary>{t("statistics.showTable")}</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("statistics.weekOf")}</th>
                <th scope="col">{t("statistics.youngShort")}</th>
                <th scope="col">{t("statistics.matureShort")}</th>
                <th scope="col">{t("statistics.relearningShort")}</th>
              </tr>
            </thead>
            <tbody>
              {[...weeks].reverse().map((week) => (
                <tr key={week.week}>
                  <td>{formatDate(week.week)}</td>
                  <td>{week.young}</td>
                  <td>{week.mature}</td>
                  <td>{week.relearning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      }
    />
  );
}
