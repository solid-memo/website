import type { BackupRestore, KeptDocument } from "@solid-memo/domain/backup";
import type { UpdateOutcome, UpdateProgress, UpdateStep } from "@solid-memo/domain/instanceUpdate";
import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { ExternalLink } from "./ExternalLink";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type I18n } from "./i18n";
import { usePanelFocus } from "./panelFocus";
import { StepProgress } from "./StepProgress";

/** What each step of the update does, as the progress line names it. */
function stepLabels(t: I18n["t"]): Record<UpdateStep, string> {
  return {
    stage: t("instanceUpdate.step.stage"),
    backup: t("instanceUpdate.step.backup"),
    copy: t("instanceUpdate.step.copy"),
    check: t("instanceUpdate.step.check"),
    verify: t("instanceUpdate.step.verify"),
    rewrite: t("instanceUpdate.step.rewrite"),
    validate: t("instanceUpdate.step.validate"),
    tidy: t("instanceUpdate.step.tidy"),
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

/**
 * While the update runs: which step it is on, and how far along it is; or,
 * once it failed after writing, that it puts back what it changed. It
 * cannot be stopped half-way.
 */
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
      status={progress.undoing === true ? t("instanceUpdate.undoing") : t("instanceUpdate.running", { step })}
      progressLabel={t("instanceUpdate.progressLabel")}
      hint={t("instanceUpdate.keepOpen")}
    />
  );
}

/**
 * When the update failed: where, why, and what became of the user's
 * documents — none was changed; every one it changed is back exactly as
 * it was; some changed elsewhere since it wrote them and were kept, each
 * with its earlier version; or putting them back failed, which can be
 * tried again. It takes the progress's place and its focus, so the
 * failure is read out.
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
  /** What trying again to put the documents back did, once it did. */
  restored: BackupRestore | undefined;
  onRestore: () => void;
  onDismiss: () => void;
  /** Trying again's error, if any. */
  children?: ComponentChildren;
}) {
  const { t, tx, errorText } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>();
  const whyId = useId();
  const { undo, backupUrl } = outcome;
  const folder = backupUrl === undefined ? null : <ExternalLink url={backupUrl}>{t("instanceUpdate.backupFolder")}</ExternalLink>;
  const offersRestore = undo?.failed !== undefined && restored === undefined;
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
      {undo !== null && undo.failed !== undefined ? (
        <>
          <p>{tx("instanceUpdate.notPutBack", { link: folder })}</p>
          <ErrorMessage error={errorText(undo.failed)} />
        </>
      ) : undo !== null && undo.kept.length > 0 ? (
        <>
          <p>{t("instanceUpdate.keptChanged", { count: undo.kept.length })}</p>
          <KeptDocuments kept={undo.kept} />
          {undo.restored.length > 0 && <p>{t("backup.restored", { count: undo.restored.length })}</p>}
        </>
      ) : (
        <p>
          {undo === null || undo.restored.length === 0 ? t("instanceUpdate.noChanges") : t("instanceUpdate.putBack")}
          {folder !== null && ` ${t("instanceUpdate.leftover")}`}
        </p>
      )}
      {restored !== undefined && <RestoreResult restored={restored} />}
      <div class="edit-actions">
        {offersRestore && (
          <button
            onClick={() => {
              if (!busy) onRestore();
            }}
            aria-disabled={busy}
          >
            {busy ? t("instanceUpdate.restoring") : t("instanceUpdate.tryRestoring")}
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

/** Documents kept as they are now, changed since an update wrote them, each with its earlier version where the backup has one. */
export function KeptDocuments({ kept }: { kept: readonly KeptDocument[] }) {
  const { t, tx } = useI18n();
  return (
    <ul class="kept-documents">
      {kept.map(({ document, copy }) => (
        <li key={document}>
          {copy === undefined
            ? document
            : tx("backup.keptItem", { document, link: <ExternalLink url={copy}>{t("backup.earlierVersion")}</ExternalLink> })}
        </li>
      ))}
    </ul>
  );
}

/** What restoring a backup did: how many documents it put back, and which it kept, changed since the update. */
export function RestoreResult({ restored }: { restored: BackupRestore }) {
  const { t } = useI18n();
  return (
    <div role="status">
      <p>
        {t("backup.restored", { count: restored.restored.length })}
        {restored.kept.length > 0 && ` ${t("backup.keptSince")}`}
      </p>
      {restored.kept.length > 0 && <KeptDocuments kept={restored.kept} />}
    </div>
  );
}
