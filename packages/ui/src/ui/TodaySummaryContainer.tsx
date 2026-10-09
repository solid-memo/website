import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { todayOf } from "@solid-memo/domain/statistics";
import { statisticsHref } from "./router";
import { TodaySummary } from "./TodaySummary";

/**
 * Today's study above the deck list, read afresh each time the list opens
 * (as after a session). Nothing before the day's first answer, or when
 * the answers cannot be read: the deck list works without them.
 */
export function TodaySummaryContainer({ useCases, instance }: { useCases: UseCases; instance: Instance }) {
  const statisticsQuery = useQuery({
    queryKey: ["statistics", instance.url],
    queryFn: () => useCases.getStatistics(instance.url, new Date()),
  });
  const today = statisticsQuery.data === undefined ? null : todayOf(statisticsQuery.data);
  if (today === null) return null;
  return <TodaySummary today={today} statisticsHref={statisticsHref(instance.url)} />;
}
