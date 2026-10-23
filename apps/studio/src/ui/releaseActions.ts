// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreatedDraft } from "@solid-memo/application/releaseDrafts";
import type { UseCases } from "@solid-memo/application/useCases";
import { catalogScope } from "@solid-memo/ui/deckTreeEditor";
import { queryKeys } from "./queryKeys";

/**
 * What the release screen and the releases screen share (docs/studio.md,
 * Publishing a release): the query of the instance's releases, whether
 * one is public, making one public again, and starting the next version
 * of one.
 */

/** Make a release public again, as `webId`; then it, and the instance's releases, are asked afresh. */
export function useMakePublic(useCases: UseCases, instanceUrl: string, webId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => {
      await useCases.makeReleasePublic(instanceUrl, url, webId);
      return url;
    },
    onSettled: (_done, _error, url) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.releasePublic(url) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.publishedReleases(instanceUrl) }),
      ]),
  });
}

/**
 * Start the next version of a release as a draft of the instance, then
 * `onStarted` with it. It writes the catalog, so it waits its turn with
 * the catalog's other writes; the drafts are read afresh after it, and
 * what was read at the new draft's URL is forgotten.
 */
export function useStartNextVersion(
  useCases: UseCases,
  instanceUrl: string,
  onStarted: (created: CreatedDraft) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: catalogScope(instanceUrl) },
    mutationFn: async (url: string) =>
      (await useCases.createReleaseDraft(instanceUrl, { kind: "nextVersionOf", url }))!,
    onSuccess: (created) => {
      queryClient.removeQueries({ queryKey: queryKeys.releaseDraft(created.draft.url) });
      onStarted(created);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.releaseDrafts(instanceUrl) }),
  });
}
