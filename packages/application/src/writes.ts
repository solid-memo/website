// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DeckRepository, Since } from "./ports";
import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import { isGuestUrl } from "@solid-memo/domain/guest";

/**
 * How the use cases read and write a pod's documents while other apps,
 * tabs and devices may change them: a write is made only while its
 * document is as read (If-Match), and a refusal says which way it went.
 */

/** Whether a write was refused because the document changed since it was read (a 412). */
export function changedElsewhere(error: unknown): boolean {
  return error instanceof AppError && error.code === "changedElsewhere";
}

/**
 * How often an edit of metadata (a deck's provenance, an instance's
 * name, its catalog) is made, in all, while its document keeps
 * changing elsewhere (412).
 */
const METADATA_ATTEMPTS = 3;

/**
 * Make an edit, a read of its document then a write of it If-Match that
 * read, again while the document keeps changing elsewhere: each attempt
 * reads afresh, so what changed meanwhile is kept.
 */
export async function again<T>(edit: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await edit();
    } catch (error) {
      if (!changedElsewhere(error) || attempt === METADATA_ATTEMPTS) throw error;
    }
  }
}

/** A read made without a known version, which always comes with the contents. */
export async function readNow<T>(
  read: Promise<Since<T>>,
): Promise<{ value: T; version: string | null }> {
  const since = await read;
  if (since.unchanged) throw new Error("A read without a version came back unchanged.");
  return since;
}

/**
 * Whether a write's failure says it was never made: the pod refused it
 * (412, the document changed or was created elsewhere), or this app did
 * before sending it (the data would not conform, a newer version of the
 * app wrote it, a deck's entry no longer as the upgrade read it, a deck's
 * document not yet said to be the deck's, a deck that cannot be used, an
 * address the pod fence refuses or one outside the user's pod, a card or
 * wrong option that would be written over another, say).
 * Any other failure, an answer lost on the way, may follow a write the
 * pod made.
 */
export function unsent(error: unknown): boolean {
  return (
    error instanceof AppError &&
    [
      "changedElsewhere",
      "createdElsewhere",
      "writtenByNewerApp",
      "dataNotConforming",
      "guestStudyBeingMoved",
      "writeRefused",
      "writeOutsidePod",
      "deckChangedDuringUpgrade",
      "deckDocumentUnclaimed",
      "deckGone",
      "distractorIdRepeated",
      "idTakenInDeck",
    ].includes(error.code)
  );
}

/**
 * After a failed write of an import that writes a deck's documents, then
 * its entry, with `written` the documents that are there or may be: the
 * deck, when the entry was written after all, its answer lost on the way;
 * else they are deleted, as nothing names them, and the failure stands.
 * It says so while one may still be there (importDocumentLeft). When the
 * catalog cannot be read they stay, as they may be the deck's, and it says
 * the import may have worked (importOutcomeUnknown). A guest cannot reach
 * a document, so a guest's text does not ask them to.
 */
export async function finishCutOffImport(
  repository: Pick<DeckRepository, "readDeck" | "deleteDocument">,
  deck: Deck,
  written: readonly string[],
  failure: unknown,
): Promise<Deck> {
  const guest = isGuestUrl(deck.url);
  const context = (urls: readonly string[]) => ({
    url: urls.join(", "),
    failure: String(failure),
  });
  if (!unsent(failure)) {
    let entry: Deck | null;
    try {
      entry = await repository.readDeck(deck.url);
    } catch {
      if (written.length === 0) throw failure;
      throw new AppError(
        guest ? "guestImportOutcomeUnknown" : "importOutcomeUnknown",
        context(written),
      );
    }
    if (entry !== null) return entry;
  }
  const left: string[] = [];
  for (const url of written) await repository.deleteDocument(deck, url).catch(() => left.push(url));
  if (left.length > 0)
    throw new AppError(guest ? "guestImportDocumentLeft" : "importDocumentLeft", context(left));
  throw failure;
}
