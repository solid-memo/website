import type { BackupRestore } from "@solid-memo/domain/backup";
import {
  DECK_UPGRADE_STEPS,
  type DeckUpgradeOutcome,
  type DeckUpgradeStep,
  type StepPart,
} from "@solid-memo/domain/deckUpgrade";
import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { ErrorMessage } from "./ErrorMessage";
import { ExternalLink } from "./ExternalLink";
import { useI18n, type I18n } from "./i18n";
import { KeptDocuments, RestoreResult } from "./InstanceUpdate";
import { usePanelFocus } from "./panelFocus";
import { StepProgress } from "./StepProgress";

/** The upgrade's steps as the screen shows them: the use case's, then refreshing what is shown. */
export type DeckUpgradeScreenStep = DeckUpgradeStep | "refresh";

export const DECK_UPGRADE_SCREEN_STEPS: readonly DeckUpgradeScreenStep[] = [...DECK_UPGRADE_STEPS, "refresh"];

function stepLabel(t: I18n["t"], step: DeckUpgradeScreenStep): string {
  return t(`deckUpgrade.step.${step}`);
}

/**
 * While a library deck upgrade runs: every step, the one it is on, and how
 * far along it is; or, once it failed after writing, that it puts the deck
 * back as it was.
 */
export function DeckUpgradeProgress({
  step,
  done,
  part,
  undoing = false,
}: {
  step: DeckUpgradeScreenStep;
  done: number;
  /** How far into `step` it is, for a step of more than one read or write. */
  part?: StepPart;
  /** Failed at `step`, it puts back what it wrote. */
  undoing?: boolean;
}) {
  const { t } = useI18n();
  const label = stepLabel(t, step);
  return (
    <StepProgress
      region={t("deckUpgrade.progressRegion")}
      steps={DECK_UPGRADE_SCREEN_STEPS.map((entry) => ({ step: entry, label: stepLabel(t, entry) }))}
      current={step}
      done={done}
      total={DECK_UPGRADE_SCREEN_STEPS.length}
      part={part}
      status={undoing ? t("deckUpgrade.undoing") : t("deckUpgrade.running", { step: label })}
      progressLabel={t("deckUpgrade.progressLabel")}
      hint={t("deckUpgrade.keepOpen")}
    />
  );
}

/**
 * When the upgrade failed: where, why, and whether the deck is exactly as
 * it was; else what was kept as changed elsewhere, each document with its
 * earlier version, or that putting the deck back failed, which can be
 * tried again. It takes the progress's place and its focus, so the
 * failure is read out.
 */
export function DeckUpgradeFailure({
  outcome,
  busy = false,
  restored,
  onRetry,
  onRestore,
  onDismiss,
  children,
}: {
  outcome: Extract<DeckUpgradeOutcome, { ok: false }>;
  /** Putting the deck back is under way. */
  busy?: boolean;
  /** What trying again to put the deck back did, once it did. */
  restored?: BackupRestore;
  onRetry: () => void;
  onRestore: () => void;
  onDismiss: () => void;
  /** Trying again's error, if any. */
  children?: ComponentChildren;
}) {
  const { t, tx, errorText } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>();
  const whyId = useId();
  const { undo, backupUrl, asItWas } = outcome;
  const folder = backupUrl === undefined ? null : <ExternalLink url={backupUrl}>{t("deckUpgrade.backupFolder")}</ExternalLink>;
  return (
    <div
      ref={ref}
      class="warning migration"
      role="region"
      aria-label={t("deckUpgrade.failedRegion")}
      aria-describedby={whyId}
      tabIndex={-1}
    >
      <div id={whyId} class="failure-why">
        <strong>{t("deckUpgrade.failedWhile", { step: stepLabel(t, outcome.step).toLowerCase() })}</strong>{" "}
        {errorText(outcome.error)}
      </div>
      {undo?.failed !== undefined ? (
        <>
          <p>{tx("deckUpgrade.notPutBack", { link: folder })}</p>
          <ErrorMessage error={errorText(undo.failed)} />
        </>
      ) : asItWas ? (
        <p>
          {t("deckUpgrade.noChanges")}
          {folder !== null && ` ${t("instanceUpdate.leftover")}`}
        </p>
      ) : (
        <>
          <p>{t("deckUpgrade.keptChanged")}</p>
          <KeptDocuments kept={undo!.kept} />
        </>
      )}
      {restored !== undefined && <RestoreResult restored={restored} />}
      <div class="edit-actions">
        {asItWas && (
          <button class="primary" onClick={onRetry}>
            {t("deckUpgrade.tryAgain")}
          </button>
        )}
        {undo?.failed !== undefined && restored === undefined && (
          <button
            class="primary"
            onClick={() => {
              if (!busy) onRestore();
            }}
            aria-disabled={busy}
          >
            {busy ? t("deckUpgrade.restoring") : t("deckUpgrade.tryRestoring")}
          </button>
        )}
        <button
          onClick={() => {
            if (!busy) onDismiss();
          }}
          aria-disabled={busy}
        >
          {t("deckUpgrade.close")}
        </button>
      </div>
      {children}
    </div>
  );
}

/**
 * An upgrade of the deck that did not finish (a closed tab, or one that
 * could not put the deck back), and the button that puts the deck back as
 * it was. While it works, the button keeps the focus (aria-disabled).
 */
export function DeckUpgradeInterrupted({
  folder,
  busy,
  onRestore,
  children,
}: {
  /** The upgrade's backup folder. */
  folder: string;
  busy: boolean;
  onRestore: () => void;
  /** Putting it back's error, if any. */
  children?: ComponentChildren;
}) {
  const { t, tx } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>(false);
  const link = <ExternalLink url={folder}>{t("deckUpgrade.backupFolder")}</ExternalLink>;
  return (
    <div ref={ref} class="warning migration" role="region" aria-label={t("deckUpgrade.interruptedRegion")} tabIndex={-1}>
      <p>{tx("deckUpgrade.interrupted", { link })}</p>
      <button
        onClick={() => {
          if (!busy) onRestore();
        }}
        aria-disabled={busy}
      >
        {busy ? t("deckUpgrade.restoring") : t("deckUpgrade.tryRestoring")}
      </button>
      {children}
    </div>
  );
}
