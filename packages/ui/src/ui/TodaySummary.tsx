import type { TodaySummary as Today } from "@solid-memo/domain/statistics";
import { useI18n } from "./i18n";
import { FlameIcon } from "./icons";

/** A word of praise that grows with the day's work. */
function useCheer() {
  const { t } = useI18n();
  return (answers: number) =>
    answers >= 50 ? t("today.cheer.many") : answers >= 10 ? t("today.cheer.some") : t("today.cheer.few");
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
 * then a word of praise and the day's numbers.
 */
export function TodaySummary({ today, statisticsHref }: { today: Today; statisticsHref: string }) {
  const { t, locale } = useI18n();
  const cheer = useCheer();
  const streakNote = useStreakNote();
  const percent = new Intl.NumberFormat(locale, { style: "percent" });
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
            t("today.remembered", { percent: percent.format(today.recalled / today.answers) }),
          ].join(" · ")}
          {" · "}
          <a href={statisticsHref}>{t("today.allStatistics")}</a>
        </p>
      </div>
    </aside>
  );
}
