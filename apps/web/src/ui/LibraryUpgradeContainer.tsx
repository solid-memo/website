import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import type { Backup, BackupRestore } from "@solid-memo/domain/backup";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { StepPart } from "@solid-memo/domain/deckUpgrade";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import { useI18n } from "./i18n";
import { LibraryUpgradeNotice } from "./LibraryUpgradeNotice";
import {
  DECK_UPGRADE_SCREEN_STEPS,
  DeckUpgradeFailure,
  DeckUpgradeInterrupted,
  DeckUpgradeProgress,
  type DeckUpgradeScreenStep,
} from "./DeckUpgrade";
import { ErrorMessage } from "./ErrorMessage";
import { RestoreResult } from "./InstanceUpdate";

/**
 * Checks whether the library has a newer release of an imported deck
 * and, when it does, shows the offer. Only decks with a library source
 * are checked (the index and two releases read once, kept for the
 * session); a failed check shows nothing, since the deck works as it is.
 * Home-made decks render nothing at all. Once a session, it also gives
 * the deck the languages its own release states its title and
 * description in and the copy lacks, which upgrades made before they
 * brought the texts along left out, and tidies away what an upgrade by an
 * earlier version of the app, cut off half-way, left in the pod. While an
 * upgrade runs, its steps are shown in place of the offer; a failed one
 * says where it failed and whether the deck is exactly as it was, with
 * "Try restoring again" when putting it back failed. An upgrade this
 * browser noted that did not finish is offered to put back, in place of
 * the offer.
 */
export function LibraryUpgradeContainer({
  useCases,
  instance,
  deck,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
}) {
  const { t, readerText, readerLang, errorText } = useI18n();
  const queryClient = useQueryClient();

  const planQuery = useQuery({
    // Planned for the deck as it is: once an upgrade moves it to another
    // release, the plan for the deck as it was no longer applies.
    queryKey: ["libraryUpgrade", deck.url, deck.sourceUrl, deck.cardsDocumentUrl],
    queryFn: () => useCases.planLibraryUpgrade(deck),
    enabled: deck.sourceUrl !== undefined,
    staleTime: Infinity,
  });

  useQuery({
    queryKey: ["releaseLanguages", deck.url, deck.sourceUrl],
    queryFn: async () => {
      const updated = await useCases.addReleaseLanguages(deck);
      if (updated !== null) await queryClient.invalidateQueries({ queryKey: ["decks"] });
      return updated !== null;
    },
    enabled: deck.sourceUrl !== undefined,
    staleTime: Infinity,
    retry: false,
  });

  useQuery({
    queryKey: ["deckUpgradeTidy", deck.url],
    queryFn: () => useCases.tidyInterruptedDeckUpgrade(deck),
    enabled: deck.sourceUrl !== undefined,
    staleTime: Infinity,
    retry: false,
  });

  const interruptedQuery = useQuery({
    queryKey: ["interruptedDeckUpgrade", deck.url],
    queryFn: () => useCases.findInterruptedDeckUpgrade(deck),
    enabled: deck.sourceUrl !== undefined,
    staleTime: Infinity,
    retry: false,
  });

  const [progress, setProgress] = useState<{ step: DeckUpgradeScreenStep; done: number; part?: StepPart; undoing?: true }>({
    step: "read",
    done: 0,
  });
  /** What putting back an upgrade that did not finish did, said until the page goes. */
  const [putBack, setPutBack] = useState<BackupRestore | null>(null);

  /** Everything shown of the deck, read again: its documents may be as they were again. */
  const reread = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["decks"] }),
      queryClient.invalidateQueries({ queryKey: ["libraryUpgrade", deck.url] }),
      queryClient.invalidateQueries({ queryKey: ["cards", deck.cardsDocumentUrl] }),
      queryClient.invalidateQueries({ queryKey: ["reviews", deck.reviewsDocumentUrl] }),
      queryClient.invalidateQueries({ queryKey: ["backups", instance.url] }),
      queryClient.invalidateQueries({ queryKey: ["interruptedDeckUpgrade", deck.url] }),
    ]);

  /** Putting the deck back as it was: the failed upgrade's backup, by its folder, or an unfinished one's. */
  const restoreMutation = useMutation({
    mutationFn: async (which: string | Backup) => {
      const backup =
        typeof which === "string" ? (await useCases.listBackups(instance)).find((candidate) => candidate.url === which) : which;
      if (backup === undefined) throw new AppError("noBackup", { instance: instance.name });
      return useCases.restoreBackup(instance, backup);
    },
    onSuccess: async (restored, which) => {
      if (typeof which !== "string") setPutBack(restored);
      await reread();
    },
  });
  const upgradeMutation = useMutation({
    mutationFn: async (plan: LibraryUpgradePlan) => {
      setProgress({ step: "read", done: 0 });
      const outcome = await useCases.applyLibraryUpgrade(deck, plan, setProgress);
      if (!outcome.ok) {
        // An offer the deck no longer calls for is looked at again, with the deck as it now is; a deck
        // not put back as it was is read again, and so are the backups, which keep it.
        await (outcome.asItWas
          ? Promise.all([
              queryClient.invalidateQueries({ queryKey: ["decks"] }),
              queryClient.invalidateQueries({ queryKey: ["libraryUpgrade", deck.url] }),
            ])
          : reread());
        return outcome;
      }
      // Everything the upgrade touched is read again at once, so the deck changes on screen in one go.
      setProgress({ step: "refresh", done: DECK_UPGRADE_SCREEN_STEPS.length - 1 });
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["decks"] }),
        queryClient.invalidateQueries({ queryKey: ["cards", deck.cardsDocumentUrl] }),
        queryClient.invalidateQueries({ queryKey: ["reviews", deck.reviewsDocumentUrl] }),
        queryClient.invalidateQueries({ queryKey: ["migration", instance.url] }),
      ]);
      return outcome;
    },
  });

  if (deck.sourceUrl === undefined) return null;
  const outcome = upgradeMutation.data;
  const plan = planQuery.data;
  let shown: JSX.Element | null = null;
  const interrupted = interruptedQuery.data ?? null;
  if (upgradeMutation.isPending) {
    shown = (
      <DeckUpgradeProgress step={progress.step} done={progress.done} part={progress.part} undoing={progress.undoing === true} />
    );
  } else if (outcome?.ok === false) {
    shown = (
      <DeckUpgradeFailure
        outcome={outcome}
        busy={restoreMutation.isPending}
        restored={restoreMutation.data}
        onRetry={() => (plan === undefined || plan === null ? upgradeMutation.reset() : upgradeMutation.mutate(plan))}
        onRestore={() => restoreMutation.mutate(outcome.backupUrl!)}
        onDismiss={() => {
          upgradeMutation.reset();
          restoreMutation.reset();
        }}
      >
        <ErrorMessage error={errorText(restoreMutation.error)} />
      </DeckUpgradeFailure>
    );
  } else if (interrupted !== null) {
    shown = (
      <DeckUpgradeInterrupted folder={interrupted.url} busy={restoreMutation.isPending} onRestore={() => restoreMutation.mutate(interrupted)}>
        <ErrorMessage error={errorText(restoreMutation.error)} />
      </DeckUpgradeInterrupted>
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
  const updated = upgradeMutation.isSuccess && shown === null;
  return (
    <>
      {putBack !== null && <RestoreResult restored={putBack} />}
      {shown}
      {/* Mounted throughout, so the update's end is heard: a live region
          inserted along with its text often goes unheard. */}
      <p class="hint" role="status">
        {updated ? t("libraryUpgrade.updated", { version: upgradeMutation.variables.toVersion }) : ""}
      </p>
    </>
  );
}
