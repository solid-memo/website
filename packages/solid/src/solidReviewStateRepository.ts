import { createSolidDataset } from "@inrupt/solid-client";
import type { ReviewStateRepository } from "@solid-memo/application/ports";
import type { ReviewState } from "@solid-memo/domain/review";
import { isReviewStateOutdated, upgradeReviewState } from "@solid-memo/domain/migration";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { mapSince, readSince } from "./readSince";
import {
  toReviewStates,
  withoutReadReviewStates,
  withReviewStates,
} from "./mappers/reviewStateMapper";

export interface SolidReviewStateRepositoryDeps {
  fetch: typeof globalThis.fetch;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
  /** A new subject's id, for a state whose named subject is another's (see withReviewStates). */
  randomId?: () => string;
}

export function createSolidReviewStateRepository({
  fetch,
  checkWrite = noWriteCheck,
  randomId = () => crypto.randomUUID(),
}: SolidReviewStateRepositoryDeps): ReviewStateRepository {
  return {
    async listReviewStates(deck): Promise<ReviewState[]> {
      const dataset = await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch);
      return dataset === null ? [] : toReviewStates(dataset, deck);
    },

    async readReviewStatesSince(deck, version) {
      return mapSince(await readSince(deck.reviewsDocumentUrl, version, fetch), (dataset) =>
        dataset === null ? [] : toReviewStates(dataset, deck),
      );
    },

    async getReviewState(deck, key): Promise<ReviewState | null> {
      const dataset = await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch);
      if (dataset === null) return null;
      return (
        toReviewStates(dataset, deck).find((state) => state.cardId === key.cardId && state.direction === key.direction) ??
        null
      );
    },

    async saveReviewState(deck, state): Promise<void> {
      const dataset = (await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch)) ?? createSolidDataset();
      const written = withReviewStates(dataset, deck, [state], randomId);
      await checkWrite(written.dataset, written.subjects);
      await saveDataset(deck.reviewsDocumentUrl, written.dataset, fetch);
    },

    async createReviewStates(deck, states): Promise<void> {
      const written = withReviewStates(createSolidDataset(), deck, states, randomId);
      await checkWrite(written.dataset, written.subjects);
      // A new dataset: saved only if nothing is there yet (If-None-Match: *).
      await saveDataset(deck.reviewsDocumentUrl, written.dataset, fetch);
    },

    async applyReviewChanges(deck, { save, remove }): Promise<void> {
      const read = await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch);
      // No document, nothing to remove: one is made only for states to save (a card moved in, with them).
      if (read === null && save.length === 0) return;
      const dataset = read ?? createSolidDataset();
      const written = withReviewStates(withoutReadReviewStates(dataset, deck, remove), deck, save, randomId);
      await checkWrite(written.dataset, written.subjects);
      await saveDataset(deck.reviewsDocumentUrl, written.dataset, fetch);
    },

    async upgradeReviewStates(deck): Promise<boolean> {
      const dataset = await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch);
      if (dataset === null) return false;
      // Each state stored in an older format, as read and brought up to date in memory, written back at its subject.
      const outdated = toReviewStates(dataset, deck).filter(isReviewStateOutdated);
      if (outdated.length === 0) return false;
      const written = withReviewStates(dataset, deck, outdated.map(upgradeReviewState), randomId);
      await checkWrite(written.dataset, written.subjects);
      // If-Match the read above.
      await saveDataset(deck.reviewsDocumentUrl, written.dataset, fetch);
      return true;
    },
  };
}
