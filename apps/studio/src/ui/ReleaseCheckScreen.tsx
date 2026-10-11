// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import {
  CHECK_POLICIES,
  isUnread,
  type CheckPolicy,
  type ProblemTarget,
} from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { ProblemList } from "./ProblemList";
import { ContextTabs } from "./shell/ContextTabs";

/** Where the release check links: the check for another policy, and a problem's place in the editors. */
export interface ReleaseCheckLinks {
  policyHref: (policy: CheckPolicy) => string;
  targetHref: (target: ProblemTarget) => string;
}

/** The shapes' part of the check: asked or not, running, for an older version of the draft, and what they found. */
export interface ShapesState {
  asked: boolean;
  running: boolean;
  /** The draft changed since the shapes were asked: what they found is the older version's. */
  stale: boolean;
  problems: ReleaseProblem[] | undefined;
  error: unknown;
}

/**
 * A draft's release check (docs/studio.md, The release check): for a
 * pod or for the Solid Memo library (`policy`, a link each), every
 * problem the rules find (ProblemList), by severity and then by what it
 * is in, each subject linking to its editor and each problem to its
 * field there.
 * The shapes and profiles run when asked, their problems among the
 * others; what they found for an older version of the draft says so,
 * with a way to check again. A check a part of which could not be read
 * (the release before, the library's index), or that failed, offers to
 * check again.
 */
export function ReleaseCheckScreen({
  draft,
  policy,
  problems,
  error,
  checking,
  shapes,
  links,
  onCheckShapes,
  onCheckAgain,
}: {
  draft: ReleaseDraft;
  policy: CheckPolicy;
  /** Every problem found; undefined while the draft is first checked. */
  problems: ReleaseProblem[] | undefined;
  error: unknown;
  /** The check is running: the problems shown are those it found before. */
  checking: boolean;
  shapes: ShapesState;
  links: ReleaseCheckLinks;
  onCheckShapes: () => void;
  onCheckAgain: () => void;
}) {
  const { t, errorText } = useI18n();
  const policyLabel = (one: CheckPolicy) =>
    t(one === "pod" ? "studio.check.policyPod" : "studio.check.policyLibrary");
  const incomplete = problems === undefined ? Boolean(error) : problems.some(isUnread);

  return (
    <section>
      <header>
        <h2>{t("studio.check.heading")}</h2>
      </header>
      <p class="hint">{t("studio.check.intro")}</p>
      <ContextTabs
        label={t("studio.check.policy")}
        tabs={CHECK_POLICIES.map((one) => ({
          key: one,
          href: links.policyHref(one),
          label: policyLabel(one),
          current: one === policy && "page",
        }))}
      />
      <p class="hint">
        {t(policy === "pod" ? "studio.check.policyHintPod" : "studio.check.policyHintLibrary")}
      </p>
      {problems === undefined ? (
        error ? (
          <ErrorMessage error={errorText(error)} />
        ) : (
          <Loading label={t("studio.check.checking")} />
        )
      ) : (
        <>
          <p role="status">
            {problems.length === 0
              ? t("studio.check.clear")
              : t("studio.check.summary", { count: problems.length })}
          </p>
          <ProblemList draft={draft} problems={problems} targetHref={links.targetHref} />
        </>
      )}
      {incomplete && (
        <p>
          <button type="button" disabled={checking} onClick={onCheckAgain}>
            {t("studio.check.again")}
          </button>
        </p>
      )}
      <section aria-labelledby="check-shapes">
        <h3 id="check-shapes">{t("studio.check.shapesHeading")}</h3>
        <p class="hint">{t("studio.check.shapesHint")}</p>
        {shapes.running ? (
          <Loading label={t("studio.check.shapesRunning")} />
        ) : (
          <>
            {shapes.error ? <ErrorMessage error={errorText(shapes.error)} /> : null}
            {shapes.problems !== undefined && (
              <p>
                {shapes.problems.length === 0
                  ? t("studio.check.shapesClear")
                  : t("studio.check.shapesCount", { count: shapes.problems.length })}
                {shapes.stale && ` ${t("studio.check.shapesStale")}`}
              </p>
            )}
            {(!shapes.asked || shapes.stale || shapes.error) && (
              <button type="button" onClick={onCheckShapes}>
                {t(shapes.asked ? "studio.check.shapesAgain" : "studio.check.shapesRun")}
              </button>
            )}
          </>
        )}
      </section>
    </section>
  );
}
