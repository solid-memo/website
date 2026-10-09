import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { CardSpot } from "@solid-memo/domain/deckHealth";
import type { Instance } from "@solid-memo/domain/instance";
import type { Unrepairable } from "@solid-memo/domain/repair";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { useRepairMutation } from "@solid-memo/ui/RepairContainer";
import { deckHealthQuery, HealthBadge } from "./HealthBadge";
import { DeckHealthScreen, InstanceHealthScreen, type RepairActions } from "./HealthScreen";

/**
 * The health screen's data: with a deck, its health (UseCases.checkDeck)
 * and its cards (the workbench's query), which name what the check of
 * its data is about; without, the instance's check (the one Home and
 * Solid Memo make when it is opened, the same query) and its decks.
 * Repairs are Solid Memo's own (planRepair, applyRepairs), of what the
 * check shown found: a deck's only, on a deck's health. A removal is
 * made once the user confirms it. After either, every check of the
 * instance is read afresh.
 */
export function HealthContainer({
  useCases,
  instance,
  deck,
  spotHref,
  aboutHref,
  deckHref,
}: {
  useCases: UseCases;
  instance: Instance;
  /** The deck to check; null for the instance. */
  deck: Deck | null;
  /** A problem's place in a card: that field of the card inspector. */
  spotHref: (deck: Deck, spot: CardSpot) => string;
  /** What a deck says of itself. */
  aboutHref: (deck: Deck) => string;
  /** A deck's own health. */
  deckHref: (deck: Deck) => string;
}) {
  return deck === null ? (
    <InstanceHealthContainer useCases={useCases} instance={instance} deckHref={deckHref} />
  ) : (
    <DeckHealthContainer useCases={useCases} instance={instance} deck={deck} spotHref={spotHref} aboutHref={aboutHref} />
  );
}

/** The repairs of what a check found (`report`), the removal of a subject once the user confirms it. */
function useRepairs(useCases: UseCases, instance: Instance): (report: ValidationReport) => RepairActions {
  const { t, errorText } = useI18n();
  const repairMutation = useRepairMutation(useCases, instance.url);
  return (report) => {
    const plan = useCases.planRepair(report);
    return {
      plan,
      busy: repairMutation.isPending,
      onRepair: () => repairMutation.mutate(plan.repairs),
      onRemove: (problem: Unrepairable) => {
        if (window.confirm(t("repair.removeConfirm", { url: problem.subjectUrl }))) {
          repairMutation.mutate([{ kind: "remove-subject", documentUrl: problem.documentUrl, subjectUrl: problem.subjectUrl, version: 1 }]);
        }
      },
      error: errorText(repairMutation.error),
    };
  };
}

function DeckHealthContainer({
  useCases,
  instance,
  deck,
  spotHref,
  aboutHref,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
  spotHref: (deck: Deck, spot: CardSpot) => string;
  aboutHref: (deck: Deck) => string;
}) {
  const { t, errorText } = useI18n();
  const repairs = useRepairs(useCases, instance);
  // Read afresh each time the screen opens, as a card edited since may have mended (or made) a problem.
  const healthQuery = useQuery({ ...deckHealthQuery(useCases, instance.url, deck), refetchOnMount: "always" });
  const cardsQuery = useQuery({
    queryKey: ["cards", deck.cardsDocumentUrl],
    queryFn: () => useCases.listCards(deck),
  });
  const error = healthQuery.error ?? cardsQuery.error;
  if (error) return <ErrorMessage error={errorText(error)} />;
  if (healthQuery.data === undefined || cardsQuery.data === undefined) return <Loading label={t("studio.health.loading")} />;
  return (
    <DeckHealthScreen
      deck={deck}
      health={healthQuery.data}
      cards={cardsQuery.data}
      checking={healthQuery.isFetching}
      onCheck={() => void healthQuery.refetch()}
      repairs={repairs(healthQuery.data.report)}
      spotHref={(spot) => spotHref(deck, spot)}
      aboutHref={aboutHref(deck)}
    />
  );
}

function InstanceHealthContainer({
  useCases,
  instance,
  deckHref,
}: {
  useCases: UseCases;
  instance: Instance;
  deckHref: (deck: Deck) => string;
}) {
  const { t, errorText } = useI18n();
  const repairs = useRepairs(useCases, instance);
  const reportQuery = useQuery({
    queryKey: ["validation", instance.url],
    queryFn: () => useCases.checkInstance(instance.url),
    staleTime: Infinity,
  });
  const decksQuery = useQuery({
    queryKey: ["decks", instance.url],
    queryFn: () => useCases.listDecks(instance.url),
  });
  const error = reportQuery.error ?? decksQuery.error;
  if (error) return <ErrorMessage error={errorText(error)} />;
  if (reportQuery.data === undefined || decksQuery.data === undefined) return <Loading label={t("studio.health.loading")} />;
  return (
    <InstanceHealthScreen
      instance={instance}
      report={reportQuery.data}
      decks={decksQuery.data}
      checking={reportQuery.isFetching}
      onCheck={() => void reportQuery.refetch()}
      repairs={repairs(reportQuery.data)}
      deckHref={deckHref}
      badge={(each) => <HealthBadge useCases={useCases} instanceUrl={instance.url} deck={each} href={deckHref(each)} />}
    />
  );
}
