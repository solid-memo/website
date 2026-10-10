import type { UseCases } from "@solid-memo/application/useCases";
import type { QuestionField } from "@solid-memo/domain/release/releaseCheck";
import { useDraftEditor } from "./draftEditor";
import type { DraftLinks } from "./DraftOverviewScreen";
import { QuestionEditorScreen } from "./QuestionEditorScreen";

/** A card of a draft, over the draft as its editor keeps it (useDraftEditor); `onDeleted` leaves it once it is deleted. */
export function QuestionEditorContainer({
  useCases,
  draftUrl,
  card,
  links,
  field,
  onDeleted,
}: {
  useCases: UseCases;
  draftUrl: string;
  card: string;
  links: DraftLinks;
  field?: QuestionField;
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
      {...(field === undefined ? {} : { field })}
      onEdit={editor.edit}
      onDeleted={onDeleted}
    />
  );
}
