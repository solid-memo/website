// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type Dataset, createSolidDataset } from "./client/rdf";
import type { ReviewChanges, ReviewStateRepository } from "@solid-memo/application/ports";
import type { Deck } from "@solid-memo/domain/deck";
import type { PromptStates } from "@solid-memo/domain/grading";
import type { ReviewKey, ReviewStates } from "@solid-memo/domain/review";
import { isReviewStateOutdated, upgradeReviewState } from "@solid-memo/domain/migration";
import {
  editDocument,
  getSolidDatasetOrNull,
  keptDataset,
  PreconditionFailedError,
  refuseUnreadableImport,
  saveDataset,
  versionOf,
} from "./datasets";
import { ABSENT_VERSION } from "@solid-memo/domain/studyDigest";
import { createDeckDocumentGuard, type UserStorages } from "./deckPlace";
import { noWriteCheck, type WriteCheck } from "./writeCheck";
import { mapSince, readSince } from "./readSince";
import {
  sharedReviewStatesOf,
  toReviewStates,
  withGradedReviewState,
  withoutReadReviewStates,
  withoutReviewStates,
  carriedStatesOf,
  withReviewStates,
} from "./mappers/reviewStateMapper";

export interface SolidReviewStateRepositoryDeps {
  fetch: typeof globalThis.fetch;
  /** The fetch of a deck's review states read as no one (listReviewStates `asNoOne`); `fetch` by default. */
  publicFetch?: typeof globalThis.fetch;
  /** Checks what is about to be written; see writeCheck.ts. */
  checkWrite?: WriteCheck;
  /** A new subject's id, for a state whose named subject is another's (see withReviewStates). */
  randomId?: () => string;
  /** The signed-in user's storages, for where a deck's document is (deckPlace.ts UserStorages); none by default. */
  userStorages?: UserStorages;
}

/** The states of a deck without a reviews document: none. */
const none = (): ReviewStates => ({ sm2: [], fsrs: [] });

/** No FSRS-6 state to save or remove. */
const NO_FSRS = { save: [], remove: [] };

export function createSolidReviewStateRepository({
  fetch,
  publicFetch = fetch,
  checkWrite = noWriteCheck,
  randomId = () => crypto.randomUUID(),
  userStorages,
}: SolidReviewStateRepositoryDeps): ReviewStateRepository {
  const guard = createDeckDocumentGuard(fetch, userStorages);

  /**
   * Save a deck's reviews document, saying whose it is (`<>
   * dcterms:isPartOf` the deck's entry), once the subjects the write
   * touched are checked: only one that is the deck's to change
   * (deckPlace.ts, guard.writable), else nothing is sent.
   */
  async function saveReviews(
    deck: Deck,
    written: { dataset: Dataset; subjects: readonly string[] },
  ): Promise<void> {
    await saveDataset(deck.reviewsDocumentUrl, await checkedReviews(deck, written), fetch);
  }

  /** The reviews document saveReviews sends, once checked as it checks it; nothing is sent. */
  async function checkedReviews(
    deck: Deck,
    { dataset, subjects }: { dataset: Dataset; subjects: readonly string[] },
  ): Promise<Dataset> {
    const written = await guard.writable(deck, deck.reviewsDocumentUrl, dataset);
    await checkWrite(written, subjects, "pod");
    return written;
  }

  /**
   * The reviews document as applyReviewChanges writes it, made of `read`
   * (null: there is none), with the subjects written; null when nothing
   * is written (no document, and no state to save). Refuses what
   * applyReviewChanges refuses.
   */
  async function changed(
    read: Dataset | null,
    deck: Deck,
    { save, remove, fsrs = NO_FSRS, every = false, carried }: ReviewChanges,
  ): Promise<{ dataset: Dataset; subjects: string[] } | null> {
    // No document, nothing to remove: one is made only for states to save (a card moved in, with them).
    if (read === null && save.length + fsrs.save.length === 0) return null;
    const dataset = read ?? createSolidDataset();
    // A card's every state goes with `every`; else, and for FSRS-6's removals, only the state read.
    const without = withoutReadReviewStates(
      every ? withoutReviewStates(dataset, deck, remove) : dataset,
      deck,
      every ? { fsrs: fsrs.remove } : { sm2: remove, fsrs: fsrs.remove },
    );
    // A state copied from another deck starts from what that deck's document says of it.
    const source =
      carried === undefined
        ? null
        : await getSolidDatasetOrNull(
            carried.deck.reviewsDocumentUrl,
            carried.asNoOne === true ? publicFetch : fetch,
          );
    return withReviewStates(
      without,
      deck,
      { sm2: save, fsrs: fsrs.save },
      randomId,
      source === null ? undefined : carriedStatesOf(source, carried!.deck, carried!.ids),
    );
  }

  /**
   * The reviews document as `changes` leave it, made of `read`, refused
   * and checked as applyReviewChanges refuses and checks it; null when
   * nothing is written.
   */
  async function checkedChange(
    read: Dataset | null,
    deck: Deck,
    changes: ReviewChanges,
  ): Promise<Dataset | null> {
    const written = await changed(read, deck, changes);
    if (written === null) return null;
    const checked = await checkedReviews(deck, written);
    // A deck file's progress in one document no later read would take in is not written.
    if (changes.fromFile === true) await refuseUnreadableImport(deck.reviewsDocumentUrl, checked);
    return checked;
  }

  /** The write applyReviewChanges makes, read, refused and checked, but not sent (ReviewStateRepository). */
  async function prepareReviewChanges(
    deck: Deck,
    changes: ReviewChanges,
    { version }: { version?: string } = {},
  ): Promise<() => Promise<void>> {
    const url = deck.reviewsDocumentUrl;
    const read = await getSolidDatasetOrNull(url, fetch);
    // Changes made from an earlier read go only to the document as it was then: the edit is planned again.
    if (
      version !== undefined &&
      (read === null ? ABSENT_VERSION : (versionOf(read) ?? null)) !== version
    )
      throw new PreconditionFailedError(url, version === ABSENT_VERSION ? "absent" : "unchanged");
    const checked = await checkedChange(read, deck, changes);
    if (checked === null) return async () => undefined;
    // If-Match the read. Sent after another write, the edit can no longer be planned again: a document
    // changed since has the same changes made of it read afresh, never written over.
    return async () => {
      try {
        await saveDataset(url, checked, fetch);
      } catch (error) {
        if (!(error instanceof PreconditionFailedError)) throw error;
        await editReviewStates(deck, () => changes);
      }
    };
  }

  /**
   * The changes `change` makes of the states as read, written of that
   * same read, If-Match it; read and changed again while the document
   * keeps changing meanwhile (editDocument, ReviewStateRepository).
   */
  function editReviewStates(
    deck: Deck,
    change: (states: ReviewStates) => ReviewChanges | null,
  ): Promise<ReviewChanges | null> {
    return editDocument(deck.reviewsDocumentUrl, fetch, async (read) => {
      const changes = change(read === null ? none() : sharedReviewStatesOf(read, deck));
      if (changes === null) return { result: null };
      const checked = await checkedChange(read, deck, changes);
      return checked === null ? { result: changes } : { dataset: checked, result: changes };
    });
  }

  return {
    async listReviewStates(deck, { asNoOne = false } = {}): Promise<ReviewStates> {
      const dataset = await getSolidDatasetOrNull(
        deck.reviewsDocumentUrl,
        asNoOne ? publicFetch : fetch,
      );
      return dataset === null ? none() : sharedReviewStatesOf(dataset, deck);
    },

    async readReviewStatesSince(deck, version, { asNoOne = false } = {}) {
      const read = await readSince(deck.reviewsDocumentUrl, version, asNoOne ? publicFetch : fetch);
      return mapSince(read, (dataset) =>
        dataset === null ? none() : sharedReviewStatesOf(dataset, deck),
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
      const save = async (dataset: Dataset) => {
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

    // The same changes, made of the document as it is now, also after it changed meanwhile.
    async applyReviewChanges(deck, changes): Promise<void> {
      await editReviewStates(deck, () => changes);
    },

    editReviewStates,

    prepareReviewChanges,

    async writeFsrsStates(deck, edit): Promise<void> {
      // Read and written again while the document keeps changing meanwhile (editDocument).
      await editDocument(deck.reviewsDocumentUrl, fetch, async (dataset) => {
        if (dataset === null) return { result: undefined };
        const fsrs = edit(toReviewStates(dataset, deck));
        if (fsrs.length === 0) return { result: undefined };
        const written = withReviewStates(dataset, deck, { sm2: [], fsrs }, randomId);
        // Checked as saveReviews checks it; If-Match the read.
        return { dataset: await checkedReviews(deck, written), result: undefined };
      });
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
