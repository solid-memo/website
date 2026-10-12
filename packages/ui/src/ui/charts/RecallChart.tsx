// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MonthRetention, Recall } from "@solid-memo/domain/statistics";
import type { FirstTry } from "@solid-memo/domain/studyPatterns";
import { useI18n } from "../i18n";
import { LineChart } from "./LineChart";

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
