// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { IntervalRecall } from "@solid-memo/domain/memoryCurve";
import { useI18n } from "../i18n";
import { BarChart } from "./BarChart";
import { useBinRanges } from "./Histogram";
import { shareBar, useRecallShare } from "./shareBars";

/**
 * The share of reviews remembered at each span of intervals
 * (recallByInterval), a bar each on a scale of 0 to 100%, each share
 * with the count of reviews it is of, however few; a span without
 * reviews has no bar. The table gives every span.
 */
export function IntervalRecallChart({ bins }: { bins: readonly IntervalRecall[] }) {
  const { t } = useI18n();
  const range = useBinRanges().interval;
  const share = useRecallShare();
  return (
    <BarChart
      caption={t("statistics.recallByInterval")}
      label={t("statistics.recallByIntervalLabel")}
      bars={bins.map((bin) => ({
        key: String(bin.from),
        values: [shareBar(bin.recall)],
        text: t("statistics.shareText", { range: range(bin), share: share(bin.recall) }),
      }))}
      max={100}
      prompt={t("statistics.pointAtShare")}
    >
      <p class="chart-note hint">{t("statistics.recallByIntervalNote")}</p>
      <details class="chart-table">
        <summary>{t("statistics.showTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("statistics.interval")}</th>
              <th scope="col">{t("statistics.recall")}</th>
            </tr>
          </thead>
          <tbody>
            {bins.map((bin) => (
              <tr key={bin.from}>
                <td>{range(bin)}</td>
                <td>{share(bin.recall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </BarChart>
  );
}
