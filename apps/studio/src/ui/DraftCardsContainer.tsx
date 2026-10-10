import type { UseCases } from "@solid-memo/application/useCases";
import { useDraftEditor } from "./draftEditor";
import { DraftCardsScreen, type DraftCardsView } from "./DraftCardsScreen";
import type { DraftLinks } from "./DraftOverviewScreen";

/** A draft's cards as a table, over the draft as its editor keeps it (useDraftEditor); the view is the URL's (`onView`). */
export function DraftCardsContainer({
  useCases,
  draftUrl,
  view,
  links,
  onView,
}: {
  useCases: UseCases;
  draftUrl: string;
  view: DraftCardsView;
  links: DraftLinks;
  onView: (view: DraftCardsView) => void;
}) {
  const editor = useDraftEditor(useCases, draftUrl);
  return <DraftCardsScreen draft={editor.draft!} view={view} readOnly={editor.readOnly} status={editor} links={links} onView={onView} onEdit={editor.edit} />;
}
