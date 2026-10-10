import type { UseCases } from "@solid-memo/application/useCases";
import { checkProblems, type DraftField } from "@solid-memo/domain/release/releaseCheck";
import { useDraftEditor } from "./draftEditor";
import { DraftOverviewScreen, type DraftLinks } from "./DraftOverviewScreen";
import { useReleaseCheck } from "./releaseCheck";

/**
 * A draft's overview, over the draft as its editor keeps it
 * (useDraftEditor): read once (the workspace waits for it), and changed
 * as the user edits it; its problems the release check's for a pod, as
 * it changes.
 */
export function DraftOverviewContainer({
  useCases,
  draftUrl,
  links,
  field,
}: {
  useCases: UseCases;
  draftUrl: string;
  links: DraftLinks;
  field?: DraftField;
}) {
  const editor = useDraftEditor(useCases, draftUrl);
  const check = useReleaseCheck(useCases, editor.draft!, "pod");
  return (
    <DraftOverviewScreen
      draft={editor.draft!}
      readOnly={editor.readOnly}
      status={editor}
      links={links}
      check={{ problems: check.data === undefined ? undefined : checkProblems(check.data), error: check.error }}
      {...(field === undefined ? {} : { field })}
      onEdit={editor.edit}
    />
  );
}
