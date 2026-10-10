import type { DraftDiff } from "@solid-memo/application/releaseDrafts";
import type { ProblemTarget } from "@solid-memo/domain/release/releaseCheck";
import type { SubjectChange } from "@solid-memo/domain/release/releaseDiff";
import { iriIn, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import type { ReleaseKind } from "@solid-memo/domain/release/releaseModel";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type MessageKey } from "@solid-memo/ui/i18n";
import { describeChanges } from "@solid-memo/ui/LibraryUpgradeNotice";
import { Loading } from "@solid-memo/ui/Loading";
import { problemMessage, subjectName } from "./problemText";

/** Where the diff links: a subject's place in the draft's editors. */
export interface ReleaseDiffLinks {
  targetHref: (target: ProblemTarget) => string;
}

/** The kinds of subject, in the order the diff lists them. */
const KINDS: readonly ReleaseKind[] = ["chapter", "step", "card", "distractor"];

/** Where a subject of the draft is edited: a wrong option in its card's editor, at it. */
export function subjectTarget(draft: ReleaseDraft, { kind, id }: Pick<SubjectChange, "kind" | "id">): ProblemTarget {
  switch (kind) {
    case "chapter":
      return { screen: "chapter", chapter: id };
    case "step":
      return { screen: "step", step: id };
    case "card":
      return { screen: "question", card: id };
    case "distractor": {
      const card = draft.cards.find((node) => node.data.distractor.includes(iriIn(draft, id)));
      return card === undefined ? { screen: "draft" } : { screen: "question", card: card.id, field: `distractor:${id}` };
    }
  }
}

/**
 * A draft against the release it follows (docs/studio.md, The release
 * diff): the rules of the series it breaks, what it says of itself that
 * it changes, each chapter, step, card and wrong option it adds,
 * changes, retires or restores (a link each to its editor), and what a
 * learner's copy of the release would get from it, progress lost
 * included. A draft of a first release follows none, which it says.
 */
export function ReleaseDiffScreen({
  draft,
  diff,
  error,
  links,
}: {
  draft: ReleaseDraft;
  /** Undefined while it is made; null for a first release. */
  diff: DraftDiff | null | undefined;
  error: unknown;
  links: ReleaseDiffLinks;
}) {
  const i18n = useI18n();
  const { t, errorText } = i18n;
  return (
    <section>
      <header>
        <h2>{t("studio.diff.heading")}</h2>
      </header>
      <p class="hint">{t("studio.diff.intro")}</p>
      {diff === undefined ? (
        error ? <ErrorMessage error={errorText(error)} /> : <Loading label={t("studio.diff.comparing")} />
      ) : diff === null ? (
        <p>{t("studio.diff.first")}</p>
      ) : (
        <DiffBody draft={draft} diff={diff} links={links} />
      )}
    </section>
  );
}

function DiffBody({ draft, diff, links }: { draft: ReleaseDraft; diff: DraftDiff; links: ReleaseDiffLinks }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { previous, problems, upgrade } = diff;
  const { about, subjects, unchanged } = diff.diff;
  const previousVersion = previous.root.version ?? "1";
  const statusOf = ({ status, alsoChanged }: SubjectChange) => t(`studio.diff.status.${status}${alsoChanged === true ? "Changed" : ""}` as MessageKey);
  return (
    <>
      <p>{t("studio.diff.against", { version: previousVersion, url: previous.url })}</p>
      <section aria-labelledby="diff-rules">
        <h3 id="diff-rules">{t("studio.diff.rules")}</h3>
        {problems.length === 0 ? (
          <p>{t("studio.diff.rulesKept")}</p>
        ) : (
          <ul class="release-problems">
            {problems.map((problem, index) => (
              <li key={index}>{problemMessage(problem, draft, i18n)}</li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="diff-about">
        <h3 id="diff-about">{t("studio.diff.about")}</h3>
        <p>
          {about.length === 0
            ? t("studio.diff.aboutSame")
            : t("studio.diff.aboutChanged", { fields: about.map((detail) => t(`studio.diff.detail.${detail}` as MessageKey)).join(", ") })}
        </p>
      </section>
      <section aria-labelledby="diff-subjects">
        <h3 id="diff-subjects">{t("studio.diff.subjects")}</h3>
        {subjects.length === 0 && <p>{t("studio.diff.subjectsSame")}</p>}
        {KINDS.map((kind) => {
          const changes = subjects.filter((change) => change.kind === kind);
          return (
            changes.length + unchanged[kind] > 0 && (
              <div key={kind}>
                <h4>{t(`studio.diff.kind.${kind}` as MessageKey)}</h4>
                <p class="hint">{t("studio.diff.unchanged", { count: unchanged[kind] })}</p>
                {changes.length > 0 && (
                  <ul>
                    {changes.map((change) => (
                      <li key={change.id}>
                        <a href={links.targetHref(subjectTarget(draft, change))}>{subjectName(draft, iriIn(draft, change.id), i18n)}</a>: {statusOf(change)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          );
        })}
      </section>
      <section aria-labelledby="diff-learners">
        <h3 id="diff-learners">{t("studio.diff.learners")}</h3>
        <p>
          {!upgrade.newer
            ? t("studio.diff.notNewer", { version: draft.root.version ?? "1", previous: previousVersion })
            : upgrade.plan === null
              ? t("studio.diff.noUpgrade", { previous: previousVersion })
              : t("studio.diff.upgrade", { previous: previousVersion, changes: describeChanges(upgrade.plan, i18n, t("studio.diff.retiredOnly")) })}
        </p>
        {draft.course && <p class="hint">{t("studio.diff.courseLearner")}</p>}
        {upgrade.lost.cards.length + upgrade.lost.chapters.length === 0 ? (
          <p>{t("studio.diff.nothingLost")}</p>
        ) : (
          <ul aria-label={t("studio.diff.lost")}>
            {upgrade.lost.cards.length > 0 && <li>{t("studio.diff.lostCards", { count: upgrade.lost.cards.length, ids: upgrade.lost.cards.join(", ") })}</li>}
            {upgrade.lost.chapters.length > 0 && (
              <li>{t("studio.diff.lostChapters", { count: upgrade.lost.chapters.length, ids: upgrade.lost.chapters.join(", ") })}</li>
            )}
          </ul>
        )}
      </section>
    </>
  );
}
