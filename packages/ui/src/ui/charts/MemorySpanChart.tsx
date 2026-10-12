// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MemoryWeek } from "@solid-memo/domain/memoryCurve";
import { useI18n } from "../i18n";
import { LineChart } from "./LineChart";

/**
 * The median interval of the prompts at the end of each week
 * (memoryOverTime), in whole days, a gap where there was no prompt yet.
 * Approximate, as its note says. The weeks must not be empty.
 */
export function MemorySpanChart({ weeks }: { weeks: readonly MemoryWeek[] }) {
  const { t, formatDate } = useI18n();
  const values = weeks.map((week) =>
    week.medianInterval === null ? null : Math.round(week.medianInterval),
  );
  const span = (value: number | null) =>
    value === null ? "–" : t("statistics.dayCount", { count: value });
  return (
    <LineChart
      name="span-chart"
      caption={t("statistics.memorySpan")}
      label={t("statistics.memorySpanLabel")}
      note={t("statistics.memorySpanNote")}
      keys={weeks.map((week) => week.week)}
      series={[{ name: "span", label: t("statistics.medianInterval"), values }]}
      max={Math.max(1, ...values.map((value) => value ?? 0))}
      formatValue={(value) => t("statistics.dayCount", { count: value })}
      formatKey={formatDate}
      textAt={(i) =>
        t("statistics.memorySpanDetail", {
          date: formatDate(weeks[i]!.week),
          span: span(values[i]!),
        })
      }
      prompt={t("statistics.pointAtWeek")}
      table={
        <details class="chart-table">
          <summary>{t("statistics.showTable")}</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("statistics.weekOf")}</th>
                <th scope="col">{t("statistics.medianInterval")}</th>
              </tr>
            </thead>
            <tbody>
              {weeks
                .map((week, i) => (
                  <tr key={week.week}>
                    <td>{formatDate(week.week)}</td>
                    <td>{span(values[i]!)}</td>
                  </tr>
                ))
                .reverse()}
            </tbody>
          </table>
        </details>
      }
    />
  );
}
