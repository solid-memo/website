// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { TodaySummary as Today } from "@solid-memo/domain/statistics";
import { useI18n } from "./i18n";
import { FlameIcon } from "./icons";

/** A word of praise that grows with the day's work. */
function useCheer() {
  const { t } = useI18n();
  return (answers: number) =>
    answers >= 50
      ? t("today.cheer.many")
      : answers >= 10
        ? t("today.cheer.some")
        : t("today.cheer.few");
}

/** Where the streak stands: a first day, a record, or the record to beat. */
function useStreakNote() {
  const { t } = useI18n();
  return ({ streak, longestStreak }: Today) =>
    streak === 1
      ? t("today.streakFirstDay")
      : streak === longestStreak
        ? t("today.streakRecord")
        : t("today.streakToBeat", { count: longestStreak });
}

/**
 * What today's study came to, in a slim strip above the deck list a
 * session ends on. The streak leads, as what keeps a learner coming back;
 * then a word of praise and the day's numbers: the share of today's
 * reviews remembered comes with how many there were, and only once there
 * is one (a first answer, a card back in the session or a course answer
 * is no review); how many cards are left to study today, once every
 * deck's count is known (`left`), and about how many minutes they will
 * take, once that is known too (`minutesLeft`); then the week's answers so far, and
 * how they compare with the same days of last week, when it had any.
 */
export function TodaySummary({
  today,
  left,
  minutesLeft,
  statisticsHref,
}: {
  today: Today;
  /** The cards still to study today in every deck, due and new; none while unknown. */
  left?: number;
  /** About how many minutes the cards left will take (expectedTimeToday); none while unknown. */
  minutesLeft?: number;
  statisticsHref: string;
}) {
  const { t, formatPercent, formatChange } = useI18n();
  const cheer = useCheer();
  const streakNote = useStreakNote();
  const { reviews, recalled } = today.recall;
  const { answers: thisWeek, previous } = today.week;
  return (
    <aside class="today-strip" aria-label={t("today.heading")}>
      <FlameIcon />
      <div>
        <p>
          <strong class="streak-count">{t("today.streakCount", { count: today.streak })}</strong>{" "}
          <span class="streak-note">{streakNote(today)}</span>
        </p>
        <p class="today-numbers">
          {cheer(today.answers)}{" "}
          {[
            t("today.answers", { count: today.answers }),
            t("today.introduced", { count: today.introduced }),
            ...(reviews === 0
              ? []
              : [
                  t("today.remembered", {
                    percent: formatPercent(recalled / reviews),
                    count: reviews,
                  }),
                ]),
            ...(left === undefined || left === 0 ? [] : [t("today.stillDue", { count: left })]),
            ...(left === undefined || left === 0 || minutesLeft === undefined
              ? []
              : [t("today.timeLeft", { count: minutesLeft })]),
            previous === 0
              ? t("today.week", { count: thisWeek })
              : t("today.weekChange", {
                  count: thisWeek,
                  change: formatChange((thisWeek - previous) / previous),
                }),
          ].join(" · ")}
          {" · "}
          <a href={statisticsHref}>{t("today.allStatistics")}</a>
        </p>
      </div>
    </aside>
  );
}
