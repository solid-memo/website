// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DayActivity } from "@solid-memo/domain/statistics";
import { useI18n } from "../i18n";

/** What a day held, in words. */
export function useDayText() {
  const { t, formatDate } = useI18n();
  return (studyDay: string, day: DayActivity | undefined) =>
    day === undefined
      ? t("statistics.dayNothing", { date: formatDate(studyDay) })
      : t("statistics.dayDetail", {
          date: formatDate(studyDay),
          answers: t("statistics.answerCount", { count: day.answers }),
          introduced: t("statistics.newCount", { count: day.introduced }),
          remembered: t("statistics.rememberedCount", { count: day.reviews - day.lapses }),
          lapses: t("statistics.lapseCount", { count: day.lapses }),
          repeats: t("statistics.repeatCount", { count: day.repeats }),
        });
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
            <th scope="col">{t("statistics.rememberedColumn")}</th>
            <th scope="col">{t("statistics.lapses")}</th>
            <th scope="col">{t("statistics.repeats")}</th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((day) => (
            <tr key={day.studyDay}>
              <td>{formatDate(day.studyDay)}</td>
              <td>{day.answers}</td>
              <td>{day.introduced}</td>
              <td>{day.reviews - day.lapses}</td>
              <td>{day.lapses}</td>
              <td>{day.repeats}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
