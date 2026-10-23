// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { StatisticsReport } from "@solid-memo/application/statistics";
import type { Deck } from "@solid-memo/domain/deck";
import { daysBetween, RECENT_DAYS } from "@solid-memo/domain/studyPatterns";
import { ActivityCalendar } from "./charts/ActivityCalendar";
import { DayHeldBars } from "./charts/DayHeldBars";
import { GradeBars } from "./charts/GradeBars";
import { HourChart } from "./charts/HourChart";
import { IntakeChart } from "./charts/IntakeChart";
import { IntervalRecallChart } from "./charts/IntervalRecallChart";
import { IntroducedChart } from "./charts/IntroducedChart";
import { LatenessChart } from "./charts/LatenessChart";
import { MaturityOverTimeChart } from "./charts/MaturityOverTimeChart";
import { MemorySpanChart } from "./charts/MemorySpanChart";
import { RecallChart } from "./charts/RecallChart";
import {
  CoverageNote,
  FirstTryTile,
  onlyCourseAnswers,
  PeriodTiles,
  QuizTile,
  RecallTile,
  StatTile,
  TimeToMatureTile,
} from "./charts/StatTiles";
import { hasStudyTime } from "@solid-memo/domain/studyTime";
import {
  StudyTimeChart,
  StudyTimeHint,
  StudyTimeTiles,
  useAboutTime,
} from "./charts/StudyTimeChart";
import { WeekdayChart } from "./charts/WeekdayChart";
import { useI18n } from "./i18n";
import { ByDeckStatistics } from "./ByDeckStatistics";

/**
 * The statistics' tabs, each of the answers of the range read
 * (StatisticsReport): of every deck, or of one deck alone (`deck`).
 * The cards' tab is read apart (CardProgressContainer), so it is not
 * here.
 */

/**
 * The overview: the headline tiles (answers, study days, cards, the
 * streaks, the days studied of late, and the cards known now, once
 * read), the whole log's growth and time studied when the range is the
 * whole log, the activity calendar, and, of every deck, each deck's
 * figures. The streaks, the days of late and the calendar run up to
 * today whatever the range (StatisticsReport.recentDays). A deck since
 * removed is named as such; where the log begins inside the range, a
 * note says since when.
 */
export function OverviewSection({
  statistics,
  decks,
  allTime,
  cardsYouKnow,
}: {
  statistics: StatisticsReport;
  /** The instance's decks, for the figures by deck; none for one deck's statistics, which have none. */
  decks?: readonly Deck[];
  /** Whether the range is the whole log. */
  allTime: boolean;
  /** The prompts mature now, once where the cards stand is read. */
  cardsYouKnow?: number;
}) {
  const { t, formatPercent, formatDate } = useI18n();
  const about = useAboutTime();
  const { totals, streaks, prompts, studyTime } = statistics;
  return (
    <>
      <CoverageNote coverage={statistics.coverage} />
      <div class="stat-tiles">
        <StatTile label={t("statistics.answers")} value={String(totals.answers)} />
        <StatTile label={t("statistics.studyDays")} value={String(totals.studyDays)} />
        <StatTile label={t("statistics.cards")} value={String(totals.cards)} />
        {cardsYouKnow !== undefined && (
          <StatTile
            label={t("statistics.cardsYouKnow")}
            value={String(cardsYouKnow)}
            detail={t("statistics.cardsYouKnowDetail")}
          />
        )}
        <StatTile
          label={t("statistics.currentStreak")}
          value={t("statistics.dayCount", { count: streaks.current })}
        />
        <StatTile
          label={t("statistics.longestStreak")}
          value={t("statistics.dayCount", { count: streaks.longest })}
        />
        <StatTile
          label={t("statistics.recentDays", { count: RECENT_DAYS })}
          value={t("statistics.recentDaysValue", {
            studied: statistics.recentStudyDays,
            count: RECENT_DAYS,
          })}
          detail={formatPercent(statistics.recentStudyDays / RECENT_DAYS)}
        />
      </div>
      {allTime && (
        <>
          <h3>{t("statistics.allTime")}</h3>
          <p class="hint">{t("statistics.allTimeHint")}</p>
          <div class="stat-tiles">
            <StatTile
              label={t("statistics.promptsIntroduced")}
              value={String(prompts.introduced)}
              detail={t("statistics.promptsDetail")}
            />
            <StatTile
              label={t("statistics.promptsMatured")}
              value={String(prompts.matured)}
              detail={t("statistics.promptsDetail")}
            />
            <StatTile
              label={t("statistics.timeStudied")}
              value={hasStudyTime(studyTime) ? about(studyTime.ms) : "–"}
              detail={
                studyTime.recorded === null
                  ? t("statistics.timeEstimated")
                  : t("statistics.timeRecordedSince", {
                      date: formatDate(studyTime.recorded.since),
                    })
              }
            />
          </div>
        </>
      )}
      <ActivityCalendar days={statistics.recentDays} today={statistics.today} />
      {decks !== undefined && <ByDeckStatistics decks={decks} statistics={statistics.decks} />}
    </>
  );
}

/**
 * Recall is shown by week, rather than by month, while its first week
 * (from Monday) began fewer than this many days ago: 14 weeks, so that
 * a range of 90 days is shown by week whatever weekday it starts on.
 */
const RECALL_BY_WEEK_DAYS = 14 * 7;

/**
 * When and how much: what each recent day held, how the weekdays are
 * studied, this week and month beside the last (these whatever the
 * range), then about how long the range's answers took (recorded, or
 * estimated before times were recorded), with the minutes of each
 * recent day (none while no time is known; since when times are
 * recorded, the note says), and, folded away, the answers by hour of
 * the day; then progress: the cards introduced over the range, where
 * the cards stood and their median interval week by week, how many were
 * remembered the first time (not for course answers alone) and how long
 * cards took to grow mature, and the new cards beside the reviews by
 * week. Where the log begins inside the range, a note says since when.
 */
export function ActivitySection({ statistics }: { statistics: StatisticsReport }) {
  const { t } = useI18n();
  return (
    <>
      <CoverageNote coverage={statistics.coverage} />
      <DayHeldBars days={statistics.recentDays} today={statistics.today} />
      <WeekdayChart weekdays={statistics.weekdays} />
      <h3>{t("statistics.thisWeek")}</h3>
      <PeriodTiles period="week" figures={statistics.week} />
      <h3>{t("statistics.thisMonth")}</h3>
      <PeriodTiles period="month" figures={statistics.month} />
      <h3>{t("statistics.studyTime")}</h3>
      <StudyTimeHint time={statistics.studyTime} />
      {statistics.studyTime.answers > 0 && (
        <>
          <StudyTimeTiles time={statistics.studyTime} />
          {hasStudyTime(statistics.studyTime) && (
            <StudyTimeChart time={statistics.studyTime} today={statistics.today} />
          )}
        </>
      )}
      <HourChart hours={statistics.hours} dayBoundaryHour={statistics.dayBoundaryHour} />
      <h3>{t("statistics.progress")}</h3>
      <IntroducedChart days={statistics.days} today={statistics.today} />
      <MaturityOverTimeChart weeks={statistics.memory} />
      <MemorySpanChart weeks={statistics.memory} />
      <div class="stat-tiles">
        {!onlyCourseAnswers(statistics) && <FirstTryTile firstTry={statistics.firstTry} />}
        <TimeToMatureTile time={statistics.timeToMature} />
      </div>
      <IntakeChart weeks={statistics.intake} />
    </>
  );
}

/**
 * How well reviews were remembered, young and mature apart (and, of one
 * deck with reviews both ways, each way), the answer buttons pressed,
 * once there are reviews recall week by week while they fall in the
 * last RECALL_BY_WEEK_DAYS (month by month beyond), and recall by interval
 * and by how late reviews were, every span and lateness with its count
 * (none before any review); left out when there are only course answers. Then how course
 * questions were answered, when there are any. Where the log begins
 * inside the range, a note says since when.
 */
export function MemorySection({
  statistics,
  byDirection,
}: {
  statistics: StatisticsReport;
  /** Whether to give recall each way, as one deck's statistics do. */
  byDirection: boolean;
}) {
  const { t, directionLabel } = useI18n();
  const { retention, quiz, weeks } = statistics;
  return (
    <>
      <CoverageNote coverage={statistics.coverage} />
      {!onlyCourseAnswers(statistics) && (
        <>
          <h3>{t("statistics.remembered")}</h3>
          <p class="hint">{t("statistics.rememberedHint")}</p>
          <div class="stat-tiles">
            <RecallTile label={t("statistics.young")} recall={retention.young} />
            <RecallTile label={t("statistics.mature")} recall={retention.mature} />
            {byDirection &&
              statistics.directions.length > 1 &&
              statistics.directions.map(({ direction, recall }) => (
                <RecallTile key={direction} label={directionLabel(direction)} recall={recall} />
              ))}
          </div>
          <GradeBars buttons={statistics.buttons} />
          {retention.young.reviews + retention.mature.reviews > 0 &&
            (daysBetween(weeks[0]!.week, statistics.today) < RECALL_BY_WEEK_DAYS ? (
              <RecallChart weeks={weeks} />
            ) : (
              <RecallChart months={statistics.months} />
            ))}
          <IntervalRecallChart bins={statistics.intervals} />
          <LatenessChart lateness={statistics.lateness} />
        </>
      )}
      {quiz.answers > 0 && (
        <>
          <h3>{t("statistics.inCourses")}</h3>
          <p class="hint">{t("statistics.quizHint")}</p>
          <div class="stat-tiles">
            <QuizTile quiz={quiz} />
          </div>
        </>
      )}
    </>
  );
}
