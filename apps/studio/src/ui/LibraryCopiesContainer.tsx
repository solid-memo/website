// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { DeckUpgradeOutcome } from "@solid-memo/domain/deckUpgrade";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { upgradeChanges } from "@solid-memo/ui/LibraryUpgradeContainer";
import { useWrite } from "@solid-memo/ui/writeEffects";
import { Loading } from "@solid-memo/ui/Loading";
import {
  LibraryCopiesScreen,
  LibraryPlanScreen,
  type BatchResult,
  type BatchRun,
  type CopyRow,
  type PlanState,
} from "./LibraryCopiesScreen";
import { queries } from "./queries";

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
 * The plans take each copy's series from the copies' one look: the
 * library's index read once, the releases from links each read once. Until the instance's data check is done no copy can
 * be upgraded, nor, after it, one it sets aside (useDataCheck).
 */
export function LibraryCopiesContainer({
  useCases,
  instance,
  deckHref,
  libraryHref,
  healthHref,
  current,
  onCursor,
}: {
  useCases: UseCases;
  instance: Instance;
  deckHref: (deck: Deck) => string;
  libraryHref: string;
  /** The instance's health, which names what does not conform. */
  healthHref: string;
  /** The copy shown beside the table, by its deck's URL. */
  current?: string;
  onCursor: (deck: Deck) => void;
}) {
  const { t, errorText } = useI18n();
  const check = useDataCheck(useCases, instance.url);
  const { copiesQuery, rows } = useCopyRows(useCases, instance.url);
  const copies = copiesQuery.data ?? [];
  const [running, setRunning] = useState<BatchRun | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]);

  // Each plan is made again for the deck as it now is; an upgraded deck's documents are read afresh.
  // A failed deck is read again too: it may have changed in another tab, and its plan with it; one the
  // upgrade changed in part has its documents read afresh as well.
  const batchMutation = useWrite({
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
      return ended;
    },
    changes: (_, { data = [] }) =>
      data.flatMap(({ deck, outcome }) => upgradeChanges(instance.url, deck, outcome)),
  });

  if (copiesQuery.error) return <ErrorMessage error={errorText(copiesQuery.error)} />;
  if (copiesQuery.data === undefined) return <Loading label={t("studio.library.loading")} />;
  return (
    <LibraryCopiesScreen
      instance={instance}
      rows={rows}
      running={running}
      results={results}
      deckHref={deckHref}
      libraryHref={libraryHref}
      readOnly={check.hold({ kind: "decks", decks: copies.map((copy) => copy.deck) })}
      selectable={(deck) => check.hold({ kind: "deck", deck: deck }) === null}
      healthHref={healthHref}
      onUpgrade={(chosen) => batchMutation.mutate(chosen)}
      current={current}
      onCursor={onCursor}
    />
  );
}

/**
 * The library copy beside the table of them (LibraryPlanScreen), by its
 * deck's URL (`deckUrl`; none when null), from the table's own queries,
 * so it reads nothing the table has not. A copy the instance no longer
 * has, or not yet read, is none.
 */
export function LibraryPlanContainer({
  useCases,
  instance,
  deckUrl,
}: {
  useCases: UseCases;
  instance: Instance;
  deckUrl: string | null;
}) {
  const { rows } = useCopyRows(useCases, instance.url);
  return <LibraryPlanScreen row={rows.find((row) => row.copy.deck.url === deckUrl) ?? null} />;
}

/**
 * The instance's copies of library releases, and for each with a newer
 * release what upgrading it would do, as each is planned. Copies that
 * name one cards document and one indexed release are planned of its
 * cards once (planLibraryUpgrade), each with what its own deck's entry
 * changes; a copy from a link, whose releases each plan reads anew, is
 * compared against those it read.
 */
function useCopyRows(useCases: UseCases, instanceUrl: string) {
  const copiesQuery = useQuery(queries.libraryUpdates(useCases, instanceUrl));
  const copies = copiesQuery.data ?? [];
  const planQueries = useQueries({
    // A copy with a newer release has its series, as the copies found it: it is not looked for again.
    queries: copies.map((copy) => ({
      ...queries.libraryUpgradePlan(useCases, copy.deck, copy),
      enabled: copy.newer === true,
    })),
  });
  const planOf = (index: number): PlanState => {
    const query = planQueries[index]!;
    return query.isError ? "failed" : query.data === undefined ? "loading" : query.data;
  };
  const rows: CopyRow[] = copies.map((copy, index) => ({ copy, plan: planOf(index) }));
  return { copiesQuery, rows };
}
