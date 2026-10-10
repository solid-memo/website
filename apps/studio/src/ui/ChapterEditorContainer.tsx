import type { UseCases } from "@solid-memo/application/useCases";
import { useDraftEditor } from "./draftEditor";
import type { DraftLinks } from "./DraftOverviewScreen";
import { ChapterEditorScreen } from "./ChapterEditorScreen";

/** A chapter of a draft, over the draft as its editor keeps it (useDraftEditor); `onDeleted` leaves it once it is deleted. */
export function ChapterEditorContainer({
  useCases,
  draftUrl,
  chapter,
  links,
  onDeleted,
}: {
  useCases: UseCases;
  draftUrl: string;
  chapter: string;
  links: DraftLinks;
  onDeleted: () => void;
}) {
  const editor = useDraftEditor(useCases, draftUrl);
  return (
    <ChapterEditorScreen
      draft={editor.draft!}
      chapter={chapter}
      readOnly={editor.readOnly}
      status={editor}
      links={links}
      onEdit={editor.edit}
      onDeleted={onDeleted}
    />
  );
}
