// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { shiftStudyDay } from "@solid-memo/domain/answer";
import type { DayActivity } from "@solid-memo/domain/statistics";
import { useI18n } from "../i18n";
import { BarChart } from "./BarChart";
import { DayTable, useDayText } from "./DayTable";

/** The parts of a day DayHeldBars stacks, bottom first, with their words and steps of the green. */
const DAY_PARTS = [
  ["remembered", "statistics.rememberedColumn", 4],
  ["introduced", "statistics.introduced", 3],
  ["lapses", "statistics.lapses", 2],
  ["repeats", "statistics.repeats", 1],
] as const;

/**
 * What each of the last `count` study days up to today held, as stacked
 * bars on one baseline: reviews remembered, new cards, lapses and
 * repeats. A course answer to a card seen before is none of them, so a
 * day's bar can fall short of its answers, which the table gives.
 */
export function DayHeldBars({
  days,
  today,
  count = 30,
}: {
  days: readonly DayActivity[];
  today: string;
  count?: number;
}) {
  const { t } = useI18n();
  const dayText = useDayText();
  const byDay = new Map(days.map((day) => [day.studyDay, day]));
  const shown = Array.from({ length: count }, (_, i) => shiftStudyDay(today, i - count + 1));
  const partsOf = (day: DayActivity | undefined) =>
    day === undefined
      ? [0, 0, 0, 0]
      : [day.reviews - day.lapses, day.introduced, day.lapses, day.repeats];
  return (
    <BarChart
      caption={t("statistics.dayHeld", { count })}
      label={t("statistics.dayHeldLabel", { count })}
      bars={shown.map((day) => ({
        key: day,
        values: partsOf(byDay.get(day)),
        text: dayText(day, byDay.get(day)),
      }))}
      series={DAY_PARTS.map(([, key, step]) => ({ label: t(key), step }))}
      prompt={t("statistics.pointAtDay")}
    >
      <p class="chart-note hint">{t("statistics.dayHeldNote")}</p>
      <DayTable days={days.filter((day) => day.studyDay >= shown[0]!)} />
    </BarChart>
  );
}
