import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { StatisticsScreen } from "./StatisticsScreen";

/** Reads the instance's statistics, of the last twelve study months, each time the page opens. */
export function StatisticsContainer({
  useCases,
  instance,
  decks,
}: {
  useCases: UseCases;
  instance: Instance;
  decks: readonly Deck[];
}) {
  const { t, errorText } = useI18n();
  const statisticsQuery = useQuery({
    queryKey: ["statistics", instance.url],
    queryFn: () => useCases.getStatistics(instance.url, new Date()),
  });
  if (statisticsQuery.error) return <ErrorMessage error={errorText(statisticsQuery.error)} />;
  if (statisticsQuery.data === undefined) return <Loading label={t("statistics.loading")} />;
  return <StatisticsScreen statistics={statisticsQuery.data} decks={decks} />;
}
