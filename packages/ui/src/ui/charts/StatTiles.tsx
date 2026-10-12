// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId } from "preact/hooks";
import type { TimeToMature } from "@solid-memo/domain/memoryCurve";
import type { Quiz, Recall } from "@solid-memo/domain/statistics";
import type { FirstTry, PeriodToDate } from "@solid-memo/domain/studyPatterns";
import { useI18n } from "../i18n";

/** A headline number with what it counts, named by that label as a group. */
export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  const labelId = useId();
  return (
    <div class="stat-tile" role="group" aria-labelledby={labelId}>
      <span class="stat-label" id={labelId}>
        {label}
      </span>
      <strong class="stat-value">{value}</strong>
      {detail !== undefined && <span class="stat-detail hint">{detail}</span>}
    </div>
  );
}

/**
 * How well reviews were remembered, as a share, with the count of reviews
 * it is of, however few; a dash while there are none.
 */
export function RecallTile({ label, recall }: { label: string; recall: Recall }) {
  const { t, formatPercent } = useI18n();
  return recall.reviews === 0 ? (
    <StatTile label={label} value="–" detail={t("statistics.noReviews")} />
  ) : (
    <StatTile
      label={label}
      value={formatPercent(recall.recalled / recall.reviews)}
      detail={t("statistics.ofReviews", { count: recall.reviews })}
    />
  );
}

/** The share of graded course answers that were right, with the count it is of; the answers must not be none. */
export function QuizTile({ quiz }: { quiz: Quiz }) {
  const { t, formatPercent } = useI18n();
  return (
    <StatTile
      label={t("statistics.quizAccuracy")}
      value={formatPercent(quiz.right / quiz.answers)}
      detail={t("statistics.rightOfAnswers", { count: quiz.answers })}
    />
  );
}

/**
 * The share of prompts remembered the first time they were seen, with
 * the count it is of, however few; a dash while there are none.
 */
export function FirstTryTile({ firstTry }: { firstTry: FirstTry }) {
  const { t, formatPercent } = useI18n();
  return firstTry.introduced === 0 ? (
    <StatTile label={t("statistics.firstTry")} value="–" detail={t("statistics.noNewCards")} />
  ) : (
    <StatTile
      label={t("statistics.firstTry")}
      value={formatPercent(firstTry.recalled / firstTry.introduced)}
      detail={t("statistics.ofNewCards", { count: firstTry.introduced })}
    />
  );
}

/**
 * How long the cards that grew mature took (timeToMatureOf): the median
 * days, with the median reviews and how many cards it is of, however
 * few; a dash while none has.
 */
export function TimeToMatureTile({ time }: { time: TimeToMature }) {
  const { t } = useI18n();
  return time.prompts === 0 ? (
    <StatTile label={t("statistics.timeToMature")} value="–" detail={t("statistics.noneMatured")} />
  ) : (
    <StatTile
      label={t("statistics.timeToMature")}
      value={t("statistics.dayCount", { count: Math.round(time.days!) })}
      detail={t("statistics.timeToMatureDetail", {
        reviews: t("statistics.reviewCount", { count: Math.round(time.reviews!) }),
        count: time.prompts,
      })}
    />
  );
}

/**
 * This week or this month so far (periodToDateOf), a tile a figure, each
 * with the same days of the one before under it.
 */
export function PeriodTiles({
  period,
  figures,
}: {
  period: "week" | "month";
  figures: PeriodToDate;
}) {
  const { t, formatPercent } = useI18n();
  const { current, previous } = figures;
  const before = (value: string) =>
    period === "week"
      ? t("statistics.sameDaysLastWeek", { value })
      : t("statistics.sameDaysLastMonth", { value });
  const share = ({ reviews, recalled }: Recall) =>
    reviews === 0
      ? t("statistics.noReviewsThen")
      : t("statistics.recallShare", { percent: formatPercent(recalled / reviews), count: reviews });
  const { reviews, recalled } = current.recall;
  return (
    <div class="stat-tiles">
      <StatTile
        label={t("statistics.answers")}
        value={String(current.answers)}
        detail={before(String(previous.answers))}
      />
      <StatTile
        label={t("statistics.studyDays")}
        value={String(current.studyDays)}
        detail={before(String(previous.studyDays))}
      />
      <StatTile
        label={t("statistics.introducedColumn")}
        value={String(current.introduced)}
        detail={before(String(previous.introduced))}
      />
      <StatTile
        label={t("statistics.recall")}
        value={reviews === 0 ? "–" : formatPercent(recalled / reviews)}
        detail={[
          reviews === 0 ? t("statistics.noReviews") : t("statistics.ofReviews", { count: reviews }),
          before(share(previous.recall)),
        ].join(" · ")}
      />
    </div>
  );
}

/**
 * Whether there is nothing to say of recall but course answers to show:
 * no scored review yet, and graded course answers (a course's deck
 * studied only in its chapters). Recall then gives way to them.
 */
export function onlyCourseAnswers({
  retention,
  quiz,
}: {
  retention: { young: Recall; mature: Recall };
  quiz: Quiz;
}): boolean {
  return retention.young.reviews + retention.mature.reviews === 0 && quiz.answers > 0;
}

/**
 * Where the figures begin when the log begins after the range asked for
 * (StatisticsReport.coverage): its first month, written out; nothing when
 * the log covers the whole range.
 */
export function CoverageNote({ coverage }: { coverage: string | null }) {
  const { t, formatMonth } = useI18n();
  return coverage === null ? null : (
    <p class="hint">{t("statistics.coverage", { month: formatMonth(coverage) })}</p>
  );
}
