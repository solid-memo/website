import {
  DECK_UPGRADE_STEPS,
  type DeckUpgradeOutcome,
  type DeckUpgradeStep,
  type StepPart,
} from "@solid-memo/domain/deckUpgrade";
import { useId } from "preact/hooks";
import { useI18n, type I18n } from "./i18n";
import { usePanelFocus } from "./panelFocus";
import { StepProgress } from "./StepProgress";

/** The upgrade's steps as the screen shows them: the use case's, then refreshing what is shown. */
export type DeckUpgradeScreenStep = DeckUpgradeStep | "refresh";

export const DECK_UPGRADE_SCREEN_STEPS: readonly DeckUpgradeScreenStep[] = [...DECK_UPGRADE_STEPS, "refresh"];

function stepLabel(t: I18n["t"], step: DeckUpgradeScreenStep): string {
  return t(`deckUpgrade.step.${step}`);
}

/** While a library deck upgrade runs: every step, the one it is on, and how far along it is. */
export function DeckUpgradeProgress({
  step,
  done,
  part,
}: {
  step: DeckUpgradeScreenStep;
  done: number;
  /** How far into `step` it is, for a step of more than one read or write. */
  part?: StepPart;
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
      status={t("deckUpgrade.running", { step: label })}
      progressLabel={t("deckUpgrade.progressLabel")}
      hint={t("deckUpgrade.keepOpen")}
    />
  );
}

/**
 * When the upgrade failed: where, why, and whether the deck is as it was
 * (else what was changed since is kept, and the backup is in
 * Preferences). It takes the progress's place and its focus, so the
 * failure is read out.
 */
export function DeckUpgradeFailure({
  outcome,
  onRetry,
  onDismiss,
}: {
  outcome: Extract<DeckUpgradeOutcome, { ok: false }>;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { t, errorText } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>();
  const whyId = useId();
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
      <p>{outcome.asItWas ? t("deckUpgrade.noChanges") : t("deckUpgrade.notAsItWas")}</p>
      <div class="edit-actions">
        <button class="primary" onClick={onRetry}>
          {t("deckUpgrade.tryAgain")}
        </button>
        <button onClick={onDismiss}>{t("deckUpgrade.close")}</button>
      </div>
    </div>
  );
}
