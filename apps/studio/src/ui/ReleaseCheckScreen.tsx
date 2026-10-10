import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import { CHECK_POLICIES, groupProblems, problemTarget, type CheckPolicy, type ProblemTarget } from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { problemMessage, subjectName } from "./problemText";

/** Where the release check links: the check for another policy, a problem's place in the editors, the listing preview. */
export interface ReleaseCheckLinks {
  policyHref: (policy: CheckPolicy) => string;
  targetHref: (target: ProblemTarget) => string;
  previewHref: string;
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
 * problem the rules find, by severity and then by what it is in, each
 * subject linking to its editor and each problem to its field there.
 * The shapes and profiles run when asked, their problems among the
 * others; what they found for an older version of the draft says so,
 * with a way to check again.
 */
export function ReleaseCheckScreen({
  draft,
  policy,
  problems,
  error,
  shapes,
  links,
  onCheckShapes,
}: {
  draft: ReleaseDraft;
  policy: CheckPolicy;
  /** Every problem found; undefined while the draft is first checked. */
  problems: ReleaseProblem[] | undefined;
  error: unknown;
  shapes: ShapesState;
  links: ReleaseCheckLinks;
  onCheckShapes: () => void;
}) {
  const i18n = useI18n();
  const { t, errorText } = i18n;
  const policyLabel = (one: CheckPolicy) => t(one === "pod" ? "studio.check.policyPod" : "studio.check.policyLibrary");
  const hrefOf = (problem: ReleaseProblem) => links.targetHref(problemTarget(draft, problem));
  /** The editor of what a problem is in, at none of its fields. */
  const subjectHref = (problem: ReleaseProblem) => {
    const { field: _field, ...editor } = problemTarget(draft, problem);
    return links.targetHref(editor);
  };

  return (
    <section>
      <header>
        <h2>{t("studio.check.heading")}</h2>
      </header>
      <p class="hint">{t("studio.check.intro")}</p>
      <nav aria-label={t("studio.check.policy")} class="studio-tabs">
        <ul>
          {CHECK_POLICIES.map((one) => (
            <li key={one}>
              <a href={links.policyHref(one)} aria-current={one === policy ? "page" : undefined}>
                {policyLabel(one)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <p class="hint">{t(policy === "pod" ? "studio.check.policyHintPod" : "studio.check.policyHintLibrary")}</p>
      {problems === undefined ? (
        error ? <ErrorMessage error={errorText(error)} /> : <Loading label={t("studio.check.checking")} />
      ) : (
        <>
          <p role="status">{problems.length === 0 ? t("studio.check.clear") : t("studio.check.summary", { count: problems.length })}</p>
          {groupProblems(problems).map((group) => (
            <section key={group.severity} aria-labelledby={`check-${group.severity}`}>
              <h3 id={`check-${group.severity}`}>{t(group.severity === "error" ? "studio.check.errors" : "studio.check.warnings")}</h3>
              <ul class="studio-health-list release-problems">
                {group.subjects.map(({ subject, problems: found }) => (
                  <li key={subject}>
                    <a href={subjectHref(found[0]!)}>{subjectName(draft, subject, i18n)}</a>
                    <ul>
                      {found.map((problem, index) => (
                        <li key={index}>
                          <a href={hrefOf(problem)}>{problemMessage(problem, draft, i18n)}</a>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
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
                {shapes.problems.length === 0 ? t("studio.check.shapesClear") : t("studio.check.shapesCount", { count: shapes.problems.length })}
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
      <p>
        <a href={links.previewHref}>{t("studio.check.previewLink")}</a>
      </p>
    </section>
  );
}
