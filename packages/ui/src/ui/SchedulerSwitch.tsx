// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId } from "preact/hooks";
import type { SwitchOutcome, SwitchProgress, SwitchStep } from "@solid-memo/domain/schedulerSwitch";
import { useI18n, type I18n } from "./i18n";
import { usePanelFocus } from "./panelFocus";
import { StepProgress } from "./StepProgress";

/** What each step of the switch does, as the progress line names it. */
function stepLabels(t: I18n["t"]): Record<SwitchStep, string> {
  return {
    read: t("schedulerSwitch.step.read"),
    decks: t("schedulerSwitch.step.decks"),
    preferences: t("schedulerSwitch.step.preferences"),
  };
}

/**
 * While the switch to FSRS-6 runs: which step it is on, and, while it
 * writes the decks one by one, how many are done. Until the preferences
 * are saved SM-2 sets the due days, so a page closed half-way leaves the
 * switch to run again.
 */
export function SchedulerSwitchProgress({ progress }: { progress: SwitchProgress }) {
  const { t } = useI18n();
  const labels = stepLabels(t);
  const { part } = progress;
  return (
    <StepProgress
      region={t("schedulerSwitch.progressRegion")}
      steps={(Object.keys(labels) as SwitchStep[]).map((step) => ({ step, label: labels[step] }))}
      current={progress.step}
      done={progress.done}
      total={progress.total}
      part={part}
      count={
        part === undefined
          ? undefined
          : t("schedulerSwitch.count", { done: part.done, count: part.total })
      }
      status={t("schedulerSwitch.running", { step: labels[progress.step] })}
      progressLabel={t("schedulerSwitch.progressLabel")}
      hint={t("schedulerSwitch.keepOpen")}
    />
  );
}

/**
 * How the switch to FSRS-6 ended. Done: how many decks were switched,
 * how many prompts were worked out from their answers and how many
 * estimated from SM-2, and that every card stays due when it was. Not
 * done: the decks it could not switch now, each with why, how many it
 * did switch, and that SM-2 still sets the due days, to try again. It takes the progress's place and its focus, so it is read
 * out.
 */
export function SchedulerSwitchResult({
  outcome,
  onRetry,
  onClose,
}: {
  outcome: SwitchOutcome;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t, tx, readerText, errorText } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>();
  const bodyId = useId();
  const { switched, decks, replayed, estimated, failed } = outcome;
  const decksLine = decks > 0 && t("schedulerSwitch.decks", { count: decks });
  return (
    <div
      ref={ref}
      class={switched ? "migration" : "warning migration"}
      role="region"
      aria-label={t(switched ? "schedulerSwitch.doneRegion" : "schedulerSwitch.failedRegion")}
      aria-describedby={bodyId}
      tabIndex={-1}
    >
      <div id={bodyId}>
        {switched ? (
          <>
            <p>
              <strong>{t("schedulerSwitch.done")}</strong>
            </p>
            <p>
              {decksLine && `${decksLine} `}
              {replayed > 0 && `${t("schedulerSwitch.replayed", { count: replayed })} `}
              {estimated > 0 && `${t("schedulerSwitch.estimated", { count: estimated })} `}
              {t("schedulerSwitch.dueKept")}
            </p>
          </>
        ) : (
          <>
            <p>
              <strong>{t("schedulerSwitch.notFinished", { count: failed.length })}</strong>
            </p>
            <ul>
              {failed.map((failure) => (
                <li key={failure.url}>
                  {tx("schedulerSwitch.failedItem", {
                    deck: readerText(failure.title),
                    reason: errorText(failure.error),
                  })}
                </li>
              ))}
            </ul>
            <p>
              {decksLine && `${decksLine} `}
              {t("schedulerSwitch.retryHint")}
            </p>
          </>
        )}
      </div>
      <div class="edit-actions">
        {!switched && (
          <button class="primary" onClick={onRetry}>
            {t("schedulerSwitch.tryAgain")}
          </button>
        )}
        <button class={switched ? "primary" : undefined} onClick={onClose}>
          {t(switched ? "schedulerSwitch.continue" : "schedulerSwitch.close")}
        </button>
      </div>
    </div>
  );
}
