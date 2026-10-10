import type { UseCases } from "@solid-memo/application/useCases";
import type { StepField } from "@solid-memo/domain/release/releaseCheck";
import { useDraftEditor } from "./draftEditor";
import type { DraftLinks } from "./DraftOverviewScreen";
import { StepEditorScreen } from "./StepEditorScreen";

/** A step of a draft, over the draft as its editor keeps it (useDraftEditor); `onDeleted` leaves it once it is deleted. */
export function StepEditorContainer({
  useCases,
  draftUrl,
  step,
  links,
  field,
  onDeleted,
}: {
  useCases: UseCases;
  draftUrl: string;
  step: string;
  links: DraftLinks;
  field?: StepField;
  onDeleted: () => void;
}) {
  const editor = useDraftEditor(useCases, draftUrl);
  return (
    <StepEditorScreen
      draft={editor.draft!}
      step={step}
      readOnly={editor.readOnly}
      status={editor}
      links={links}
      {...(field === undefined ? {} : { field })}
      onEdit={editor.edit}
      onDeleted={onDeleted}
    />
  );
}
