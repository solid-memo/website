import { useId } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { CardProgressReport, UseCases } from "@solid-memo/application/useCases";
import { mergeCardProgress, mergeForecasts } from "@solid-memo/domain/cardProgress";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { ReaderText } from "./ReaderText";
import { ForecastBars, MaturityBar } from "./StatisticsCharts";

/**
 * Where the cards stand now, read from the decks' cards and review states
 * each time it is shown: how many prompts are new, young and mature, and
 * the reviews due over the next 30 days; of every deck of the instance,
 * then each deck's maturity on its own, or of the one deck given. When it
 * cannot be read a quiet line says so, and the rest of the page works on.
 */
export function CardProgressContainer({ useCases, instance, deck }: { useCases: UseCases; instance: Instance; deck?: Deck }) {
  const { t } = useI18n();
  const headingId = useId();
  const progressQuery = useQuery({
    queryKey: ["cardProgress", instance.url, deck?.url],
    queryFn: () => useCases.getCardProgress(instance.url, new Date(), deck === undefined ? {} : { deck }),
  });
  const report = progressQuery.data;
  return (
    <section class="statistics card-progress" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("statistics.progressHeading")}</h3>
      {progressQuery.error ? (
        <p class="hint">{t("statistics.progressUnavailable")}</p>
      ) : report === undefined ? (
        <Loading label={t("statistics.progressLoading")} />
      ) : (
        <CardProgressView report={report} byDeck={deck === undefined} />
      )}
    </section>
  );
}

/** The decks' progress taken together, and each deck's maturity on its own when `byDeck`. */
function CardProgressView({ report, byDeck }: { report: CardProgressReport; byDeck: boolean }) {
  const { t } = useI18n();
  const overall = mergeCardProgress(report.decks.map((one) => one.progress));
  return (
    <>
      <p class="hint">{t("statistics.maturityHint")}</p>
      <MaturityBar progress={overall} caption={t("statistics.maturity")} />
      <ForecastBars forecast={mergeForecasts(report.decks.map((one) => one.forecast), report.today)} />
      {byDeck && report.decks.length > 0 && (
        <>
          <h4>{t("statistics.maturityByDeck")}</h4>
          <ul class="maturity-decks">
            {report.decks.map((one) => (
              <li key={one.deck.url}>
                <MaturityBar progress={one.progress} caption={<ReaderText text={one.deck.title} />} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
