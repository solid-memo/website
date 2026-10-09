import { createSolidDataset } from "@inrupt/solid-client";
import type { ReviewStateRepository } from "@solid-memo/application/ports";
import type { ReviewState } from "@solid-memo/domain/review";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { mapSince, readSince } from "./readSince";
import { loadEngine as defaultLoadEngine, movedDataset, type LoadEngine } from "./movedDataset";
import {
  toReviewStates,
  withoutReadReviewStates,
  withoutReviewStates,
  withReviewStates,
} from "./mappers/reviewStateMapper";

export interface SolidReviewStateRepositoryDeps {
  fetch: typeof globalThis.fetch;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
  /** The IRI mapper an upgrade's new reviews document is moved with; injected for tests. */
  loadEngine?: LoadEngine;
  /** A new subject's id, for a state whose named subject is another's (see withReviewStates). */
  randomId?: () => string;
}

export function createSolidReviewStateRepository({
  fetch,
  checkWrite = noWriteCheck,
  loadEngine = defaultLoadEngine,
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

    async applyReviewChanges(deck, { save, remove }): Promise<void> {
      const dataset = await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch);
      if (dataset === null) return;
      const written = withReviewStates(withoutReadReviewStates(dataset, deck, remove), deck, save, randomId);
      await checkWrite(written.dataset, written.subjects);
      await saveDataset(deck.reviewsDocumentUrl, written.dataset, fetch);
    },

    async stageReviewChanges(deck, staged, remove): Promise<void> {
      const original = (await getSolidDatasetOrNull(deck.reviewsDocumentUrl, fetch)) ?? createSolidDataset();
      // The states move with their document, and their links to their cards with the cards document.
      const moved = await movedDataset(
        original,
        [
          { from: deck.reviewsDocumentUrl, to: staged.reviewsDocumentUrl },
          { from: deck.cardsDocumentUrl, to: staged.cardsDocumentUrl },
        ],
        loadEngine,
      );
      await saveDataset(staged.reviewsDocumentUrl, withoutReviewStates(moved, { ...staged, id: deck.id }, remove), fetch);
    },
  };
}
