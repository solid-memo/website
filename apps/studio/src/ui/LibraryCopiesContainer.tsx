import { useState } from "preact/hooks";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { DeckUpgradeOutcome } from "@solid-memo/domain/deckUpgrade";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { libraryUpgradeQuery, refreshUpgradedDeck } from "@solid-memo/ui/LibraryUpgradeContainer";
import { Loading } from "@solid-memo/ui/Loading";
import { LibraryCopiesScreen, type BatchResult, type BatchRun, type PlanState } from "./LibraryCopiesScreen";
import { libraryUpdatesQuery } from "./UpdateBadge";

/**
 * The library copies screen's data: the instance's copies of library
 * releases (UseCases.listLibraryUpdates, Home's badges' query), then, for
 * each the library has a newer release of, what upgrading it would do
 * (planLibraryUpgrade, the query Solid Memo's offer makes). A batch
 * upgrades the decks chosen one after another, each with Solid Memo's
 * own upgrade (applyLibraryUpgrade) and the plan the user saw: a deck
 * changed since is refused, as there. A failure is that deck's alone;
 * the next is upgraded all the same. Then everything the upgrades
 * touched is read afresh, the copies among it, failed decks included.
 * The plans take each copy's series from the copies' one read of the
 * library's index.
 */
export function LibraryCopiesContainer({
  useCases,
  instance,
  deckHref,
  libraryHref,
}: {
  useCases: UseCases;
  instance: Instance;
  deckHref: (deck: Deck) => string;
  libraryHref: string;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const copiesQuery = useQuery(libraryUpdatesQuery(useCases, instance.url));
  const copies = copiesQuery.data ?? [];
  const planQueries = useQueries({
    queries: copies.map((copy) => ({
      ...libraryUpgradeQuery(useCases, copy.deck),
      // A copy with a newer release has its series, as the index listed it: the index is not read again.
      queryFn: () => useCases.planLibraryUpgrade(copy.deck, copy.series!),
      enabled: copy.newer,
    })),
  });
  const [running, setRunning] = useState<BatchRun | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]);

  const batchMutation = useMutation({
    mutationFn: async (chosen: readonly { deck: Deck; plan: LibraryUpgradePlan }[]) => {
      setResults([]);
      const ended: BatchResult[] = [];
      for (const [index, { deck, plan }] of chosen.entries()) {
        const run = { index, total: chosen.length, deck };
        setRunning({ ...run, step: "read", done: 0 });
        const outcome: DeckUpgradeOutcome = await useCases
          .applyLibraryUpgrade(deck, plan, ({ step, done, part }) =>
            setRunning({ ...run, step, done, ...(part === undefined ? {} : { part }) }),
          )
          // One that could not even start is that deck's failure, before anything was written.
          .catch((error: unknown) => ({ ok: false, step: "read", error, changed: false }));
        ended.push({ deck, plan, outcome });
        setResults([...ended]);
      }
      setRunning(null);
      // Each plan is made again for the deck as it now is; an upgraded deck's documents are read afresh.
      // A failed deck is read again too: it may have changed in another tab, and its plan with it; one the
      // upgrade changed in part has its documents read afresh as well.
      await Promise.all(
        ended.map(({ deck, outcome }) =>
          outcome.ok
            ? refreshUpgradedDeck(queryClient, instance.url, deck)
            : Promise.all([
                outcome.changed
                  ? refreshUpgradedDeck(queryClient, instance.url, deck)
                  : queryClient.invalidateQueries({ queryKey: ["decks"] }),
                queryClient.invalidateQueries({ queryKey: ["libraryUpgrade", deck.url] }),
              ]),
        ),
      );
    },
  });

  if (copiesQuery.error) return <ErrorMessage error={errorText(copiesQuery.error)} />;
  if (copiesQuery.data === undefined) return <Loading label={t("studio.library.loading")} />;
  const planOf = (index: number): PlanState => {
    const query = planQueries[index]!;
    return query.isError ? "failed" : query.data === undefined ? "loading" : query.data;
  };
  return (
    <LibraryCopiesScreen
      instance={instance}
      rows={copies.map((copy, index) => ({ copy, plan: planOf(index) }))}
      running={running}
      results={results}
      deckHref={deckHref}
      libraryHref={libraryHref}
      onUpgrade={(chosen) => batchMutation.mutate(chosen)}
    />
  );
}
