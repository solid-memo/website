// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { CardProgressReport, DeckProgress } from "@solid-memo/application/statistics";
import { shiftStudyDay } from "@solid-memo/domain/answer";
import {
  mergeCardProgress,
  mergeForecasts,
  newCardsRunOutOf,
} from "@solid-memo/domain/cardProgress";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { mergeBins } from "@solid-memo/domain/scheduleInsight";
import { ForecastBars } from "./charts/ForecastBars";
import { SpreadCharts } from "./charts/Histogram";
import { MaturityBar } from "./charts/MaturityBar";
import { StatTile } from "./charts/StatTiles";
import { useCopies } from "./deckTreeEditor";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { ReaderText } from "./ReaderText";
import { STATISTICS_STALE_MS } from "./studyFigures";
import { queryKeys } from "./queryKeys";

/**
 * Where the cards stand now, read from the decks' cards and review states
 * when shown and what was read is over half a minute old, or a change
 * made cleared it (keepStudyFiguresFresh): how many prompts are new,
 * relearning, young and mature; what is overdue and when the daily caps
 * let the reviews held back through; the reviews due over the next 30
 * days beside those the caps let through; how the intervals and eases
 * are spread; of every deck of the instance, then each deck's maturity
 * on its own, or of the one deck given, with when its new cards run
 * out. When it cannot be read a quiet line says so, and the rest of the
 * page works on.
 */
export function CardProgressContainer({
  useCases,
  instance,
  deck,
}: {
  useCases: UseCases;
  instance: Instance;
  deck?: Deck;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const progressQuery = useCardProgress(useCases, instance, deck);
  const report = progressQuery.data;
  return (
    <section class="statistics card-progress" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("statistics.progressHeading")}</h3>
      {progressQuery.error ? (
        <p class="hint">{t("statistics.progressUnavailable")}</p>
      ) : report === undefined ? (
        <Loading label={t("statistics.progressLoading")} />
      ) : (
        <CardProgressView useCases={useCases} report={report} byDeck={deck === undefined} />
      )}
    </section>
  );
}

/**
 * The cards' progress of every deck of the instance, or of the one deck
 * given, as one query: CardProgressContainer and HardestCardsContainer
 * share what it reads. Not `enabled`, it is never read again, neither
 * on focus nor when invalidated, and keeps what it has.
 */
export function useCardProgress(
  useCases: UseCases,
  instance: Instance,
  deck?: Deck,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.deckCardProgress(instance.url, deck?.url),
    queryFn: () =>
      useCases.getCardProgress(instance.url, new Date(), deck === undefined ? {} : { deck }),
    staleTime: STATISTICS_STALE_MS,
    enabled,
  });
}

/**
 * The decks' progress taken together, and each deck's maturity on its
 * own when `byDeck`. When new cards run out is a deck's own, at its own
 * cap, so it is said of each deck; never of a course's deck, whose cards
 * join it as their questions are answered.
 */
function CardProgressView({
  useCases,
  report,
  byDeck,
}: {
  useCases: UseCases;
  report: CardProgressReport;
  byDeck: boolean;
}) {
  const { t } = useI18n();
  const { isCourse } = useCopies(
    useCases,
    report.decks.map((one) => one.deck),
  );
  const overall = mergeCardProgress(report.decks.map((one) => one.progress));
  const forecast = mergeForecasts(
    report.decks.map((one) => one.forecast),
    report.today,
  );
  const intervals = mergeBins(report.decks.map((one) => one.intervals));
  const scheduled = intervals.some((bin) => bin.count > 0);
  return (
    <>
      <p class="hint">{t("statistics.maturityHint")}</p>
      <MaturityBar progress={overall} caption={t("statistics.maturity")} />
      <div class="stat-tiles">
        <StatTile
          label={t("statistics.overdue")}
          value={String(report.decks.reduce((sum, one) => sum + one.overdue, 0))}
          detail={t("statistics.overdueDetail")}
        />
        <CaughtUpTile report={report} />
        {!byDeck && report.decks[0] !== undefined && !isCourse(report.decks[0].deck) && (
          <RunOutTile deck={report.decks[0]} today={report.today} />
        )}
      </div>
      <ForecastBars forecast={forecast} />
      {scheduled && (
        <SpreadCharts
          intervals={intervals}
          eases={mergeBins(report.decks.map((one) => one.eases))}
        />
      )}
      {byDeck && report.decks.length > 0 && (
        <>
          <h4>{t("statistics.maturityByDeck")}</h4>
          <ul class="maturity-decks">
            {report.decks.map((one) => (
              <li key={one.deck.url}>
                <MaturityBar
                  progress={one.progress}
                  caption={<ReaderText text={one.deck.title} />}
                />
                {!isCourse(one.deck) && <RunOutLine deck={one} today={report.today} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * When the daily caps have let through every review they hold back over
 * the forecast, studying each day: of the deck that takes longest, each
 * at its own cap; past the forecast, with how many still wait then.
 */
function CaughtUpTile({ report }: { report: CardProgressReport }) {
  const { t, formatDate } = useI18n();
  const days = report.decks.map((one) => one.daysToClear);
  const label = t("statistics.daysToClear");
  if (days.includes(null)) {
    const count = report.decks[0]!.forecast.length;
    const backlog = report.decks.reduce(
      (sum, one) => sum + one.forecast.reduce((waiting, day) => waiting + day.due - day.reviews, 0),
      0,
    );
    return (
      <StatTile
        label={label}
        value={t("statistics.notWithinDays", { count })}
        detail={t("statistics.backlogLeft", { count: backlog })}
      />
    );
  }
  const latest = Math.max(0, ...(days as number[]));
  return latest === 0 ? (
    <StatTile
      label={label}
      value={t("statistics.caughtUpToday")}
      detail={t("statistics.nothingHeldBack")}
    />
  ) : (
    <StatTile
      label={label}
      value={formatDate(shiftStudyDay(report.today, latest))}
      detail={t("statistics.caughtUpIn", { count: latest })}
    />
  );
}

/** When the deck's new cards run out at its cap, studying each day; nothing once none is new. */
function RunOutTile({ deck, today }: { deck: DeckProgress; today: string }) {
  const { t, formatDate } = useI18n();
  const count = deck.progress.new;
  if (count === 0) return null;
  const day = newCardsRunOutOf({
    count,
    newCardsPerDay: deck.newCardsPerDay,
    introducedToday: deck.introducedToday,
    today,
  });
  return day === null ? (
    <StatTile
      label={t("statistics.runOut")}
      value={t("statistics.never")}
      detail={t("statistics.runOutNeverDetail")}
    />
  ) : (
    <StatTile
      label={t("statistics.runOut")}
      value={formatDate(day)}
      detail={t("statistics.runOutDetail", { count: deck.newCardsPerDay })}
    />
  );
}

/** The same, in a line under the deck's maturity bar. */
function RunOutLine({ deck, today }: { deck: DeckProgress; today: string }) {
  const { t, formatDate } = useI18n();
  const count = deck.progress.new;
  if (count === 0) return null;
  const day = newCardsRunOutOf({
    count,
    newCardsPerDay: deck.newCardsPerDay,
    introducedToday: deck.introducedToday,
    today,
  });
  return (
    <p class="hint run-out">
      {day === null
        ? t("statistics.runOutNever")
        : t("statistics.runOutOn", { date: formatDate(day) })}
    </p>
  );
}
