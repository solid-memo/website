import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { useDraftEditor } from "./draftEditor";
import { revisionOf } from "./releaseCheck";
import { ReleaseDiffScreen, type ReleaseDiffLinks } from "./ReleaseDiffScreen";

/**
 * A draft against the release it follows, over the draft as its editor
 * keeps it (useDraftEditor): each version of the draft compared once,
 * the last one's diff shown while a newer one is made.
 */
export function ReleaseDiffContainer({ useCases, draftUrl, links }: { useCases: UseCases; draftUrl: string; links: ReleaseDiffLinks }) {
  const editor = useDraftEditor(useCases, draftUrl);
  const draft = editor.draft!;
  const diff = useQuery({
    queryKey: ["releaseDiff", draft.url, revisionOf(draft)],
    queryFn: () => useCases.diffReleaseDraft(draft),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
  return <ReleaseDiffScreen draft={draft} diff={diff.data} error={diff.error} links={links} />;
}
