// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { StatisticsReport, UseCases } from "@solid-memo/application/useCases";
import { mergeCardProgress } from "@solid-memo/domain/cardProgress";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { CardProgressContainer, useCardProgress } from "./CardProgressContainer";
import { CourseStatisticsContainer } from "./CourseStatistics";
import { ErrorMessage } from "./ErrorMessage";
import { HardestCardsContainer } from "./HardestCardsContainer";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import type { StatisticsRange, StatisticsView } from "./router";
import { StatisticsScreen, type StatisticsChange } from "./StatisticsScreen";
import { ActivitySection, MemorySection, OverviewSection } from "./StatisticsSections";
import { rangeRead, statisticsQuery } from "./studyFigures";

/**
 * The statistics page, of every deck of the instance or of the one deck
 * given, over `range`, on the tab `view`. The answers of the range are
 * read when the page opens and what was read is over half a minute old
 * (any change made clears it at once), and shown on the overview, the
 * activity and the memory tabs; where the cards stand is read on its
 * own, as are what is hard (on the memory tab, from the same read) and
 * how the courses have gone (on the cards' tab), so none waits for
 * another, and the cards' tab shows before any answer. A range without
 * answers says so, and that a longer one may have some, unless the log
 * has none at all or the range takes in the whole log (it begins within
 * it: `coverage`), as when its only month's answers were reset. The overview
 * also gives the cards known now, from where the cards stand, and
 * saves the range's answers as a file on the learner's device.
 */
export function StatisticsContainer({
  useCases,
  instance,
  decks,
  deck,
  range,
  view,
  hrefOf,
  onChange,
}: {
  useCases: UseCases;
  instance: Instance;
  /** The instance's decks, to name them; of one deck's statistics, that deck. */
  decks: readonly Deck[];
  /** The deck whose statistics these are; none for the instance's. */
  deck?: Deck;
  range: StatisticsRange;
  view: StatisticsView;
  hrefOf: (change: StatisticsChange) => string;
  onChange: (change: StatisticsChange) => void;
}) {
  const { t, errorText } = useI18n();
  const statisticsRead = useQuery(statisticsQuery(useCases, instance.url, range, deck?.url));
  const progress = useCardProgress(useCases, instance, deck).data;
  const cardsYouKnow =
    progress === undefined
      ? undefined
      : mergeCardProgress(progress.decks.map((one) => one.progress)).mature;
  const withStatistics = (show: (statistics: StatisticsReport) => ComponentChildren) =>
    statisticsRead.error ? (
      <ErrorMessage error={errorText(statisticsRead.error)} />
    ) : statisticsRead.data === undefined ? (
      <Loading label={t("statistics.loading")} />
    ) : statisticsRead.data.totals.answers === 0 ? (
      <p class="hint">
        {range === "all" ||
        statisticsRead.data.logBegins === null ||
        statisticsRead.data.coverage !== null
          ? t("statistics.empty")
          : t("statistics.emptyRange")}
      </p>
    ) : (
      show(statisticsRead.data)
    );
  return (
    <StatisticsScreen range={range} view={view} hrefOf={hrefOf} onChange={onChange}>
      {view === "overview" &&
        withStatistics((statistics) => (
          <>
            <OverviewSection
              statistics={statistics}
              decks={deck === undefined ? decks : undefined}
              allTime={range === "all"}
              cardsYouKnow={cardsYouKnow}
            />
            <SaveAnswers useCases={useCases} instance={instance} range={range} deck={deck} />
          </>
        ))}
      {view === "activity" &&
        withStatistics((statistics) => <ActivitySection statistics={statistics} />)}
      {view === "memory" && (
        <>
          {withStatistics((statistics) => (
            <MemorySection statistics={statistics} byDirection={deck !== undefined} />
          ))}
          <HardestCardsContainer useCases={useCases} instance={instance} deck={deck} />
        </>
      )}
      {view === "cards" && (
        <>
          <CardProgressContainer useCases={useCases} instance={instance} deck={deck} />
          <CourseStatisticsContainer useCases={useCases} instance={instance} decks={decks} />
        </>
      )}
    </StatisticsScreen>
  );
}

/**
 * "Download my answers (CSV)": the range's answers, of every deck or of
 * one, saved as a file on the learner's device (UseCases.saveAnswers),
 * sent nowhere. Not a mutation: it changes nothing, so nothing is read
 * again after it.
 */
function SaveAnswers({
  useCases,
  instance,
  range,
  deck,
}: {
  useCases: UseCases;
  instance: Instance;
  range: StatisticsRange;
  deck?: Deck;
}) {
  const { t, errorText } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const read = rangeRead(range);
    try {
      await useCases.saveAnswers(
        instance.url,
        new Date(),
        deck === undefined ? read : { ...read, deckUrl: deck.url },
      );
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="save-answers">
      <button type="button" disabled={busy} onClick={() => void save()}>
        {t("statistics.downloadAnswers")}
      </button>
      <p class="hint">{t("statistics.downloadHint")}</p>
      {error !== null && <ErrorMessage error={errorText(error)} />}
    </div>
  );
}
