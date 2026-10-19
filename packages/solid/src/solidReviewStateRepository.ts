// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createSolidDataset, type SolidDataset } from "@inrupt/solid-client";
import type { ReviewStateRepository } from "@solid-memo/application/ports";
import type { PromptStates } from "@solid-memo/domain/grading";
import type { ReviewKey, ReviewStates } from "@solid-memo/domain/review";
import { isReviewStateOutdated, upgradeReviewState } from "@solid-memo/domain/migration";
import {
  getSolidDatasetOrNull,
  keptDataset,
  PreconditionFailedError,
  saveDataset,
} from "./datasets";
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

/** No FSRS-6 state to save or remove. */
const NO_FSRS = { save: [], remove: [] };

export function createSolidReviewStateRepository({
  fetch,
  checkWrite = noWriteCheck,
  randomId = () => crypto.randomUUID(),
}: SolidReviewStateRepositoryDeps): ReviewStateRepository {
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
        await checkWrite(written.dataset, written.subjects, "pod");
        await saveDataset(deck.reviewsDocumentUrl, written.dataset, fetch);
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
      await checkWrite(written.dataset, written.subjects, "pod");
      // A new dataset: saved only if nothing is there yet (If-None-Match: *).
      await saveDataset(deck.reviewsDocumentUrl, written.dataset, fetch);
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
      await checkWrite(written.dataset, written.subjects, "pod");
      await saveDataset(deck.reviewsDocumentUrl, written.dataset, fetch);
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
      await checkWrite(written.dataset, written.subjects, "pod");
      // If-Match the read above.
      await saveDataset(deck.reviewsDocumentUrl, written.dataset, fetch);
      return true;
    },
  };
}
