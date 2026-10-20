// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createSolidDataset, type SolidDataset } from "@inrupt/solid-client";
import type { ReviewStateRepository } from "@solid-memo/application/ports";
import type { Deck } from "@solid-memo/domain/deck";
import type { PromptStates } from "@solid-memo/domain/grading";
import type { ReviewKey, ReviewStates } from "@solid-memo/domain/review";
import { isReviewStateOutdated, upgradeReviewState } from "@solid-memo/domain/migration";
import {
  getSolidDatasetOrNull,
  keptDataset,
  PreconditionFailedError,
  saveDataset,
} from "./datasets";
import { createDeckDocumentGuard } from "./deckPlace";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { mapSince, readSince } from "./readSince";
import {
  toReviewStates,
  withGradedReviewState,
  withoutReadReviewStates,
  withoutReviewStates,
  withReviewStates,
} from "./mappers/reviewStateMapper";

export interface SolidReviewStateRepositoryDeps {
  fetch: typeof globalThis.fetch;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
  /** A new subject's id, for a state whose named subject is another's (see withReviewStates). */
  randomId?: () => string;
}

/** The states of a deck without a reviews document: none. */
const none = (): ReviewStates => ({ sm2: [], fsrs: [] });

/** How many times writeFsrsStates reads and writes a document that keeps changing meanwhile. */
const WRITE_ATTEMPTS = 3;

/** No FSRS-6 state to save or remove. */
const NO_FSRS = { save: [], remove: [] };

export function createSolidReviewStateRepository({
  fetch,
  checkWrite = noWriteCheck,
  randomId = () => crypto.randomUUID(),
}: SolidReviewStateRepositoryDeps): ReviewStateRepository {
  const guard = createDeckDocumentGuard(fetch);

  /**
   * Save a deck's reviews document, saying whose it is (`<>
   * dcterms:isPartOf` the deck's entry), once the subjects the write
   * touched are checked: only one that is the deck's to change
   * (deckPlace.ts, guard.writable), else nothing is sent.
   */
  async function saveReviews(
    deck: Deck,
    { dataset, subjects }: { dataset: SolidDataset; subjects: readonly string[] },
  ): Promise<void> {
    const written = await guard.writable(deck, deck.reviewsDocumentUrl, dataset);
    await checkWrite(written, subjects, "pod");
    await saveDataset(deck.reviewsDocumentUrl, written, fetch);
  }

  return {
    async listReviewStates(deck): Promise<ReviewStates> {
      const dataset = await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch);
      return dataset === null ? none() : toReviewStates(dataset, deck);
    },

    async readReviewStatesSince(deck, version) {
      return mapSince(await readSince(deck.reviewsDocumentUrl, version, fetch), (dataset) =>
        dataset === null ? none() : toReviewStates(dataset, deck),
      );
    },

    async getReviewState(deck, key): Promise<PromptStates> {
      const dataset = await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch);
      const states = dataset === null ? none() : toReviewStates(dataset, deck);
      const of = <T extends ReviewKey>(list: readonly T[]) =>
        list.find((state) => state.cardId === key.cardId && state.direction === key.direction) ??
        null;
      return { sm2: of(states.sm2), fsrs: of(states.fsrs) };
    },

    // A grade: an edit of the document as last read or written, when its version is known, with no read
    // first; read again only when it changed since (412), as another device's grade changes it.
    async gradeReviewState(deck, key, grade) {
      const save = async (dataset: SolidDataset) => {
        const written = withGradedReviewState(dataset, deck, key, grade, randomId);
        await saveReviews(deck, written);
        return { state: written.state, current: written.current };
      };
      const kept = keptDataset(deck.reviewsDocumentUrl, fetch);
      if (kept !== undefined) {
        try {
          return await save(kept);
        } catch (error) {
          if (!(error instanceof PreconditionFailedError)) throw error;
        }
      }
      return save(
        (await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch)) ?? createSolidDataset(),
      );
    },

    async createReviewStates(deck, states): Promise<void> {
      const written = withReviewStates(createSolidDataset(), deck, states, randomId);
      // A new dataset: saved only if nothing is there yet (If-None-Match: *).
      await saveReviews(deck, written);
    },

    async applyReviewChanges(deck, { save, remove, fsrs = NO_FSRS, every = false }): Promise<void> {
      const read = await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch);
      // No document, nothing to remove: one is made only for states to save (a card moved in, with them).
      if (read === null && save.length + fsrs.save.length === 0) return;
      const dataset = read ?? createSolidDataset();
      // A card's every state goes with `every`; else, and for FSRS-6's removals, only the state read.
      const without = withoutReadReviewStates(
        every ? withoutReviewStates(dataset, deck, remove) : dataset,
        deck,
        every ? { fsrs: fsrs.remove } : { sm2: remove, fsrs: fsrs.remove },
      );
      const written = withReviewStates(without, deck, { sm2: save, fsrs: fsrs.save }, randomId);
      await saveReviews(deck, written);
    },

    async writeFsrsStates(deck, edit): Promise<void> {
      for (let attempt = 1; ; attempt++) {
        const dataset = await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch);
        if (dataset === null) return;
        const fsrs = edit(toReviewStates(dataset, deck));
        if (fsrs.length === 0) return;
        const written = withReviewStates(dataset, deck, { sm2: [], fsrs }, randomId);
        try {
          // If-Match the read above.
          await saveReviews(deck, written);
          return;
        } catch (error) {
          if (!(error instanceof PreconditionFailedError) || attempt === WRITE_ATTEMPTS)
            throw error;
        }
      }
    },

    async upgradeReviewStates(deck): Promise<boolean> {
      const dataset = await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch);
      if (dataset === null) return false;
      // Each state stored in an older format, as read and brought up to date in memory, written back at its subject.
      const outdated = toReviewStates(dataset, deck).sm2.filter(isReviewStateOutdated);
      if (outdated.length === 0) return false;
      const written = withReviewStates(
        dataset,
        deck,
        { sm2: outdated.map(upgradeReviewState) },
        randomId,
      );
      // If-Match the read above.
      await saveReviews(deck, written);
      return true;
    },
  };
}
