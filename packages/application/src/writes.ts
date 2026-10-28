// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Since } from "./ports";
import { AppError } from "@solid-memo/domain/appError";

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
 * address the pod fence refuses or one outside the user's pod, say).
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
    ].includes(error.code)
  );
}
