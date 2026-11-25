// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LibraryUseCases } from "@solid-memo/application/library";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { DeckUpgradeOutcome, StepPart } from "@solid-memo/domain/deckUpgrade";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import { useI18n } from "./i18n";
import { LibraryUpgradeNotice } from "./LibraryUpgradeNotice";
import {
  DECK_UPGRADE_SCREEN_STEPS,
  DeckUpgradeFailure,
  DeckUpgradeProgress,
  type DeckUpgradeScreenStep,
} from "./DeckUpgrade";
import { queryKeys } from "./queryKeys";
import { changes, useWrite, type WriteEffect } from "./writeEffects";

/**
 * What upgrading the deck would do (UseCases.planLibraryUpgrade), kept
 * for the session. Planned for the deck as it is: once an upgrade moves
 * it to another release, the plan for the deck as it was no longer
 * applies. The plan kept is the very one planned, not a copy shared with
 * the one before it (structural sharing): its lists stay frozen, so what
 * is counted of them is counted once (activeCountOf).
 */
export function libraryUpgradeQuery(useCases: LibraryUseCases, deck: Deck) {
  return {
    queryKey: queryKeys.libraryUpgradePlan(deck.url, deck.sourceUrl, deck.cardsDocumentUrl),
    queryFn: () => useCases.planLibraryUpgrade(deck),
    staleTime: Infinity,
    structuralSharing: false,
  };
}

/**
 * What an upgrade of a deck changed (`outcome`; undefined: it could not
 * start). An upgraded deck has everything it touched read again at
 * once, so the deck changes on screen in one go. A failed one has its
 * offer looked at again, with the deck as it now is, and one the
 * upgrade changed in part is read again as an upgraded one.
 */
export function upgradeChanges(
  instanceUrl: string,
  deck: Deck,
  outcome: DeckUpgradeOutcome | undefined,
): WriteEffect[] {
  if (outcome?.ok === true) return [changes.upgraded(instanceUrl, deck)];
  return [
    outcome?.changed === true ? changes.upgraded(instanceUrl, deck) : changes.deckEntry(),
    changes.reads(queryKeys.libraryUpgrade(deck.url)),
  ];
}

/**
 * Checks whether the library has a newer release of an imported deck
 * and, when it does, shows the offer. Only decks with a library source
 * are checked (the index and the releases the plan compares read once,
 * kept for the session); a failed check shows nothing, since the deck
 * works as it is.
 * Home-made decks render nothing at all. Once a session, it also gives
 * the deck the languages its own release states its title and
 * description in and the copy lacks, which upgrades made before they
 * brought the texts along left out. While an upgrade runs, its steps
 * are shown in place of the offer; a failed one says where it failed and
 * whether the deck changed, and offers to try again with the deck as it
 * now is: an upgrade cut off half-way is offered again, and finishes.
 * The page around it may be rebuilt while the updated deck is read again
 * (the deck's page shows its loading meanwhile), this container with it,
 * so the update that ended is looked up among the session's updates of
 * the deck, and its end is still said.
 */
export function LibraryUpgradeContainer({
  useCases,
  instance,
  deck,
}: {
  useCases: LibraryUseCases;
  instance: Instance;
  deck: Deck;
}) {
  const { t, readerText, readerLang, errorText } = useI18n();
  const queryClient = useQueryClient();

  const planQuery = useQuery({
    ...libraryUpgradeQuery(useCases, deck),
    enabled: deck.sourceUrl !== undefined,
  });

  useQuery({
    queryKey: queryKeys.releaseLanguages(deck.url, deck.sourceUrl),
    queryFn: async () => {
      const updated = await useCases.addReleaseLanguages(deck);
      if (updated !== null) await queryClient.invalidateQueries({ queryKey: queryKeys.allDecks() });
      return updated !== null;
    },
    enabled: deck.sourceUrl !== undefined,
    staleTime: Infinity,
  });

  const [progress, setProgress] = useState<{
    step: DeckUpgradeScreenStep;
    done: number;
    part?: StepPart;
  }>({
    step: "read",
    done: 0,
  });
  const mutationKey = queryKeys.libraryUpgrade(deck.url);
  const upgradeMutation = useWrite({
    mutationKey,
    mutationFn: async (plan: LibraryUpgradePlan) => {
      setProgress({ step: "read", done: 0 });
      const outcome = await useCases.applyLibraryUpgrade(deck, plan, setProgress);
      if (outcome.ok) setProgress({ step: "refresh", done: DECK_UPGRADE_SCREEN_STEPS.length - 1 });
      return outcome;
    },
    changes: (_, { data }) => upgradeChanges(instance.url, deck, data),
  });

  // The release the session's last update of the deck brought it to: null when it failed, undefined when there was none.
  const lastUpdated = useMutationState({
    filters: { mutationKey, status: "success" },
    select: (mutation) =>
      (mutation.state.data as DeckUpgradeOutcome).ok
        ? (mutation.state.variables as LibraryUpgradePlan).toVersion
        : null,
  }).at(-1);

  if (deck.sourceUrl === undefined) return null;
  const outcome = upgradeMutation.data;
  const plan = planQuery.data;
  let shown: JSX.Element | null = null;
  if (upgradeMutation.isPending) {
    shown = <DeckUpgradeProgress step={progress.step} done={progress.done} part={progress.part} />;
  } else if (outcome?.ok === false) {
    shown = (
      <DeckUpgradeFailure
        outcome={outcome}
        onRetry={() =>
          plan === undefined || plan === null
            ? upgradeMutation.reset()
            : upgradeMutation.mutate(plan)
        }
        onDismiss={() => upgradeMutation.reset()}
      />
    );
  } else if (plan !== undefined && plan !== null) {
    shown = (
      <LibraryUpgradeNotice
        deckName={readerText(deck.title)}
        deckLang={readerLang(deck.title)}
        plan={plan}
        busy={false}
        error={errorText(upgradeMutation.error)}
        onUpgrade={() => upgradeMutation.mutate(plan)}
      />
    );
  }
  const updated = lastUpdated != null && shown === null;
  return (
    <>
      {shown}
      {/* Mounted throughout, so the update's end is heard: a live region
          inserted along with its text often goes unheard. */}
      <p class="hint" role="status">
        {updated ? t("libraryUpgrade.updated", { version: lastUpdated }) : ""}
      </p>
    </>
  );
}
