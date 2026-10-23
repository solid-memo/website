// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { StepPart } from "@solid-memo/domain/deckUpgrade";

/**
 * The progress of an update through its `total` steps, reported as it
 * goes: the step it is on, the steps finished and, for a step with more
 * than one unit of work (documents, decks, writes), how far into it.
 */
export function stepReporter<Step extends string>(
  first: Step,
  total: number,
  onProgress: (progress: { step: Step; done: number; total: number; part?: StepPart }) => void,
) {
  let step = first;
  let done = 0;
  let part: StepPart | undefined;
  const report = () =>
    onProgress({ step, done, total, ...(part === undefined ? {} : { part: { ...part } }) });
  const enter = (next: Step, parts: number | undefined) => {
    step = next;
    part = parts === undefined ? undefined : { done: 0, total: parts };
    report();
  };
  return {
    step: () => step,
    /** Under way, at the first step, of `parts` units of work when it has more than one. */
    start(parts?: number) {
      enter(first, parts);
    },
    /** The step is finished: on to `next` (the same, after the last), of `parts` units of work. */
    finished(next: Step = step, parts?: number) {
      done += 1;
      enter(next, parts);
    },
    /** `count` of the step's `of` units done; not reported once all are, the step's finish is. */
    partly(count: number, of = part!.total) {
      part = { done: count, total: of };
      if (count < of) report();
    },
    /** One more of the step's units done. */
    stepped() {
      this.partly(part!.done + 1);
    },
  };
}
