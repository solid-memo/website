// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { WeekdayRhythm } from "@solid-memo/domain/studyPatterns";
import { useI18n } from "../i18n";
import { BarChart } from "./BarChart";

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
