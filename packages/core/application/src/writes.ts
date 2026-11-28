// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DeckRepository } from "./ports/pod";
import type { Since } from "./ports/shared";
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
 * Whether a write was refused because its document changed since it was
 * read, or was made since it was read as absent (a 412 either way): what
 * it was planned from is out of date, and planned again it may be made.
 */
export function changedOrCreatedElsewhere(error: unknown): boolean {
  return (
    changedElsewhere(error) || (error instanceof AppError && error.code === "createdElsewhere")
  );
}

/**
 * How often a write made from a read is made, in all, while its document
 * keeps changing elsewhere (412), each time from a fresh read: the
 * adapters' edits of one document (editDocument) and the use cases'
 * writes of several. Two exceptions say why beside them: the digest,
 * which another page writes several times running, tries more often,
 * and a library upgrade, whose plan the learner approved, only once.
 */
export const EDIT_ATTEMPTS = 3;

/**
 * How often a write that makes something new at a place of its own (a
 * new draft's name, an imported deck's id) is made, in all, while the
 * place it chose was taken elsewhere meanwhile, each time at the next.
 */
export const PLACE_ATTEMPTS = 3;

/**
 * The longest wait before the second try of a write refused with a 412,
 * in milliseconds; each try after waits up to twice as long as the one
 * before (pauseBefore). Short enough for a learner never to notice it.
 */
const PAUSE_BASE_MS = 25;

/**
 * How long to wait before try `attempt` (2 or later) of a write refused
 * with a 412: a random time between none and PAUSE_BASE_MS ×
 * 2^(attempt − 2), so two tabs or devices whose writes met once don't
 * meet again on the very next try.
 */
export function pauseMs(attempt: number, random: () => number = Math.random): number {
  return random() * PAUSE_BASE_MS * 2 ** (attempt - 2);
}

/** Wait before try `attempt` of a write refused with a 412, by the clock (pauseMs). */
export function pauseBefore(attempt: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, pauseMs(attempt)));
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
