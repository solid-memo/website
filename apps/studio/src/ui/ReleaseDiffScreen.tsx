// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DiffElsewhere, DraftDiff } from "@solid-memo/application/releaseDrafts";
import type { ProblemTarget } from "@solid-memo/domain/release/releaseCheck";
import type { SubjectChange } from "@solid-memo/domain/release/releaseDiff";
import {
  distractorCardOf,
  iriIn,
  type ReleaseDraft,
} from "@solid-memo/domain/release/releaseDraft";
import type { ReleaseKind } from "@solid-memo/domain/release/releaseModel";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type I18n, type MessageKey } from "@solid-memo/ui/i18n";
import { describeChanges } from "@solid-memo/ui/LibraryUpgradeNotice";
import { Loading } from "@solid-memo/ui/Loading";
import { OUTLINE_LIMIT } from "./DraftOutline";
import { PROBLEM_LIMIT } from "./ProblemList";
import { idList, problemMessage, subjectName } from "./problemText";
import { bounded, ShowMore, usePage } from "./ReleaseLists";

/** Where the diff links: a subject's place in the draft's editors. */
export interface ReleaseDiffLinks {
  targetHref: (target: ProblemTarget) => string;
}

/** The kinds of subject, in the order the diff lists them. */
const KINDS: readonly ReleaseKind[] = ["chapter", "step", "card", "distractor"];

/** Where a subject of the draft is edited: a wrong option in its card's editor, at it. */
export function subjectTarget(
  draft: ReleaseDraft,
  { kind, id }: Pick<SubjectChange, "kind" | "id">,
): ProblemTarget {
  switch (kind) {
    case "chapter":
      return { screen: "chapter", chapter: id };
    case "step":
      return { screen: "step", step: id };
    case "card":
      return { screen: "question", card: id };
    case "distractor": {
      const card = distractorCardOf(draft, iriIn(draft, id));
      return card === undefined
        ? { screen: "draft" }
        : { screen: "question", card, field: `distractor:${id}` };
    }
  }
}

/**
 * A draft against the release it follows (docs/studio.md, The release
 * diff): the rules of the series it breaks, what it says of itself that
 * it changes, each chapter, step, card and wrong option it adds,
 * changes, retires or restores (a link each to its editor), and what a
 * learner's copy of the release would get from it, progress lost
 * included. A draft of a first release follows none, which it says;
 * one that follows a release of neither the instance nor the library
 * is not compared with it, which it says too. It lists at most
 * PROBLEM_LIMIT of the rules broken, and says how many more there are;
 * OUTLINE_LIMIT of the subjects of each kind at first, and as many
 * more each time; and at most ID_LIMIT of the ids learners would lose
 * progress on, of each kind. A draft can change any number of them.
 */
export function ReleaseDiffScreen({
  draft,
  diff,
  error,
  links,
}: {
  draft: ReleaseDraft;
  /** Undefined while it is made; null for a first release. */
  diff: DraftDiff | DiffElsewhere | null | undefined;
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
        error ? (
          <ErrorMessage error={errorText(error)} />
        ) : (
          <Loading label={t("studio.diff.comparing")} />
        )
      ) : diff === null ? (
        <p>{t("studio.diff.first")}</p>
      ) : "previousElsewhere" in diff ? (
        <p>{t("studio.problem.previousElsewhere", { previous: `<${diff.previousElsewhere}>` })}</p>
      ) : (
        <DiffBody draft={draft} diff={diff} links={links} />
      )}
    </section>
  );
}

function DiffBody({
  draft,
  diff,
  links,
}: {
  draft: ReleaseDraft;
  diff: DraftDiff;
  links: ReleaseDiffLinks;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const { previous, problems, upgrade } = diff;
  const rules = bounded(problems, PROBLEM_LIMIT);
  const { about, subjects, unchanged } = diff.diff;
  const previousVersion = previous.root.version ?? "1";
  return (
    <>
      <p>{t("studio.diff.against", { version: previousVersion, url: previous.url })}</p>
      <section aria-labelledby="diff-rules">
        <h3 id="diff-rules">{t("studio.diff.rules")}</h3>
        {problems.length === 0 ? (
          <p>{t("studio.diff.rulesKept")}</p>
        ) : (
          <>
            <ul class="release-problems">
              {rules.shown.map((problem, index) => (
                <li key={index}>{problemMessage(problem, draft, i18n)}</li>
              ))}
            </ul>
            {rules.more > 0 && <p class="hint">{t("studio.check.more", { count: rules.more })}</p>}
          </>
        )}
      </section>
      <section aria-labelledby="diff-about">
        <h3 id="diff-about">{t("studio.diff.about")}</h3>
        <p>
          {about.length === 0
            ? t("studio.diff.aboutSame")
            : t("studio.diff.aboutChanged", {
                fields: about
                  .map((detail) => t(`studio.diff.detail.${detail}` as MessageKey))
                  .join(", "),
              })}
        </p>
      </section>
      <section aria-labelledby="diff-subjects">
        <h3 id="diff-subjects">{t("studio.diff.subjects")}</h3>
        {subjects.length === 0 && <p>{t("studio.diff.subjectsSame")}</p>}
        {KINDS.map((kind) => {
          const changes = subjects.filter((change) => change.kind === kind);
          return (
            changes.length + unchanged[kind] > 0 && (
              <KindChanges
                key={kind}
                kind={kind}
                changes={changes}
                unchanged={unchanged[kind]}
                draft={draft}
                links={links}
                i18n={i18n}
              />
            )
          );
        })}
      </section>
      <section aria-labelledby="diff-learners">
        <h3 id="diff-learners">{t("studio.diff.learners")}</h3>
        <p>
          {!upgrade.newer
            ? t("studio.diff.notNewer", {
                version: draft.root.version ?? "1",
                previous: previousVersion,
              })
            : upgrade.plan === null
              ? t("studio.diff.noUpgrade", { previous: previousVersion })
              : t("studio.diff.upgrade", {
                  previous: previousVersion,
                  changes: describeChanges(upgrade.plan, i18n, t("studio.diff.retiredOnly")),
                })}
        </p>
        {draft.course && <p class="hint">{t("studio.diff.courseLearner")}</p>}
        {upgrade.lost.cards.length + upgrade.lost.chapters.length === 0 ? (
          <p>{t("studio.diff.nothingLost")}</p>
        ) : (
          <ul aria-label={t("studio.diff.lost")}>
            {upgrade.lost.cards.length > 0 && (
              <li>
                {t("studio.diff.lostCards", {
                  count: upgrade.lost.cards.length,
                  ids: idList(upgrade.lost.cards, t),
                })}
              </li>
            )}
            {upgrade.lost.chapters.length > 0 && (
              <li>
                {t("studio.diff.lostChapters", {
                  count: upgrade.lost.chapters.length,
                  ids: idList(upgrade.lost.chapters, t),
                })}
              </li>
            )}
          </ul>
        )}
      </section>
    </>
  );
}

/** The subjects of one kind the draft changes: OUTLINE_LIMIT at first, and as many more each time. */
function KindChanges({
  kind,
  changes,
  unchanged,
  draft,
  links,
  i18n,
}: {
  kind: ReleaseKind;
  changes: readonly SubjectChange[];
  unchanged: number;
  draft: ReleaseDraft;
  links: ReleaseDiffLinks;
  i18n: I18n;
}) {
  const { t } = i18n;
  const page = usePage(changes, OUTLINE_LIMIT);
  const statusOf = ({ status, alsoChanged }: SubjectChange) =>
    t(`studio.diff.status.${status}${alsoChanged === true ? "Changed" : ""}` as MessageKey);
  return (
    <div>
      <h4>{t(`studio.diff.kind.${kind}` as MessageKey)}</h4>
      <p class="hint">{t("studio.diff.unchanged", { count: unchanged })}</p>
      {changes.length > 0 && (
        <ul>
          {page.shown.map((change) => (
            <li key={change.id}>
              <a href={links.targetHref(subjectTarget(draft, change))}>
                {subjectName(draft, iriIn(draft, change.id), i18n)}
              </a>
              : {statusOf(change)}
            </li>
          ))}
        </ul>
      )}
      <ShowMore more={page.more} limit={OUTLINE_LIMIT} onShow={page.showMore} />
    </div>
  );
}
