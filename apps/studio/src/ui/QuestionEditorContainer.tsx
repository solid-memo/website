import type { UseCases } from "@solid-memo/application/useCases";
import { useDraftEditor } from "./draftEditor";
import type { DraftLinks } from "./DraftOverviewScreen";
import { QuestionEditorScreen } from "./QuestionEditorScreen";

/** A card of a draft, over the draft as its editor keeps it (useDraftEditor); `onDeleted` leaves it once it is deleted. */
export function QuestionEditorContainer({
  useCases,
  draftUrl,
  card,
  links,
  onDeleted,
}: {
  useCases: UseCases;
  draftUrl: string;
  card: string;
  links: DraftLinks;
  onDeleted: () => void;
}) {
  const editor = useDraftEditor(useCases, draftUrl);
  return (
    <QuestionEditorScreen
      draft={editor.draft!}
      card={card}
      readOnly={editor.readOnly}
      status={editor}
      links={links}
      onEdit={editor.edit}
      onDeleted={onDeleted}
    />
  );
}
