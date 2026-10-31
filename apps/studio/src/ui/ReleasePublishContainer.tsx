// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatedDraft } from "@solid-memo/application/releaseDrafts";
import type { UseCases } from "@solid-memo/application/useCases";
import { draftPlaceOf } from "@solid-memo/domain/release/draftLayout";
import { isPublishedReleaseUrl } from "@solid-memo/domain/release/releasePlace";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { catalogScope } from "@solid-memo/ui/deckTreeEditor";
import { useI18n } from "@solid-memo/ui/i18n";
import type { DraftEditor } from "./draftEditor";
import { markdownCheckOf, publishErrors, useReleaseCheck } from "./releaseCheck";
import { useMakePublic, useStartNextVersion } from "./releaseActions";
import { ReleasePublishScreen, type ReleasePublishLinks } from "./ReleasePublishScreen";
import { queryKeys } from "./queryKeys";

/**
 * The release screen's publishing, over the draft as its editor keeps it
 * (`editor`, the metadata's above it): the release check's errors as the
 * draft changes; publishing it (publishRelease), which writes the
 * catalog, so it waits its turn with the catalog's other writes, and
 * is held while the catalog may not be written (useDataCheck); then
 * the draft, the drafts and the releases are read afresh, the draft now
 * released. Whether its release is public (asked only of an address a
 * release may have: isPublishedReleaseUrl), making it so again, its next
 * version, and the release saved as a file.
 */
export function ReleasePublishContainer({
  useCases,
  webId,
  editor,
  links,
  onStarted,
}: {
  useCases: UseCases;
  /** Who makes the release public again (useMakePublic). */
  webId: string;
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
    queryKey: queryKeys.releasePublic(released ?? ""),
    queryFn: () => useCases.isReleasePublic(released!),
    // Asked of an address a release may have only: the draft is data anyone may have written.
    enabled: released !== undefined && isPublishedReleaseUrl(released),
  });
  const publishMutation = useMutation({
    scope: { id: catalogScope(instanceUrl) },
    mutationFn: (url: string) =>
      useCases.publishRelease(draft.url, url, markdownCheckOf(draft.url)),
    onSuccess: (published) =>
      queryClient.setQueryData(queryKeys.releasePublic(published.url), published.public),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.releaseDraft(draft.url) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.releaseDrafts(instanceUrl) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.publishedReleases(instanceUrl) }),
      ]),
  });
  const publicMutation = useMakePublic(useCases, instanceUrl, webId);
  const nextMutation = useStartNextVersion(useCases, instanceUrl, onStarted);
  const downloadMutation = useMutation({ mutationFn: () => useCases.downloadRelease(draft.url) });
  const errors = rules.data === undefined ? undefined : publishErrors(rules.data);
  return (
    <ReleasePublishScreen
      draft={draft}
      hold={check.readOnly() ?? (check.arrangementSetAside ? "setAside" : null)}
      saving={editor.saving}
      errors={errors}
      links={links}
      publish={{
        pending: publishMutation.isPending,
        error: errorText(publishMutation.error),
        run: (url) => publishMutation.mutate(url),
      }}
      isPublic={publicQuery.data}
      makePublic={{
        pending: publicMutation.isPending,
        error: errorText(publicMutation.error),
        run: (url) => publicMutation.mutate(url),
      }}
      startNext={{
        pending: nextMutation.isPending,
        error: errorText(nextMutation.error),
        run: (url) => nextMutation.mutate(url),
      }}
      download={{
        pending: downloadMutation.isPending,
        error: errorText(downloadMutation.error),
        run: () => downloadMutation.mutate(),
      }}
      downloaded={downloadMutation.data ?? null}
    />
  );
}
