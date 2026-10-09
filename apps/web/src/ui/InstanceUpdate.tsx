import type { BackupRestore } from "@solid-memo/domain/backup";
import type { UpdateOutcome, UpdateProgress, UpdateStep } from "@solid-memo/domain/instanceUpdate";
import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { useI18n, type I18n } from "./i18n";
import { usePanelFocus } from "./panelFocus";
import { StepProgress } from "./StepProgress";

/** What each step of the update does, as the progress line names it. */
function stepLabels(t: I18n["t"]): Record<UpdateStep, string> {
  return {
    stage: t("instanceUpdate.step.stage"),
    backup: t("instanceUpdate.step.backup"),
    upgrade: t("instanceUpdate.step.upgrade"),
    validate: t("instanceUpdate.step.validate"),
  };
}

/**
 * Before the update starts: how it keeps the user's data safe, and what
 * changes for them. Nothing happens until they start it. It takes the
 * notice's place, and the focus with it, so the question is read out.
 */
export function InstanceUpdateConfirm({
  instanceName,
  onStart,
  onCancel,
}: {
  instanceName: string;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>();
  const bodyId = useId();
  return (
    <div
      ref={ref}
      class="warning migration"
      role="region"
      aria-label={t("instanceUpdate.confirmRegion")}
      aria-describedby={bodyId}
      tabIndex={-1}
    >
      <p id={bodyId}>
        <strong>{t("instanceUpdate.confirmHeading")}</strong>{" "}
        {t("instanceUpdate.confirmBody", { name: instanceName })}
      </p>
      <div class="edit-actions">
        <button class="primary" onClick={onStart}>
          {t("instanceUpdate.start")}
        </button>
        <button onClick={onCancel}>{t("instanceUpdate.notNow")}</button>
      </div>
    </div>
  );
}

/** While the update runs: which step it is on, and how far along it is. It cannot be stopped half-way. */
export function InstanceUpdateProgress({ progress }: { progress: UpdateProgress }) {
  const { t } = useI18n();
  const labels = stepLabels(t);
  const step = labels[progress.step];
  return (
    <StepProgress
      region={t("instanceUpdate.progressRegion")}
      steps={(Object.keys(labels) as UpdateStep[]).map((entry) => ({ step: entry, label: labels[entry] }))}
      current={progress.step}
      done={progress.done}
      total={progress.total}
      part={progress.part}
      status={t("instanceUpdate.running", { step })}
      progressLabel={t("instanceUpdate.progressLabel")}
      hint={t("instanceUpdate.keepOpen")}
    />
  );
}

/**
 * When the update stopped: where, why, and what it left: nothing changed,
 * or the documents it updated, which stay so, and the backup in
 * Preferences. An instance that does not conform after the update (which
 * should not happen) can be put back from the backup at once. It takes
 * the progress's place and its focus, so the failure is read out.
 */
export function InstanceUpdateFailure({
  outcome,
  busy,
  restored,
  onRestore,
  onDismiss,
  children,
}: {
  outcome: Extract<UpdateOutcome, { ok: false }>;
  busy: boolean;
  /** What restoring the backup did, once it did. */
  restored: BackupRestore | undefined;
  onRestore: () => void;
  onDismiss: () => void;
  /** The restore's error, if any. */
  children?: ComponentChildren;
}) {
  const { t, errorText } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>();
  const whyId = useId();
  const updated = outcome.updated.length;
  const offersRestore = outcome.step === "validate" && outcome.backupUrl !== undefined && restored === undefined;
  return (
    <div
      ref={ref}
      class="warning migration"
      role="region"
      aria-label={t("instanceUpdate.failedRegion")}
      aria-describedby={whyId}
      tabIndex={-1}
    >
      <div id={whyId} class="failure-why">
        <strong>{t("instanceUpdate.failedWhile", { step: stepLabels(t)[outcome.step].toLowerCase() })}</strong>{" "}
        {errorText(outcome.error)}
      </div>
      <p>
        {updated === 0
          ? `${t("instanceUpdate.noChanges")}${outcome.backupUrl === undefined ? "" : ` ${t("instanceUpdate.backupLeft")}`}`
          : t("instanceUpdate.partlyUpdated", { count: updated })}
      </p>
      {restored !== undefined && <RestoreResult restored={restored} />}
      <div class="edit-actions">
        {offersRestore && (
          <button
            onClick={() => {
              if (!busy) onRestore();
            }}
            aria-disabled={busy}
          >
            {busy ? t("backup.restoring") : t("instanceUpdate.restore")}
          </button>
        )}
        <button
          onClick={() => {
            if (!busy) onDismiss();
          }}
          aria-disabled={busy}
        >
          {t("instanceUpdate.close")}
        </button>
      </div>
      {children}
    </div>
  );
}

/** What restoring a backup did: how many documents it put back, and which it kept, changed since the update. */
export function RestoreResult({ restored }: { restored: BackupRestore }) {
  const { t } = useI18n();
  return (
    <p role="status">
      {t("backup.restored", { count: restored.restored.length })}
      {restored.kept.length > 0 && ` ${t("backup.keptSince", { documents: restored.kept.join(", ") })}`}
    </p>
  );
}
