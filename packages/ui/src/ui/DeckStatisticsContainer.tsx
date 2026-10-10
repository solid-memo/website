import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { CardProgressContainer } from "./CardProgressContainer";
import { useI18n } from "./i18n";
import { DayBars, RecallTile } from "./StatisticsCharts";

/**
 * A deck's own statistics on its page: its answers of the last 30 days
 * and how well its reviews were remembered, nothing of them while there
 * are no answers yet, or when they cannot be read (the deck works without
 * them); then where its cards stand, all new before the first answer.
 */
export function DeckStatisticsContainer({ useCases, instance, deck }: { useCases: UseCases; instance: Instance; deck: Deck }) {
  const { t } = useI18n();
  const statisticsQuery = useQuery({
    queryKey: ["statistics", instance.url, deck.url],
    queryFn: () => useCases.getStatistics(instance.url, new Date(), { deckUrl: deck.url }),
  });
  const statistics = statisticsQuery.data;
  return (
    <>
      {statistics !== undefined && statistics.totals.answers > 0 && (
        <section class="statistics deck-statistics-section" aria-labelledby="deck-statistics-heading">
          <h3 id="deck-statistics-heading">{t("statistics.heading")}</h3>
          <DayBars days={statistics.days} today={statistics.today} />
          <div class="stat-tiles">
            <RecallTile label={t("statistics.young")} recall={statistics.retention.young} />
            <RecallTile label={t("statistics.mature")} recall={statistics.retention.mature} />
          </div>
        </section>
      )}
      <CardProgressContainer useCases={useCases} instance={instance} deck={deck} />
    </>
  );
}
