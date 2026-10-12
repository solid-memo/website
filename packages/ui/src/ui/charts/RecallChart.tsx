// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { shiftStudyDay } from "@solid-memo/domain/answer";
import type { WeekRetention } from "@solid-memo/domain/memoryCurve";
import type { MonthRetention, Recall, Retention } from "@solid-memo/domain/statistics";
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
 * How well reviews were remembered, month by month (monthlyRetention) or,
 * given `weeks` instead, week by week (weeklyRetention), on a fixed
 * scale of 0 to 100%: young cards dashed, mature cards solid. A month or
 * week without reviews of a kind, or without any, is a gap in that line,
 * not a 0. The months' table adds each month's first tries. The months
 * or weeks must not be empty.
 */
export function RecallChart(
  props: { months: readonly MonthRetention[] } | { weeks: readonly WeekRetention[] },
) {
  const { t, locale, formatDate, formatPercent } = useI18n();
  const monthly = "months" in props;
  const periods: readonly { key: string; retention: Retention; firstTry?: FirstTry }[] =
    "months" in props
      ? props.months.map(({ month, retention, firstTry }) => ({ key: month, retention, firstTry }))
      : props.weeks.map(({ week, retention }) => ({ key: week, retention }));
  const formatMonth = (month: string) =>
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  const formatKey = monthly ? formatMonth : formatDate;
  const byKey = new Map(periods.map((period) => [period.key, period.retention]));
  const keys = [periods[0]!.key];
  while (keys.at(-1)! < periods.at(-1)!.key)
    keys.push(monthly ? nextMonth(keys.at(-1)!) : shiftStudyDay(keys.at(-1)!, 7));
  const none: Recall = { reviews: 0, recalled: 0 };
  const retentionAt = (key: string) => byKey.get(key) ?? { young: none, mature: none };
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
    keys.map((key) => {
      const recall = retentionAt(key)[kind];
      return recall.reviews === 0 ? null : (recall.recalled / recall.reviews) * 100;
    });
  const detail = (key: string) => {
    const shares = { young: share(retentionAt(key).young), mature: share(retentionAt(key).mature) };
    return monthly
      ? t("statistics.recallDetail", { month: formatMonth(key), ...shares })
      : t("statistics.recallWeekDetail", { date: formatDate(key), ...shares });
  };
  return (
    <LineChart
      name="recall-chart"
      caption={monthly ? t("statistics.recallByMonth") : t("statistics.recallByWeek")}
      label={monthly ? t("statistics.recallLabel") : t("statistics.recallWeekLabel")}
      note={monthly ? t("statistics.recallNote") : t("statistics.recallWeekNote")}
      keys={keys}
      series={[
        { name: "young", label: t("statistics.youngShort"), values: line("young") },
        { name: "mature", label: t("statistics.matureShort"), values: line("mature") },
      ]}
      max={100}
      formatValue={(value) => formatPercent(value / 100)}
      formatKey={formatKey}
      textAt={(i) => detail(keys[i]!)}
      prompt={monthly ? t("statistics.pointAtMonth") : t("statistics.pointAtWeek")}
      table={
        <details class="chart-table">
          <summary>{t("statistics.showTable")}</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">{monthly ? t("statistics.month") : t("statistics.weekOf")}</th>
                <th scope="col">{t("statistics.youngShort")}</th>
                <th scope="col">{t("statistics.matureShort")}</th>
                {monthly && <th scope="col">{t("statistics.firstTry")}</th>}
              </tr>
            </thead>
            <tbody>
              {[...periods].reverse().map((period) => (
                <tr key={period.key}>
                  <td>{formatKey(period.key)}</td>
                  <td>{share(period.retention.young)}</td>
                  <td>{share(period.retention.mature)}</td>
                  {period.firstTry !== undefined && <td>{firstTryShare(period.firstTry)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      }
    />
  );
}
