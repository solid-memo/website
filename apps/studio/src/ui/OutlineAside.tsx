// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { UseCases } from "@solid-memo/application/useCases";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import { outlineProblems, problemTarget } from "@solid-memo/domain/release/releaseCheck";
import { useDraftEditor } from "./draftEditor";
import { DraftOutline } from "./DraftOutline";
import type { DraftLinks } from "./DraftOverviewScreen";
import { studioRouteToHash, targetRoute } from "./router";

/**
 * A course draft's outline in the Studio's aside (docs/studio.md, The
 * outline), over the draft as its editor keeps it (useDraftEditor): as
 * the overview shows it, to arrange too, the chapter, step or question
 * the page shown edits marked (`currentKey`), and each badge a link to
 * where its first problem is fixed (`problems`, the release check's, as
 * the workspace has them).
 */
export function OutlineAside({
  useCases,
  draftUrl,
  links,
  currentKey,
  problems,
}: {
  useCases: UseCases;
  draftUrl: string;
  links: DraftLinks;
  currentKey: string | null;
  /** The release check's problems; undefined while it is made. */
  problems: readonly ReleaseProblem[] | undefined;
}) {
  const editor = useDraftEditor(useCases, draftUrl);
  const draft = editor.draft!;
  return (
    <DraftOutline
      draft={draft}
      readOnly={editor.readOnly !== null}
      chapterHref={links.chapterHref}
      stepHref={links.stepHref}
      questionHref={links.questionHref}
      checkHref={links.checkHref}
      problems={outlineProblems(draft, problems ?? [])}
      badgeHref={(problem) =>
        studioRouteToHash(targetRoute(draftUrl, problemTarget(draft, problem)))
      }
      currentKey={currentKey}
      onEdit={(changes) => editor.edit(changes)}
    />
  );
}
