import type { RunUndo } from "./backup";
import type { StepPart } from "./deckUpgrade";
import { ensureTrailingSlash } from "./instanceLayout";

/**
 * The format update of an instance, done safely (see docs/migrations.md):
 * every document it is about to change is first backed up, its bytes as
 * the pod serves them; the updated documents are written into a working
 * copy beside the backup and checked there; once every document is found
 * still as it was backed up, each is updated in place, then checked
 * again. Until then nothing of the user's is written, and a failure from
 * then on puts every document it wrote back, byte for byte. Every document
 * keeps its address.
 */

export type UpdateStep = "stage" | "backup" | "copy" | "check" | "verify" | "rewrite" | "validate" | "tidy";

export const UPDATE_STEPS: readonly UpdateStep[] = ["stage", "backup", "copy", "check", "verify", "rewrite", "validate", "tidy"];

export interface UpdateProgress {
  step: UpdateStep;
  /** Steps finished, out of `total`. */
  done: number;
  total: number;
  /** How far into `step` it is; absent for a step done in one go. */
  part?: StepPart;
  /** Set while the update, failed at `step`, puts back the documents it wrote. */
  undoing?: true;
}

export type UpdateOutcome =
  /**
   * Done: every document is in this app's formats, at its address.
   * `backupUrl` is the backup of what changed, kept as the previous
   * version; absent when nothing did (another tab or app brought it up to
   * date meanwhile).
   */
  | { ok: true; backupUrl?: string }
  /**
   * Failed at `step`. `undo` is null when it failed before it wrote any
   * document of the user's (they are as they were); else what putting back
   * the documents it wrote did. `backupUrl` is the update's folder (its
   * backup and working copy), when something of it is kept: a document
   * was kept as changed elsewhere, putting back stopped, or the folder
   * could not be removed. `error` is what went wrong: an AppError the app
   * can show in the reader's language, or any other error.
   */
  | { ok: false; step: UpdateStep; error: unknown; undo: RunUndo | null; backupUrl?: string };

/** An IRI under the `from` container moved under `to`; any other IRI as it is. */
export function rebaseIri(iri: string, from: string, to: string): string {
  const source = ensureTrailingSlash(from);
  return iri.startsWith(source) ? `${ensureTrailingSlash(to)}${iri.slice(source.length)}` : iri;
}
