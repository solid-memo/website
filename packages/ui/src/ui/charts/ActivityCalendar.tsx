// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { shiftStudyDay } from "@solid-memo/domain/answer";
import type { DayActivity } from "@solid-memo/domain/statistics";
import { CALENDAR_WEEKS, weekdayOf } from "@solid-memo/domain/studyPatterns";
import { useI18n } from "../i18n";
import { DayTable, useDayText } from "./DayTable";
import { Inspector } from "./Inspector";

/** The step of the green a day's answers get: 0 for none, then 1 to 4 by share of the busiest day. */
export function levelOf(answers: number, most: number): number {
  return answers === 0 ? 0 : Math.max(1, Math.ceil((answers / most) * 4));
}

/**
 * The last `weeks` weeks, a column a week from Monday down to Sunday, a
 * cell a day in the step of green its answers give it; days after today
 * are left out. The columns share the figure's width, so a year fills it.
 */
export function ActivityCalendar({
  days,
  today,
  weeks = CALENDAR_WEEKS,
}: {
  days: readonly DayActivity[];
  today: string;
  weeks?: number;
}) {
  const { t } = useI18n();
  const dayText = useDayText();
  const [pointed, setPointed] = useState<string | null>(null);
  const byDay = new Map(days.map((day) => [day.studyDay, day]));
  const first = shiftStudyDay(today, -weekdayOf(today) - (weeks - 1) * 7);
  const shown = Array.from({ length: weeks * 7 }, (_, i) => shiftStudyDay(first, i)).filter(
    (day) => day <= today,
  );
  const most = Math.max(1, ...shown.map((day) => byDay.get(day)?.answers ?? 0));
  return (
    <figure class="activity-calendar">
      <figcaption>{t("statistics.activity", { weeks })}</figcaption>
      <div
        class="calendar-grid"
        role="img"
        aria-label={t("statistics.activityLabel", { weeks })}
        style={{ "--weeks": weeks }}
      >
        {shown.map((day, i) => (
          <span
            key={day}
            class={`calendar-day level-${levelOf(byDay.get(day)?.answers ?? 0, most)}${day === pointed ? " pointed" : ""}`}
            style={{ gridRow: weekdayOf(day) + 1, gridColumn: Math.floor(i / 7) + 1 }}
            data-day={day}
            onPointerEnter={() => setPointed(day)}
            onClick={() => setPointed(day)}
          />
        ))}
      </div>
      <div class="calendar-legend hint" aria-hidden="true">
        {t("statistics.less")}
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} class={`calendar-day level-${level}`} />
        ))}
        {t("statistics.more")}
      </div>
      <Inspector
        text={pointed === null ? null : dayText(pointed, byDay.get(pointed))}
        prompt={t("statistics.pointAtDay")}
      />
      <DayTable days={days.filter((day) => day.studyDay >= first)} />
    </figure>
  );
}
