import { useId } from "preact/hooks";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import {
  groupProblems,
  problemTarget,
  type ProblemTarget,
} from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { useI18n } from "@solid-memo/ui/i18n";
import { problemMessage, subjectName } from "./problemText";

/**
 * A draft's problems (docs/studio.md, The release check), by severity
 * and then by what they are in (groupProblems), each list named by its
 * severity: each subject links to its editor (`targetHref`), and each
 * problem to its field there. The release check shows them, and the
 * Studio's dock.
 */
export function ProblemList({
  draft,
  problems,
  targetHref,
}: {
  draft: ReleaseDraft;
  problems: readonly ReleaseProblem[];
  targetHref: (target: ProblemTarget) => string;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const id = useId();
  /** The editor of what a problem is in, at none of its fields. */
  const subjectHref = (problem: ReleaseProblem) => {
    const { field: _field, ...editor } = problemTarget(draft, problem);
    return targetHref(editor);
  };
  return (
    <>
      {groupProblems(problems).map((group) => (
        <section key={group.severity} aria-labelledby={`${id}-${group.severity}`}>
          <h3 id={`${id}-${group.severity}`}>
            {t(group.severity === "error" ? "studio.check.errors" : "studio.check.warnings")}
          </h3>
          <ul
            class="studio-health-list release-problems"
            aria-labelledby={`${id}-${group.severity}`}
          >
            {group.subjects.map(({ subject, problems: found }) => (
              <li key={subject}>
                <a href={subjectHref(found[0]!)}>{subjectName(draft, subject, i18n)}</a>
                <ul>
                  {found.map((problem, index) => (
                    <li key={index}>
                      <a href={targetHref(problemTarget(draft, problem))}>
                        {problemMessage(problem, draft, i18n)}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** The problems in the order ProblemList shows them: errors first, each subject's together. */
export function listedProblems(problems: readonly ReleaseProblem[]): ReleaseProblem[] {
  return groupProblems(problems).flatMap((group) =>
    group.subjects.flatMap((subject) => subject.problems),
  );
}
