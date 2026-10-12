// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Lateness, LatenessRecall } from "@solid-memo/domain/memoryCurve";
import type { Recall } from "@solid-memo/domain/statistics";
import { useI18n } from "../i18n";
import { BarChart } from "./BarChart";
import { shareBar, useRecallShare } from "./shareBars";

/** The latenesses, with their words. */
const LATENESS_NAMES = {
  onTime: "statistics.lateOnTime",
  late1: "statistics.late1",
  late3: "statistics.late3",
  late7: "statistics.late7",
  late30: "statistics.late30",
  early: "statistics.lateEarly",
  unknown: "statistics.lateUnknown",
} as const satisfies Record<Lateness, string>;

/** The latenesses that are late. */
const LATE: readonly Lateness[] = ["late1", "late3", "late7", "late30"];

/**
 * The share of reviews remembered by how late they were done
 * (recallByLateness), a bar a lateness on a scale of 0 to 100%, each
 * share with the count of reviews it is of, however few; approximate,
 * as its note says. Under it, when there are reviews both on time and
 * late, the two side by side.
 */
export function LatenessChart({ lateness }: { lateness: readonly LatenessRecall[] }) {
  const { t } = useI18n();
  const share = useRecallShare();
  const name = (one: Lateness) => t(LATENESS_NAMES[one]);
  const onTime = lateness.find((one) => one.lateness === "onTime")!.recall;
  const late = lateness
    .filter((one) => LATE.includes(one.lateness))
    .reduce<Recall>(
      (sum, { recall }) => ({
        reviews: sum.reviews + recall.reviews,
        recalled: sum.recalled + recall.recalled,
      }),
      { reviews: 0, recalled: 0 },
    );
  return (
    <BarChart
      caption={t("statistics.lateness")}
      label={t("statistics.latenessLabel")}
      bars={lateness.map((one) => ({
        key: one.lateness,
        values: [shareBar(one.recall)],
        text: t("statistics.shareText", { range: name(one.lateness), share: share(one.recall) }),
      }))}
      max={100}
      prompt={t("statistics.pointAtShare")}
    >
      <p class="chart-note hint">{t("statistics.latenessNote")}</p>
      {onTime.reviews > 0 && late.reviews > 0 && (
        <p>{t("statistics.onTimePays", { onTime: share(onTime), late: share(late) })}</p>
      )}
      <details class="chart-table">
        <summary>{t("statistics.showTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("statistics.latenessColumn")}</th>
              <th scope="col">{t("statistics.recall")}</th>
            </tr>
          </thead>
          <tbody>
            {lateness.map((one) => (
              <tr key={one.lateness}>
                <td>{name(one.lateness)}</td>
                <td>{share(one.recall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </BarChart>
  );
}
