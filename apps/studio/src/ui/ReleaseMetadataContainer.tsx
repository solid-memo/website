import type { UseCases } from "@solid-memo/application/useCases";
import type { ReleaseField } from "@solid-memo/domain/release/releaseCheck";
import { useDraftEditor } from "./draftEditor";
import { ReleaseMetadataScreen, type ReleaseLinks } from "./ReleaseMetadataScreen";

/**
 * A draft's release metadata and provenance, over the draft as its
 * editor keeps it (useDraftEditor): read once (the workspace waits for
 * it), and changed as the user edits it.
 */
export function ReleaseMetadataContainer({
  useCases,
  draftUrl,
  links,
  field,
}: {
  useCases: UseCases;
  draftUrl: string;
  links: ReleaseLinks;
  field?: ReleaseField;
}) {
  const editor = useDraftEditor(useCases, draftUrl);
  return (
    <ReleaseMetadataScreen
      draft={editor.draft!}
      readOnly={editor.readOnly}
      status={editor}
      links={links}
      {...(field === undefined ? {} : { field })}
      onEdit={editor.edit}
    />
  );
}
