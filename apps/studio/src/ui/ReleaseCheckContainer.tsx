import { useState } from "preact/hooks";
import type { UseCases } from "@solid-memo/application/useCases";
import { checkProblems, type CheckPolicy } from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { useDraftEditor } from "./draftEditor";
import { useReleaseCheck, useShapeCheck } from "./releaseCheck";
import { ReleaseCheckScreen, type ReleaseCheckLinks } from "./ReleaseCheckScreen";

/**
 * A draft's release check, over the draft as its editor keeps it
 * (useDraftEditor): its rules for the policy as the draft changes, and
 * the shapes for the version of it they were asked of.
 */
export function ReleaseCheckContainer({
  useCases,
  draftUrl,
  policy,
  links,
}: {
  useCases: UseCases;
  draftUrl: string;
  policy: CheckPolicy;
  links: ReleaseCheckLinks;
}) {
  const editor = useDraftEditor(useCases, draftUrl);
  const draft = editor.draft!;
  const check = useReleaseCheck(useCases, draft, policy);
  const [asked, setAsked] = useState<ReleaseDraft | null>(null);
  const shapes = useShapeCheck(useCases, asked, policy);
  const found = shapes.data;
  return (
    <ReleaseCheckScreen
      draft={draft}
      policy={policy}
      problems={check.data === undefined ? undefined : checkProblems({ ...check.data, shapes: found ?? null })}
      error={check.error}
      shapes={{ asked: asked !== null, running: shapes.isFetching, stale: asked !== null && asked !== draft, problems: found, error: shapes.error }}
      links={links}
      // The same version asked again only after the shapes failed: the query is run again, its key the same.
      onCheckShapes={() => (asked === draft ? void shapes.refetch() : setAsked(draft))}
    />
  );
}
