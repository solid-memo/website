import type { UseCases } from "@solid-memo/application/useCases";
import { useDraftEditor } from "./draftEditor";
import { DraftOverviewScreen, type DraftLinks } from "./DraftOverviewScreen";

/**
 * A draft's overview, over the draft as its editor keeps it
 * (useDraftEditor): read once (the workspace waits for it), and changed
 * as the user edits it.
 */
export function DraftOverviewContainer({ useCases, draftUrl, links }: { useCases: UseCases; draftUrl: string; links: DraftLinks }) {
  const editor = useDraftEditor(useCases, draftUrl);
  return <DraftOverviewScreen draft={editor.draft!} readOnly={editor.readOnly} status={editor} links={links} onEdit={editor.edit} />;
}
