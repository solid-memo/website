// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useI18n } from "../i18n";
import { BarChart } from "./BarChart";

/**
 * The answers given in each hour of the day (answersByHour), folded away
 * until asked for: in this device's time zone, which a note says, and
 * from the hour the study day begins, so one study day reads as one run.
 * Every sixth hour is named under the bars, at the start of its bar;
 * the table gives every hour and the total.
 */
export function HourChart({
  hours,
  dayBoundaryHour,
}: {
  /** The answers of each hour, midnight's first. */
  hours: readonly number[];
  dayBoundaryHour: number;
}) {
  const { t, locale } = useI18n();
  const hourFormat = new Intl.DateTimeFormat(locale, { hour: "numeric" });
  // An hour of a day of this device's time zone, as this language writes it.
  const nameOf = (hour: number) => hourFormat.format(new Date(2024, 0, 1, hour));
  const order = Array.from({ length: 24 }, (_, i) => (dayBoundaryHour + i) % 24);
  return (
    <details class="chart-fold">
      <summary>{t("statistics.showHours")}</summary>
      <BarChart
        caption={t("statistics.hours")}
        label={t("statistics.hoursLabel")}
        bars={order.map((hour) => ({
          key: String(hour),
          values: [hours[hour]!],
          text: t("statistics.hourDetail", {
            hour: nameOf(hour),
            answers: t("statistics.answerCount", { count: hours[hour]! }),
          }),
        }))}
        // Four ticks, each centred over six bars: on the start of the fourth, the hour it names.
        ticks={[3, 9, 15, 21].map((i) => nameOf(order[i]!))}
        prompt={t("statistics.pointAtHour")}
      >
        <p class="chart-note hint">{t("statistics.hoursNote")}</p>
        <details class="chart-table">
          <summary>{t("statistics.showTable")}</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("statistics.hour")}</th>
                <th scope="col">{t("statistics.answers")}</th>
              </tr>
            </thead>
            <tbody>
              {order.map((hour) => (
                <tr key={hour}>
                  <td>{nameOf(hour)}</td>
                  <td>{hours[hour]}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t("statistics.total")}</th>
                <td>{hours.reduce((sum, count) => sum + count, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </details>
      </BarChart>
    </details>
  );
}
