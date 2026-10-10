import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import { readWhole, type CheckPolicy, type ReleaseCheck } from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { releaseMarkdownCheck } from "@solid-memo/ui/markdownCache";

/**
 * The release check of a draft as the Studio's screens run it (docs/
 * studio.md, The release check): over the draft as its editor keeps it,
 * changes not yet written included, so a problem fixed clears at once.
 * Each version of the draft (each draft the editor makes) is checked
 * once, unless a part of it could not be read (previousUnread,
 * libraryUnread): such a check is checked again whenever it is shown
 * anew, or when asked (refetch). The Markdown of a text is read once by each rule, whatever
 * version it is in.
 */

/** The Markdown check every check of this page shares, a release's publishing among them, every text remembered (releaseMarkdownCheck). */
export const markdownCheck = releaseMarkdownCheck();

const revisions = new WeakMap<ReleaseDraft, number>();
let latest = 0;

/** A number for each version of a draft: the editor makes a new draft for each change. */
export function revisionOf(draft: ReleaseDraft): number {
  let revision = revisions.get(draft);
  if (revision === undefined) {
    revision = ++latest;
    revisions.set(draft, revision);
  }
  return revision;
}

/**
 * The domain's rules of the draft for the policy, the shapes left out; the
 * last version's while a newer one is checked. A check with a part unread
 * is stale at once, so it is made again when its screen opens again or
 * the window is focused.
 */
export function useReleaseCheck(useCases: UseCases, draft: ReleaseDraft, policy: CheckPolicy) {
  return useQuery<ReleaseCheck>({
    queryKey: ["releaseCheck", draft.url, policy, revisionOf(draft)],
    queryFn: () => useCases.checkReleaseDraft(draft, markdownCheck, policy),
    placeholderData: keepPreviousData,
    staleTime: (query) => (query.state.data === undefined || readWhole(query.state.data) ? Infinity : 0),
  });
}

/** What the shapes say of the version of the draft they were asked of (`asked`); nothing until they are. */
export function useShapeCheck(useCases: UseCases, asked: ReleaseDraft | null, policy: CheckPolicy) {
  return useQuery<ReleaseProblem[]>({
    queryKey: ["releaseShapes", asked?.url, policy, asked === null ? 0 : revisionOf(asked)],
    queryFn: async () => (await useCases.checkReleaseDraft(asked!, markdownCheck, policy, { shapes: true })).shapes!,
    enabled: asked !== null,
    staleTime: Infinity,
  });
}
