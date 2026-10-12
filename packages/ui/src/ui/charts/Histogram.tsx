// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Bin } from "@solid-memo/domain/scheduleInsight";
import { useI18n } from "../i18n";
import { BarChart } from "./BarChart";

/** The words a histogram's bins (scheduleInsight.ts) take: intervals in days, eases to a tenth. */
export function useBinRanges() {
  const { t } = useI18n();
  return {
    interval: (bin: Bin) =>
      bin.to === undefined
        ? t("statistics.intervalFrom", { from: bin.from })
        : bin.to - bin.from === 1
          ? t("statistics.dayCount", { count: bin.from })
          : t("statistics.intervalRange", { from: bin.from, to: bin.to - 1 }),
    ease: (bin: Bin) =>
      bin.to === undefined
        ? t("statistics.easeFrom", { from: bin.from.toFixed(1) })
        : t("statistics.easeRange", { from: bin.from.toFixed(1), to: bin.to.toFixed(1) }),
  };
}

/**
 * A histogram's bins as bars, each named by `range`, a note under them
 * when given, then the same as a table.
 */
export function Histogram({
  caption,
  label,
  heading,
  bins,
  range,
  note,
}: {
  caption: string;
  label: string;
  /** The table's first column: what the bins spread. */
  heading: string;
  bins: readonly Bin[];
  range: (bin: Bin) => string;
  note?: string;
}) {
  const { t } = useI18n();
  return (
    <BarChart
      caption={caption}
      label={label}
      bars={bins.map((bin) => ({
        key: String(bin.from),
        values: [bin.count],
        text: t("statistics.binText", { range: range(bin), count: bin.count }),
      }))}
      prompt={t("statistics.pointAtBar")}
    >
      {note !== undefined && <p class="chart-note hint">{note}</p>}
      <details class="chart-table">
        <summary>{t("statistics.showTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{heading}</th>
              <th scope="col">{t("statistics.prompts")}</th>
            </tr>
          </thead>
          <tbody>
            {bins.map((bin) => (
              <tr key={bin.from}>
                <td>{range(bin)}</td>
                <td>{bin.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </BarChart>
  );
}

/**
 * How the studied prompts' intervals are spread, with why some bins stay
 * nearly empty, and, folded away until opened, how their eases are.
 */
export function SpreadCharts({
  intervals,
  eases,
}: {
  intervals: readonly Bin[];
  eases: readonly Bin[];
}) {
  const { t } = useI18n();
  const ranges = useBinRanges();
  return (
    <>
      <Histogram
        caption={t("statistics.intervals")}
        label={t("statistics.intervalsLabel")}
        heading={t("statistics.interval")}
        bins={intervals}
        range={ranges.interval}
        note={t("statistics.intervalsNote")}
      />
      <details class="chart-fold">
        <summary>{t("statistics.showEases")}</summary>
        <Histogram
          caption={t("statistics.eases")}
          label={t("statistics.easesLabel")}
          heading={t("statistics.ease")}
          bins={eases}
          range={ranges.ease}
          note={t("statistics.easesNote")}
        />
      </details>
    </>
  );
}
