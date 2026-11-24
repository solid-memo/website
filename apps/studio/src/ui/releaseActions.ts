// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQueryClient } from "@tanstack/react-query";
import type { CreatedDraft } from "@solid-memo/application/releaseDrafts";
import type { UseCases } from "@solid-memo/application/useCases";
import { catalogScope } from "@solid-memo/ui/deckTreeEditor";
import { changes, useWrite } from "@solid-memo/ui/writeEffects";
import { queryKeys } from "./queryKeys";

/**
 * What the release screen and the releases screen share (docs/studio.md,
 * Publishing a release): the query of the instance's releases, whether
 * one is public, making one public again, and starting the next version
 * of one.
 */

/** Make a release public again, as `webId`; then it, and the instance's releases, are asked afresh. */
export function useMakePublic(useCases: UseCases, instanceUrl: string, webId: string) {
  return useWrite({
    mutationFn: async (url: string) => {
      await useCases.makeReleasePublic(instanceUrl, url, webId);
      return url;
    },
    changes: (url) => [
      changes.reads(queryKeys.releasePublic(url), queryKeys.publishedReleases(instanceUrl)),
    ],
  });
}

/**
 * Start the next version of a release as a draft of the instance, as
 * `webId` (createReleaseDraft), then `onStarted` with it. It writes the catalog, so it waits its turn with
 * the catalog's other writes; the drafts are read afresh after it, and
 * what was read at the new draft's URL is forgotten.
 */
export function useStartNextVersion(
  useCases: UseCases,
  instanceUrl: string,
  webId: string,
  onStarted: (created: CreatedDraft) => void,
) {
  const queryClient = useQueryClient();
  return useWrite({
    scope: { id: catalogScope(instanceUrl) },
    mutationFn: async (url: string) =>
      (await useCases.createReleaseDraft(instanceUrl, { kind: "nextVersionOf", url }, webId))!,
    changes: () => [changes.reads(queryKeys.releaseDrafts(instanceUrl))],
    onSuccess: (created) => {
      queryClient.removeQueries({ queryKey: queryKeys.releaseDraft(created.draft.url) });
      onStarted(created);
    },
  });
}
