import type { UpdateDocument, UpdateOutcome, UpdateProgress, UpdateStep } from "@solid-memo/domain/instanceUpdate";
import { useId } from "preact/hooks";
import { useI18n, type I18n } from "./i18n";
import { usePanelFocus } from "./panelFocus";
import { StepProgress } from "./StepProgress";

/** What each step of the update does, as the progress line names it. */
function stepLabels(t: I18n["t"]): Record<UpdateStep, string> {
  return {
    read: t("instanceUpdate.step.read"),
    write: t("instanceUpdate.step.write"),
    register: t("instanceUpdate.step.register"),
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
 * While the update runs: which step it is on, and, while it updates the
 * documents one by one, how many are done. Each document is updated or as
 * it was at every moment, so a page closed half-way leaves the rest to
 * update later.
 */
export function InstanceUpdateProgress({ progress }: { progress: UpdateProgress }) {
  const { t } = useI18n();
  const labels = stepLabels(t);
  const step = labels[progress.step];
  const { part } = progress;
  return (
    <StepProgress
      region={t("instanceUpdate.progressRegion")}
      steps={(Object.keys(labels) as UpdateStep[]).map((entry) => ({ step: entry, label: labels[entry] }))}
      current={progress.step}
      done={progress.done}
      total={progress.total}
      part={part}
      count={part === undefined ? undefined : t("instanceUpdate.count", { done: part.done, count: part.total })}
      status={t("instanceUpdate.running", { step })}
      progressLabel={t("instanceUpdate.progressLabel")}
      hint={t("instanceUpdate.keepOpen")}
    />
  );
}

/** A document as the user knows it: the instance's record, its preferences, its catalogue, or a deck's cards or review states. */
export function documentName(document: UpdateDocument, { t, readerText }: Pick<I18n, "t" | "readerText">): string {
  switch (document.holds) {
    case "cards":
    case "reviews":
      return t(`instanceUpdate.document.${document.holds}`, { deck: readerText(document.deck!) });
    default:
      return t(`instanceUpdate.document.${document.holds}`);
  }
}

/**
 * When the update could not update every document: which ones are left,
 * each with why, how many it did update, and that every document can be
 * read as it is, updated or not; trying again updates only what is still
 * outdated. It takes the progress's place and its focus, so it is read
 * out.
 */
export function InstanceUpdateResult({
  outcome,
  onRetry,
  onDismiss,
}: {
  outcome: UpdateOutcome;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const i18n = useI18n();
  const { t, tx, errorText } = i18n;
  const ref = usePanelFocus<HTMLDivElement>();
  const whyId = useId();
  const { updated, failed } = outcome;
  return (
    <div
      ref={ref}
      class="warning migration"
      role="region"
      aria-label={t("instanceUpdate.resultRegion")}
      aria-describedby={whyId}
      tabIndex={-1}
    >
      <div id={whyId}>
        <p>
          <strong>{t("instanceUpdate.notFinished", { count: failed.length })}</strong>
        </p>
        <ul>
          {failed.map((failure) => (
            <li key={failure.url}>
              {tx("instanceUpdate.failedItem", { document: documentName(failure, i18n), reason: errorText(failure.error) })}
            </li>
          ))}
        </ul>
        <p>
          {updated.length > 0 && `${t("instanceUpdate.updatedAlso", { count: updated.length })} `}
          {t("instanceUpdate.retryHint")}
        </p>
      </div>
      <div class="edit-actions">
        <button class="primary" onClick={onRetry}>
          {t("instanceUpdate.tryAgain")}
        </button>
        <button onClick={onDismiss}>{t("instanceUpdate.close")}</button>
      </div>
    </div>
  );
}
