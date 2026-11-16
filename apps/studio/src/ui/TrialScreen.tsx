// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import { problemTarget, type ProblemTarget } from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { PROBLEM_LIMIT } from "./ProblemList";
import { problemMessage, subjectName } from "./problemText";
import { bounded } from "./ReleaseLists";
import { useScreenKeys } from "./shell/useShortcuts";

/**
 * A draft's trial (docs/studio.md, The trial): what it is, the way to
 * start it over or to play the draft as it is now, then the trial being
 * set up, why it could not be (`error`), the problems that keep the
 * draft from being played (each a link to its field, at most
 * PROBLEM_LIMIT of them, and how many more there are), or the trial
 * itself (`children`). The digits are the trial's, as they are a
 * learner's (a grade, an option), never the draft's tabs: a digit the
 * trial has no use for just then does nothing.
 */
export function TrialScreen({
  draft,
  opening,
  error,
  problems,
  targetHref,
  onReset,
  onReload,
  children,
}: {
  /** The draft played, or to be. */
  draft: ReleaseDraft;
  /** The trial is being set up. */
  opening: boolean;
  /** Why it could not be. */
  error: unknown;
  /** What keeps the draft from being played; null when nothing does, or until it is known. */
  problems: readonly ReleaseProblem[] | null;
  targetHref: (target: ProblemTarget) => string;
  onReset: () => void;
  onReload: () => void;
  children?: ComponentChildren;
}) {
  const i18n = useI18n();
  const { t, errorText } = i18n;
  useScreenKeys((event, key) => {
    if (/^[1-9]$/.test(key)) event.preventDefault();
  });
  const listed = problems === null ? null : bounded(problems, PROBLEM_LIMIT);
  return (
    <section>
      <header>
        <h2>{t("studio.trial.heading")}</h2>
      </header>
      <p class="hint">{t("studio.trial.intro")}</p>
      <p class="actions">
        <button type="button" disabled={opening} onClick={onReset}>
          {t("studio.trial.reset")}
        </button>{" "}
        <button type="button" disabled={opening} onClick={onReload}>
          {t("studio.trial.reload")}
        </button>
      </p>
      {opening ? (
        <Loading label={t("studio.trial.opening")} />
      ) : error ? (
        <ErrorMessage error={errorText(error)} />
      ) : listed !== null ? (
        <>
          <p>{t("studio.trial.notReady")}</p>
          <ul class="studio-health-list release-problems">
            {listed.shown.map((problem, index) => (
              <li key={index}>
                {subjectName(draft, problem.subject, i18n)}:{" "}
                <a href={targetHref(problemTarget(draft, problem))}>
                  {problemMessage(problem, draft, i18n)}
                </a>
              </li>
            ))}
          </ul>
          {listed.more > 0 && <p class="hint">{t("studio.check.more", { count: listed.more })}</p>}
        </>
      ) : (
        children
      )}
    </section>
  );
}
