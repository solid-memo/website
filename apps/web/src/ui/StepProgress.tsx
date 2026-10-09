import { useEffect, useState } from "preact/hooks";
import type { StepPart } from "@solid-memo/domain/deckUpgrade";
import { useI18n } from "./i18n";
import { usePanelFocus } from "./panelFocus";

/**
 * Progress through a fixed list of steps — an update that must not be
 * cut off: what it is doing now (announced), how far into it (not
 * announced: a count that moves with every document would drown out
 * everything else), a progress bar, and every step, done, under way or
 * still to come. It takes the place of the
 * button that started it, so it takes the focus, and hands it on to how
 * the update ended.
 */
export function StepProgress<Step extends string>({
  region,
  steps,
  current,
  done,
  total,
  part,
  count,
  status,
  progressLabel,
  hint,
}: {
  /** The region's accessible name. */
  region: string;
  /** Every step, in order, with its label. */
  steps: readonly { step: Step; label: string }[];
  current: Step;
  /** Steps finished, out of `total`. */
  done: number;
  total: number;
  /** How far into the current step; the bar moves on within it. */
  part?: StepPart;
  /** How far into the current step, in words ("3 of 7 documents"); by default "3 of 7". */
  count?: string;
  /** What it is doing now, in a sentence; it changes only with the step. */
  status: string;
  progressLabel: string;
  hint: string;
}) {
  const { t } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>();
  // The region mounts with its first status; held back a frame, that
  // status changes a live region already there, which screen readers
  // hear, rather than arriving with it, which they often miss.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const at = steps.findIndex((entry) => entry.step === current);
  const finished = total > 0 && done >= total;
  return (
    <div ref={ref} class="warning migration" role="region" aria-label={region} tabIndex={-1}>
      <p role="status">{shown ? status : ""}</p>
      {part !== undefined && <p class="hint">{count ?? t("stepProgress.count", { done: part.done, total: part.total })}</p>}
      <progress
        value={done + (part === undefined ? 0 : Math.min(part.done / Math.max(part.total, 1), 1))}
        max={Math.max(total, 1)}
        aria-label={progressLabel}
      />
      <ol class="step-list">
        {steps.map(({ step, label }, index) => {
          const state = finished || index < at ? "done" : index === at ? "current" : "waiting";
          return (
            <li key={step} class={`step-${state}`} aria-current={state === "current" ? "step" : undefined}>
              <span class="step-mark" aria-hidden="true">
                {state === "done" ? "✓" : state === "current" ? "➜" : "·"}
              </span>
              {label}
              {state !== "waiting" && <span class="visually-hidden"> ({t(`stepProgress.${state}`)})</span>}
            </li>
          );
        })}
      </ol>
      <p class="hint">{hint}</p>
    </div>
  );
}
