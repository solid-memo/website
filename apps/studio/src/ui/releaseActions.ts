import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreatedDraft } from "@solid-memo/application/releaseDrafts";
import type { UseCases } from "@solid-memo/application/useCases";
import { catalogScope } from "@solid-memo/ui/deckTreeEditor";
import { draftKey } from "./draftEditor";
import { draftsKey } from "./DraftsContainer";

/**
 * What the release screen and the releases screen share (docs/studio.md,
 * Publishing a release): the query of the instance's releases, whether
 * one is public, making one public again, and starting the next version
 * of one.
 */

/** The query of the releases an instance published. */
export function publishedKey(instanceUrl: string): readonly unknown[] {
  return ["publishedReleases", instanceUrl];
}

/** The query of whether a release is public. */
export function publicKey(url: string): readonly unknown[] {
  return ["releasePublic", url];
}

/** Make a release public again; then it, and the instance's releases, are asked afresh. */
export function useMakePublic(useCases: UseCases, instanceUrl: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => {
      await useCases.makeReleasePublic(url);
      return url;
    },
    onSettled: (_done, _error, url) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: publicKey(url) }),
        queryClient.invalidateQueries({ queryKey: publishedKey(instanceUrl) }),
      ]),
  });
}

/**
 * Start the next version of a release as a draft of the instance, then
 * `onStarted` with it. It writes the catalogue, so it waits its turn with
 * the catalogue's other writes; the drafts are read afresh after it, and
 * what was read at the new draft's URL is forgotten.
 */
export function useStartNextVersion(useCases: UseCases, instanceUrl: string, onStarted: (created: CreatedDraft) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: catalogScope(instanceUrl) },
    mutationFn: async (url: string) => (await useCases.createReleaseDraft(instanceUrl, { kind: "nextVersionOf", url }))!,
    onSuccess: (created) => {
      queryClient.removeQueries({ queryKey: draftKey(created.draft.url) });
      onStarted(created);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: draftsKey(instanceUrl) }),
  });
}
