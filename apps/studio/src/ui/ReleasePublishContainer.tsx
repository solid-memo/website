import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatedDraft } from "@solid-memo/application/releaseDrafts";
import type { UseCases } from "@solid-memo/application/useCases";
import { draftPlaceOf } from "@solid-memo/domain/release/draftLayout";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { catalogScope } from "@solid-memo/ui/deckTreeEditor";
import { useI18n } from "@solid-memo/ui/i18n";
import { draftKey, type DraftEditor } from "./draftEditor";
import { draftsKey } from "./DraftsContainer";
import { markdownCheck, useReleaseCheck } from "./releaseCheck";
import { publicKey, publishedKey, useMakePublic, useStartNextVersion } from "./releaseActions";
import { ReleasePublishScreen, type ReleasePublishLinks } from "./ReleasePublishScreen";

/**
 * The release screen's publishing, over the draft as its editor keeps it
 * (`editor`, the metadata's above it): the release check's errors as the
 * draft changes; publishing it (publishRelease), which writes the
 * catalogue, so it waits its turn with the catalogue's other writes, and
 * is held while the catalogue may not be written (useDataCheck); then
 * the draft, the drafts and the releases are read afresh, the draft now
 * released. Whether its release is public, making it so again, its next
 * version, and the release saved as a file.
 */
export function ReleasePublishContainer({
  useCases,
  editor,
  links,
  onStarted,
}: {
  useCases: UseCases;
  editor: DraftEditor;
  links: ReleasePublishLinks;
  /** A next version started: its draft. */
  onStarted: (created: CreatedDraft) => void;
}) {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();
  const draft = editor.draft!;
  // A draft's screens are routed only at a draft's URL.
  const { instanceUrl } = draftPlaceOf(draft.url)!;
  const check = useDataCheck(useCases, instanceUrl);
  const rules = useReleaseCheck(useCases, draft, "pod");
  const released = draft.root.releasedAs;
  const publicQuery = useQuery({
    queryKey: publicKey(released ?? ""),
    queryFn: () => useCases.isReleasePublic(released!),
    enabled: released !== undefined,
  });
  const publishMutation = useMutation({
    scope: { id: catalogScope(instanceUrl) },
    mutationFn: (url: string) => useCases.publishRelease(draft.url, url, markdownCheck),
    onSuccess: (published) => queryClient.setQueryData(publicKey(published.url), published.public),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: draftKey(draft.url) }),
        queryClient.invalidateQueries({ queryKey: draftsKey(instanceUrl) }),
        queryClient.invalidateQueries({ queryKey: publishedKey(instanceUrl) }),
      ]),
  });
  const publicMutation = useMakePublic(useCases, instanceUrl);
  const nextMutation = useStartNextVersion(useCases, instanceUrl, onStarted);
  const downloadMutation = useMutation({ mutationFn: () => useCases.downloadRelease(draft.url) });
  const errors = rules.data === undefined ? undefined : [...rules.data.rules, ...rules.data.drops, ...rules.data.markdown].filter((one) => one.severity === "error").length;
  return (
    <ReleasePublishScreen
      draft={draft}
      hold={check.readOnly() ?? (check.arrangementSetAside ? "setAside" : null)}
      saving={editor.saving}
      errors={errors}
      links={links}
      publish={{ pending: publishMutation.isPending, error: errorText(publishMutation.error), run: (url) => publishMutation.mutate(url) }}
      isPublic={publicQuery.data}
      makePublic={{ pending: publicMutation.isPending, error: errorText(publicMutation.error), run: (url) => publicMutation.mutate(url) }}
      startNext={{ pending: nextMutation.isPending, error: errorText(nextMutation.error), run: (url) => nextMutation.mutate(url) }}
      download={{ pending: downloadMutation.isPending, error: errorText(downloadMutation.error), run: () => downloadMutation.mutate() }}
      downloaded={downloadMutation.data ?? null}
    />
  );
}
