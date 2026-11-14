// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import { queryOptions, useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DraftEdit } from "@solid-memo/application/releaseDrafts";
import type { UseCases } from "@solid-memo/application/useCases";
import { changedDocuments, draftPlaceOf } from "@solid-memo/domain/release/draftLayout";
import {
  applyDraftChanges,
  isRefusal,
  type DraftChange,
  type DraftRefusal,
  type ReleaseDraft,
} from "@solid-memo/domain/release/releaseDraft";
import { useDataCheck, type ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { queryKeys } from "./queryKeys";

/** The queue a write of a draft waits in, after the draft's writes before it, whatever their documents. */
export function draftScope(draftUrl: string): string {
  return `draft ${draftUrl}`;
}

/**
 * The query of a draft, as every screen that reads it asks for it: the
 * editors (useDraftEditor), the workspace and a trial. A query takes the
 * options of the screen that asked last, so they all ask alike. The
 * draft on screen holds changes not yet written: it is read afresh only
 * when asked. The draft kept is the very one an edit made, not a copy
 * shared with the one before it (structural sharing), so the next edit
 * finds its layout known (changedDocuments).
 */
export function releaseDraftQuery(useCases: UseCases, draftUrl: string) {
  return queryOptions({
    queryKey: queryKeys.releaseDraft(draftUrl),
    queryFn: () => useCases.getReleaseDraft(draftUrl),
    staleTime: Infinity,
    structuralSharing: false,
  });
}

/** What a draft's editor tells the Studio's status bar: how many documents of its changes wait to be written, and whether its last change failed. */
export interface EditorReport {
  waiting: number;
  failed: boolean;
}

/**
 * Where each of a draft's editors says what it has to report, under its
 * own key (the editor itself), for the Studio's status bar
 * (useDraftSaving); none, outside it.
 */
export const DraftWaiting = createContext<(editor: object, report: EditorReport) => void>(
  () => undefined,
);

/** Whether a draft's changes are all written: some are on their way, the last one failed, or all are saved. */
export type DraftSaving = "saving" | "failed" | "saved";

/**
 * Whether the draft's changes are all written, whichever screen made
 * them: from the writes under way, and the editors' reports through
 * DraftWaiting (`reports`, all of them together).
 */
export function useDraftSaving(draftUrl: string, reports: EditorReport): DraftSaving {
  if (
    useIsMutating({ mutationKey: queryKeys.releaseDraftWrites(draftUrl) }) > 0 ||
    reports.waiting > 0
  )
    return "saving";
  return reports.failed ? "failed" : "saved";
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
   * together, a field's change that only replaces the one typed just
   * before it (lastWins) in its place. A change refused at once (an id
   * taken, say) is not made, and its refusal returned; else null.
   */
  edit: (changes: readonly DraftChange[], options?: { debounce?: boolean }) => DraftRefusal | null;
  /** Changes are waiting to be written, or being written. */
  saving: boolean;
  /** The last write that failed, until the next edit. */
  failure: DraftFailure | null;
}

/**
 * Whether `change` makes `before`, the change just before it, as if it
 * had never been made, so that only `change` need be written: the
 * contact set again, or the notes of the release's making set again to
 * some text. Notes with none are not: notes typed before them may have
 * made the release's own making, which they leave.
 */
function lastWins(before: DraftChange | undefined, change: DraftChange): boolean {
  if (before?.kind !== change.kind) return false;
  if (change.kind === "setContact") return true;
  return (
    change.kind === "setMakingNotes" &&
    Object.values(change.notes).some((text) => text.trim() !== "")
  );
}

/** Changes waiting for their document to be still for a moment. */
interface Waiting {
  changes: DraftChange[];
  timer: ReturnType<typeof setTimeout>;
}

/**
 * What of a draft waits to be written, by document, whichever of its
 * editors made it (the screen's, and the outline's beside it), and the
 * editors to tell as it changes. One for each draft, shared: a write of
 * any editor goes after all that waits, and none takes a write's draft
 * while another's typing waits, which that draft does not hold.
 */
interface Pending {
  documents: Map<string, Waiting>;
  listeners: Set<() => void>;
}

const pending = new Map<string, Pending>();

function pendingOf(draftUrl: string): Pending {
  let found = pending.get(draftUrl);
  if (found === undefined) {
    found = { documents: new Map(), listeners: new Set() };
    pending.set(draftUrl, found);
  }
  return found;
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
  const query = useQuery(releaseDraftQuery(useCases, draftUrl));
  const [failure, setFailure] = useState<DraftFailure | null>(null);
  const waiting = pendingOf(draftUrl);
  const [waitingCount, setWaitingCount] = useState(0);
  const mutationKey = queryKeys.releaseDraftWrites(draftUrl);
  const writing = useIsMutating({ mutationKey });

  // Every editor of the draft hears what waits, whichever made it.
  useEffect(() => {
    const heard = () => setWaitingCount(waiting.documents.size);
    waiting.listeners.add(heard);
    heard();
    return () => waiting.listeners.delete(heard);
  }, [draftUrl]);

  function told() {
    for (const heard of waiting.listeners) heard();
  }

  /** Nothing else of the draft is on its way: no write after this one, of any screen, and nothing waiting, of any editor. */
  const last = () => queryClient.isMutating({ mutationKey }) === 0 && waiting.documents.size === 0;

  function readAfresh() {
    return last()
      ? queryClient.invalidateQueries({ queryKey: queryKeys.releaseDraft(draftUrl) })
      : undefined;
  }

  function write(changes: readonly DraftChange[]) {
    const mutation = queryClient
      .getMutationCache()
      .build<DraftEdit, unknown, readonly DraftChange[], unknown>(queryClient, {
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
        if (last()) queryClient.setQueryData(queryKeys.releaseDraft(draftUrl), result.draft);
        return undefined;
      })
      .catch((error: unknown) => {
        setFailure({ error });
        return readAfresh();
      });
  }

  function flush(documentUrl: string) {
    const held = waiting.documents.get(documentUrl)!;
    clearTimeout(held.timer);
    waiting.documents.delete(documentUrl);
    told();
    write(held.changes);
  }

  function flushAll() {
    for (const documentUrl of [...waiting.documents.keys()]) flush(documentUrl);
  }

  // Leaving the screen, or the draft, writes what waits.
  useEffect(() => flushAll, [draftUrl]);

  // The status bar counts what waits here too, and says when the last change failed.
  const report = useContext(DraftWaiting);
  const self = useRef({});
  useEffect(
    () => report(self.current, { waiting: waitingCount, failed: failure !== null }),
    [waitingCount, failure],
  );
  useEffect(() => () => report(self.current, { waiting: 0, failed: false }), []);

  const released = query.data?.root.releasedAs !== undefined;
  const readOnly: DraftReadOnly | null = released ? "released" : check.readOnly();

  function edit(
    changes: readonly DraftChange[],
    { debounce = false }: { debounce?: boolean } = {},
  ): DraftRefusal | null {
    const before = queryClient.getQueryData<ReleaseDraft>(queryKeys.releaseDraft(draftUrl))!;
    const after = applyDraftChanges(before, changes);
    if (isRefusal(after)) {
      setFailure({ refusal: after });
      return after;
    }
    setFailure(null);
    const documents = changedDocuments(before, after);
    if (documents.length === 0) return null;
    queryClient.setQueryData(queryKeys.releaseDraft(draftUrl), after);
    if (!debounce || documents.length > 1) {
      // What waits goes first, whichever editor it waits for, so the writes keep the order the user made them in.
      flushAll();
      write(changes);
      return null;
    }
    const documentUrl = documents[0]!;
    const held = waiting.documents.get(documentUrl);
    if (held !== undefined) clearTimeout(held.timer);
    const waited = held?.changes ?? [];
    // A keystroke's change that only replaces the one before it takes its place: a write makes each change it is given.
    const replaced = changes.length === 1 && lastWins(waited.at(-1), changes[0]!);
    waiting.documents.set(documentUrl, {
      changes: [...(replaced ? waited.slice(0, -1) : waited), ...changes],
      timer: setTimeout(() => flush(documentUrl), DEBOUNCE_MS),
    });
    told();
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
