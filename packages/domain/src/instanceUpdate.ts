import type { StepPart } from "./deckUpgrade";
import { ensureTrailingSlash } from "./instanceLayout";
import type { LangText } from "./langText";

/**
 * The format update of an instance (see docs/migrations.md "The pod
 * migration"): each document that holds a subject in an older format is
 * brought up to this app's formats on its own, one after another, in one
 * write made only if the document is still as it was read. Every document
 * stays readable throughout, updated or not: a reader brings every stored
 * version up to date in memory, so an instance works with any mix of
 * updated and outdated documents. A document that cannot be updated now
 * is left as it is, and the update goes on with the others; run again,
 * it updates only what is still outdated. Every document keeps its
 * address.
 */

/** The steps the user sees: finding what to update, updating each document, making the instance's data findable. */
export type UpdateStep = "read" | "write" | "register";

export const UPDATE_STEPS: readonly UpdateStep[] = ["read", "write", "register"];

export interface UpdateProgress {
  step: UpdateStep;
  /** Steps finished, out of `total`. */
  done: number;
  total: number;
  /** How many of the documents to update are done, while it updates them. */
  part?: StepPart;
}

/** A document the update brings up to this app's formats: where it is, and what it holds, for the user to tell it. */
export interface UpdateDocument {
  url: string;
  /** The instance's record, its preferences, its catalogue of decks, or a deck's cards or review states. */
  holds: "instance" | "preferences" | "catalog" | "cards" | "reviews";
  /** For a deck's cards or review states: the deck's title (the first deck's, for a document decks share). */
  deck?: LangText;
}

/**
 * A document the update could not bring up to date, or cannot tell it
 * did: as it was or, when the answer to its write was lost, updated;
 * readable either way.
 */
export interface UpdateFailure extends UpdateDocument {
  /**
   * Why: an AppError the app can show in the reader's language (another
   * tab or device changed the document since it was read, say), or any
   * other error.
   */
  error: unknown;
}

export interface UpdateOutcome {
  /** The documents brought up to date, in the order they were written. */
  updated: UpdateDocument[];
  /** The documents that could not be, each readable as it is, to update on another run; empty when the update is done. */
  failed: UpdateFailure[];
}

/** An IRI under the `from` container moved under `to`; any other IRI as it is. */
export function rebaseIri(iri: string, from: string, to: string): string {
  const source = ensureTrailingSlash(from);
  return iri.startsWith(source) ? `${ensureTrailingSlash(to)}${iri.slice(source.length)}` : iri;
}
