import type { StepPart } from "./deckUpgrade";
import { ensureTrailingSlash } from "./instanceLayout";

/**
 * The format update of an instance, done safely (see docs/migrations.md):
 * every document it is about to change is first copied into a backup in
 * the instance's backups/ folder; then each is brought up to this app's
 * formats in place, only while it is still as it was copied; then the
 * instance is checked. Every document keeps its address. A document
 * changed elsewhere meanwhile stops the update: what it updated stays
 * updated, and running it again finishes it.
 */

export type UpdateStep = "stage" | "backup" | "upgrade" | "validate";

export const UPDATE_STEPS: readonly UpdateStep[] = ["stage", "backup", "upgrade", "validate"];

export interface UpdateProgress {
  step: UpdateStep;
  /** Steps finished, out of `total`. */
  done: number;
  total: number;
  /** How far into `step` it is; absent for a step done in one go. */
  part?: StepPart;
}

export type UpdateOutcome =
  /**
   * Done: every document is in this app's formats. `backupUrl` is the
   * backup of what changed; absent when nothing did (another tab or app
   * brought it up to date meanwhile).
   */
  | { ok: true; backupUrl?: string }
  /**
   * Stopped at `step`. `updated` lists the documents brought up to date
   * before it stopped, which stay so: each is whole and in the newer
   * format, and the others as they were. `backupUrl` is the backup of
   * every document the update was to change, kept when any was updated
   * (or it could not be removed). `error` is what went wrong: an
   * AppError the app can show in the reader's language (changedElsewhere
   * naming the document changed meanwhile), or any other error.
   */
  | { ok: false; step: UpdateStep; error: unknown; updated: string[]; backupUrl?: string };

/** An IRI under the `from` container moved under `to`; any other IRI as it is. */
export function rebaseIri(iri: string, from: string, to: string): string {
  const source = ensureTrailingSlash(from);
  return iri.startsWith(source) ? `${ensureTrailingSlash(to)}${iri.slice(source.length)}` : iri;
}
