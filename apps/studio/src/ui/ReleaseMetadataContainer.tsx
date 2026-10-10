import type { CreatedDraft } from "@solid-memo/application/releaseDrafts";
import type { UseCases } from "@solid-memo/application/useCases";
import type { ReleaseField } from "@solid-memo/domain/release/releaseCheck";
import { useDraftEditor } from "./draftEditor";
import { ReleaseMetadataScreen, type ReleaseLinks } from "./ReleaseMetadataScreen";
import { ReleasePublishContainer } from "./ReleasePublishContainer";
import type { ReleasePublishLinks } from "./ReleasePublishScreen";

/**
 * A draft's release screen, over the draft as its editor keeps it
 * (useDraftEditor): read once (the workspace waits for it), and changed
 * as the user edits it. Its metadata and provenance first, then its
 * publishing, which waits for what is typed above it to be saved.
 */
export function ReleaseMetadataContainer({
  useCases,
  draftUrl,
  links,
  publishLinks,
  field,
  onStarted,
}: {
  useCases: UseCases;
  draftUrl: string;
  links: ReleaseLinks;
  publishLinks: ReleasePublishLinks;
  field?: ReleaseField;
  onStarted: (created: CreatedDraft) => void;
}) {
  const editor = useDraftEditor(useCases, draftUrl);
  return (
    <>
      <ReleaseMetadataScreen
        draft={editor.draft!}
        readOnly={editor.readOnly}
        status={editor}
        links={links}
        {...(field === undefined ? {} : { field })}
        onEdit={editor.edit}
      />
      <ReleasePublishContainer useCases={useCases} editor={editor} links={publishLinks} onStarted={onStarted} />
    </>
  );
}
