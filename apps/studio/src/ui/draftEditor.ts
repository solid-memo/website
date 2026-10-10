import { useEffect, useRef, useState } from "preact/hooks";
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DraftEdit } from "@solid-memo/application/releaseDrafts";
import type { UseCases } from "@solid-memo/application/useCases";
import { changedDocuments, draftPlaceOf } from "@solid-memo/domain/release/draftLayout";
import { applyDraftChanges, isRefusal, type DraftChange, type DraftRefusal, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { useDataCheck, type ReadOnlyReason } from "@solid-memo/ui/dataCheck";

/** The query of a draft: its screens, and the workspace's trail, share it. */
export function draftKey(draftUrl: string): readonly unknown[] {
  return ["releaseDraft", draftUrl];
}

/** The queue a write of a draft waits in, after the draft's writes before it, whatever their documents. */
export function draftScope(draftUrl: string): string {
  return `draft ${draftUrl}`;
}

/** How long a draft's text waits after the last keystroke before it is written. */
export const DEBOUNCE_MS = 800;

/** Why a draft is not changed now: it was released, or the instance's data check holds it (useDataCheck). */
export type DraftReadOnly = "released" | ReadOnlyReason;

/** The last write of the draft that failed: refused (the draft as it now is refused it), or an error. */
export type DraftFailure = { refusal: DraftRefusal } | { error: unknown };

export interface DraftEditor {
  /** The draft as the user has made it: what the pod has, with the changes not yet written. Undefined while it is read. */
  draft: ReleaseDraft | undefined;
  /** Why it could not be read. */
  error: unknown;
  readOnly: DraftReadOnly | null;
  /**
   * Make changes: at once on the screen, then in the pod. With
   * `debounce` (typing), the write waits until the document has had no
   * other for DEBOUNCE_MS; the changes of that time are written
   * together. A change refused at once (an id taken, say) is not made,
   * and its refusal returned; else null.
   */
  edit: (changes: readonly DraftChange[], options?: { debounce?: boolean }) => DraftRefusal | null;
  /** Changes are waiting to be written, or being written. */
  saving: boolean;
  /** The last write that failed, until the next edit. */
  failure: DraftFailure | null;
}

/** Changes waiting for their document to be still for a moment. */
interface Waiting {
  changes: DraftChange[];
  timer: ReturnType<typeof setTimeout>;
}

/**
 * A draft to edit (docs/studio.md, Writing a draft): read once
 * (getReleaseDraft), and changed as the user edits it, optimistically.
 * Each change is made at once in the draft the screens show, then
 * written (editReleaseDraft). The writes of a draft wait for one
 * another, in one queue (a mutation scope), whichever screen made them:
 * each write reads the draft after the writes before it, so the last
 * one's draft holds them all. Typing is debounced, per document. A write
 * that fails, or that the draft as it is now refuses, says so. Once
 * nothing is waiting or being written, the draft is what the last write
 * left, or, when a write failed last, it is read afresh: what the
 * screens show is then what the pod has.
 *
 * Nothing can be changed in a draft released (it is frozen), nor while
 * the instance's data check holds it.
 */
export function useDraftEditor(useCases: UseCases, draftUrl: string): DraftEditor {
  const queryClient = useQueryClient();
  // A draft's screens are routed only at a draft's URL.
  const instanceUrl = draftPlaceOf(draftUrl)!.instanceUrl;
  const check = useDataCheck(useCases, instanceUrl);
  const query = useQuery({
    queryKey: draftKey(draftUrl),
    queryFn: () => useCases.getReleaseDraft(draftUrl),
    // The draft on screen holds changes not yet written: it is read afresh only when asked.
    staleTime: Infinity,
  });
  const [failure, setFailure] = useState<DraftFailure | null>(null);
  const waiting = useRef(new Map<string, Waiting>());
  const [waitingCount, setWaitingCount] = useState(0);
  const mutationKey = ["editReleaseDraft", draftUrl];
  const writing = useIsMutating({ mutationKey });

  /** Nothing else of the draft is on its way: no write after this one, of any screen, and nothing waiting here. */
  const last = () => queryClient.isMutating({ mutationKey }) === 0 && waiting.current.size === 0;

  function readAfresh() {
    return last() ? queryClient.invalidateQueries({ queryKey: draftKey(draftUrl) }) : undefined;
  }

  function write(changes: readonly DraftChange[]) {
    const mutation = queryClient.getMutationCache().build<DraftEdit, unknown, readonly DraftChange[], unknown>(queryClient, {
      mutationKey,
      scope: { id: draftScope(draftUrl) },
      mutationFn: (variables) => useCases.editReleaseDraft(draftUrl, variables),
    });
    mutation
      .execute(changes)
      .then((result) => {
        if (!result.ok) {
          setFailure({ refusal: result.refusal });
          return readAfresh();
        }
        // The writes before it are in its draft; one after it would undo the screen's changes it has not made.
        if (last()) queryClient.setQueryData(draftKey(draftUrl), result.draft);
        return undefined;
      })
      .catch((error: unknown) => {
        setFailure({ error });
        return readAfresh();
      });
  }

  function flush(documentUrl: string) {
    const held = waiting.current.get(documentUrl)!;
    clearTimeout(held.timer);
    waiting.current.delete(documentUrl);
    setWaitingCount(waiting.current.size);
    write(held.changes);
  }

  function flushAll() {
    for (const documentUrl of [...waiting.current.keys()]) flush(documentUrl);
  }

  // Leaving the screen writes what waits.
  useEffect(() => flushAll, []);

  const released = query.data?.root.releasedAs !== undefined;
  const readOnly: DraftReadOnly | null = released ? "released" : check.readOnly();

  function edit(changes: readonly DraftChange[], { debounce = false }: { debounce?: boolean } = {}): DraftRefusal | null {
    const before = queryClient.getQueryData<ReleaseDraft>(draftKey(draftUrl))!;
    const after = applyDraftChanges(before, changes);
    if (isRefusal(after)) {
      setFailure({ refusal: after });
      return after;
    }
    setFailure(null);
    const documents = changedDocuments(before, after);
    if (documents.length === 0) return null;
    queryClient.setQueryData(draftKey(draftUrl), after);
    if (!debounce || documents.length > 1) {
      // What waits goes first, so the writes keep the order the user made them in.
      flushAll();
      write(changes);
      return null;
    }
    const documentUrl = documents[0]!;
    const held = waiting.current.get(documentUrl);
    if (held !== undefined) clearTimeout(held.timer);
    waiting.current.set(documentUrl, {
      changes: [...(held?.changes ?? []), ...changes],
      timer: setTimeout(() => flush(documentUrl), DEBOUNCE_MS),
    });
    setWaitingCount(waiting.current.size);
    return null;
  }

  return {
    draft: query.data,
    error: query.error,
    readOnly,
    edit,
    saving: waitingCount > 0 || writing > 0,
    failure,
  };
}
