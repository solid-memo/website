// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { shiftStudyDay } from "@solid-memo/domain/answer";
import { hasStudyTime, type StudyTime } from "@solid-memo/domain/studyTime";
import { useI18n } from "../i18n";
import { BarChart } from "./BarChart";
import { StatTile } from "./StatTiles";

/**
 * A stretch of time, always said to be about so much: in seconds while
 * it rounds to under a minute (at least one), in minutes while it rounds
 * to under an hour, beyond in hours to the tenth.
 */
export function useAboutTime() {
  const { t } = useI18n();
  return (ms: number) => {
    const seconds = Math.round(ms / 1000);
    const minutes = Math.round(ms / 60_000);
    return seconds < 60
      ? t("statistics.aboutSeconds", { count: Math.max(seconds, 1) })
      : minutes < 60
        ? t("statistics.aboutMinutes", { count: minutes })
        : t("statistics.aboutHours", { count: Math.round(ms / 360_000) / 10 });
  };
}

/**
 * About how long was studied over the range (estimateStudyTime), and on
 * a study day on average; how many sessions, and a study day's on
 * average; and the median time an answer took. Dashes while no time is
 * known: none recorded, and no session of two answers to estimate it
 * from.
 */
export function StudyTimeTiles({ time }: { time: StudyTime }) {
  const { t } = useI18n();
  const about = useAboutTime();
  const studyDays = time.days.length;
  const known = hasStudyTime(time);
  return (
    <div class="stat-tiles">
      <StatTile
        label={t("statistics.timeStudied")}
        value={known ? about(time.ms) : "–"}
        detail={
          known
            ? t("statistics.perStudyDay", { time: about(time.ms / studyDays) })
            : t("statistics.noTimeYet")
        }
      />
      <StatTile
        label={t("statistics.sessions")}
        value={String(time.sessions)}
        detail={t("statistics.sessionsPerDay", {
          count: Math.round((time.sessions / studyDays) * 10) / 10,
        })}
      />
      <StatTile
        label={t("statistics.timePerAnswer")}
        value={time.medianAnswerMs === null ? "–" : about(time.medianAnswerMs)}
      />
    </div>
  );
}

/**
 * Since when the answers' own times are counted, before which the time
 * is estimated (or how it is estimated, before any is recorded), and how
 * many of the range's answers since have no time and are left out.
 */
export function StudyTimeHint({ time }: { time: StudyTime }) {
  const { t, formatDate } = useI18n();
  if (time.recorded === null) return <p class="hint">{t("statistics.studyTimeHint")}</p>;
  return (
    <p class="hint">
      {t("statistics.studyTimeRecordedHint", { date: formatDate(time.recorded.since) })}
      {time.recorded.unknown > 0 &&
        ` ${t("statistics.timeUnknown", { count: time.recorded.unknown })}`}
    </p>
  );
}

/**
 * About how many minutes each of the last `count` study days up to today
 * took, as bars on one baseline, with each day's sessions; the same as a
 * table, newest first. A day that only carries on a session begun the
 * study day before says so, not that it held no session.
 */
export function StudyTimeChart({
  time,
  today,
  count = 30,
}: {
  time: StudyTime;
  today: string;
  count?: number;
}) {
  const { t, formatDate } = useI18n();
  const about = useAboutTime();
  const byDay = new Map(time.days.map((day) => [day.studyDay, day]));
  const shown = Array.from({ length: count }, (_, i) => shiftStudyDay(today, i - count + 1));
  return (
    <BarChart
      caption={t("statistics.timeByDay", { count })}
      label={t("statistics.timeByDayLabel", { count })}
      bars={shown.map((studyDay) => {
        const day = byDay.get(studyDay);
        return {
          key: studyDay,
          values: [day === undefined ? 0 : day.ms / 60_000],
          text:
            day === undefined
              ? t("statistics.timeDayNone", { date: formatDate(studyDay) })
              : day.sessions === 0
                ? t("statistics.timeDayContinued", {
                    date: formatDate(studyDay),
                    time: about(day.ms),
                  })
                : t("statistics.timeDayDetail", {
                    date: formatDate(studyDay),
                    time: about(day.ms),
                    sessions: t("statistics.sessionCount", { count: day.sessions }),
                  }),
        };
      })}
      prompt={t("statistics.pointAtDay")}
    >
      <details class="chart-table">
        <summary>{t("statistics.showTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("statistics.day")}</th>
              <th scope="col">{t("statistics.timeColumn")}</th>
              <th scope="col">{t("statistics.sessions")}</th>
              <th scope="col">{t("statistics.answers")}</th>
            </tr>
          </thead>
          <tbody>
            {time.days
              .filter((day) => day.studyDay >= shown[0]!)
              .reverse()
              .map((day) => (
                <tr key={day.studyDay}>
                  <td>{formatDate(day.studyDay)}</td>
                  <td>{about(day.ms)}</td>
                  <td>{day.sessions}</td>
                  <td>{day.answers}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </BarChart>
  );
}
