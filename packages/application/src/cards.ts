// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  validateCardContent,
  type Card,
  type CardContent,
  type Deck,
  type StudyDirection,
} from "@solid-memo/domain/deck";
import { canonicalTag } from "@solid-memo/domain/languageTag";
import {
  unlikeRelease,
  withStatedLanguages,
  type StatedLanguages,
} from "@solid-memo/domain/deckLanguages";
import {
  planCardEdit,
  planUndo,
  sameCardEditPlan,
  type CardChanges,
  type CardEdit,
  type CardEditPlan,
} from "@solid-memo/domain/cardBulk";
import { ABSENT_VERSION } from "@solid-memo/domain/studyDigest";
import type { FsrsState, ReviewKey, ReviewState, ReviewStates } from "@solid-memo/domain/review";
import { isStudyDay, rescheduleStates, resetStates } from "@solid-memo/domain/reviewStateEdits";
import {
  planCardTransfer,
  type CardTransferPlan,
  type TransferOptions,
} from "@solid-memo/domain/cardTransfer";
import {
  DECK_FILE_ACCEPT,
  DECK_FILE_TYPES,
  deckFileBaseOf,
  deckFileFormatOf,
  deckFileName,
  importedDeck,
  type DeckFile,
  type DeckFileOptions,
} from "@solid-memo/domain/deckFile";
import type {
  DeckLibrary,
  DeckRepository,
  ReviewStateRepository,
  DeckArchive,
  FileExchange,
} from "./ports";
import { AppError } from "@solid-memo/domain/appError";
import { changedElsewhere, readNow } from "./writes";
import type { DigestStore } from "./digestStore";

export interface CardUseCases {
  listCards(deck: Deck): Promise<Card[]>;
  /**
   * The deck's review states, every direction's, as stored: SM-2's, and
   * the FSRS-6 states beside them. The Studio's card workbench lists them
   * with the cards; what sets each prompt's due day is effectiveStates of
   * the two, by the instance's scheduler.
   */
  listDeckReviewStates(deck: Deck): Promise<ReviewStates>;
  /**
   * Rejects, without any pod write, unless each side has text or an
   * http(s) image URL, and every text states its language
   * (validateCardContent).
   */
  addCard(deck: Deck, content: CardContent): Promise<Card>;
  /** Same validation as addCard; a side's untagged text may stay as `card` has it, untouched. */
  updateCard(deck: Deck, card: Card, content: CardContent): Promise<Card>;
  removeCard(deck: Deck, card: Card): Promise<void>;
  /**
   * Say which language the deck's untagged ("") fronts, and its untagged
   * backs, are in: each such side's text is kept, under that language.
   * A side that states its language is never touched, nor is a card still
   * as its library release has it (unlikeRelease), which a later release
   * would no longer update once changed. One conditional write of the
   * cards document (changedElsewhere when it changed since it was read);
   * none when nothing is to change. Rejects a tag that is no language
   * code (textLanguageInvalid) before any write. How many cards changed.
   */
  stateCardLanguages(deck: Deck, languages: StatedLanguages): Promise<number>;
  /**
   * Make one bulk edit of the deck's cards (domain/cardBulk.ts), as the
   * user previewed it: the edit is planned again on the cards as they
   * are, and written in ONE write of the cards document, made only if it
   * is still as read (If-Match), then, when cards go with their review
   * states, ONE write of the reviews document; then the deck's schedule
   * in the digest is brought up to date. A cards document changed
   * meanwhile (or made since it was read as absent) is read and the edit
   * planned again, up to three times in all; once that plan is not the
   * one previewed, changedElsewhere, and nothing is written. Nothing is written when the plan saves and
   * removes nothing. The deck's own entry is untouched, as updateCard
   * leaves it. Resolves to the plan as written, whose inverse undoes it.
   */
  editCards(
    instanceUrl: string,
    deck: Deck,
    ids: readonly string[],
    edit: CardEdit,
    previewed: CardEditPlan,
  ): Promise<CardEditPlan>;
  /**
   * Undo an edit editCards made, the same way: its inverse is written
   * while the cards are as the edit left them (planUndo), else
   * changedElsewhere and nothing is written.
   */
  undoCardEdit(instanceUrl: string, deck: Deck, plan: CardEditPlan): Promise<void>;
  /**
   * Forget the cards of these ids, in one direction or (absent) in both
   * (domain/reviewStateEdits.ts, resetStates): their review states go,
   * so the scheduler sees them as new; their answers stay in the log.
   * One write of the reviews document, none when no card has a state;
   * then the deck's schedule in the digest is brought up to date. How
   * many cards were forgotten.
   */
  resetCards(
    instanceUrl: string,
    deck: Deck,
    ids: readonly string[],
    direction?: StudyDirection,
  ): Promise<number>;
  /**
   * Set the cards of these ids due on `due` (a study day), in one
   * direction or (absent) in both, their snapshot for resetting the
   * study day dropped (rescheduleStates). Refuses a day that is no date
   * (dueDayInvalid) before any read. A card never studied stays new.
   * One write of the reviews document, as resetCards. How many cards
   * were set due.
   */
  rescheduleCards(
    instanceUrl: string,
    deck: Deck,
    ids: readonly string[],
    due: string,
    direction?: StudyDirection,
  ): Promise<number>;
  /**
   * Move or copy the cards of these ids from the deck `from` to the deck
   * `to` of the same instance (domain/cardTransfer.ts,
   * planCardTransfer), with their review states when `keepProgress`.
   * The target is written first: its cards document in ONE write made
   * only if it is still as read (If-Match), then its reviews document;
   * for a move, then the source's reviews document, and its cards
   * document, likewise If-Match. A document changed meanwhile (or made
   * since it was read as absent) has the whole transfer planned again on
   * the decks as they are, up to three times in all, then
   * changedElsewhere. A transfer stopped half way (the
   * target written, the source not, or only its reviews) is finished by
   * making it again: cards the target holds already are not written
   * twice, and keep the states they have there. Then the
   * target's schedule in the digest is brought up to date, and for a
   * move the source's. The answer log is untouched. Refuses a transfer
   * to `from` itself (cardTransferSameDeck) before any read. Resolves to
   * the plan as written.
   */
  transferCards(
    instanceUrl: string,
    from: Deck,
    to: Deck,
    ids: readonly string[],
    options: TransferOptions,
  ): Promise<CardTransferPlan>;
  /**
   * Save the deck as a file (domain/deckFile.ts, DeckArchive.exportDeck),
   * in `options.format`, named after its title (deckFileName), with its
   * progress when `options.withProgress`. Writes nothing to the pod.
   */
  exportDeckFile(deck: Deck, options: DeckFileOptions): Promise<void>;
  /**
   * The deck file the user picks (Turtle or JSON-LD, by its name, else
   * its text: deckFileFormatOf), read as DeckArchive.readDeckFile reads
   * it; null when they pick none. Writes nothing.
   */
  openDeckFile(): Promise<DeckFile | null>;
  /**
   * Make the file's deck a new deck of the instance (importedDeck): its
   * id kept unless the instance uses it, its cards with their ids and,
   * with `withProgress`, its review states and a course's completed
   * chapters. Its cards document is written in ONE write, only if there
   * is none at its URL yet (one left by an import cut off has the deck
   * given a fresh id, once); then its review states in one write of its
   * reviews document; then its entry in the catalog, so the deck shows
   * only once it is whole. Each write is checked against the shapes.
   * Then the deck's schedule in the digest is brought up to date. The
   * deck as written.
   */
  importDeckFile(
    instanceUrl: string,
    file: DeckFile,
    options: { withProgress: boolean },
  ): Promise<Deck>;
}

/**
 * How often a bulk edit of a deck's cards is planned and written, in
 * all, while the cards document keeps changing elsewhere (412).
 */
const CARD_EDIT_ATTEMPTS = 3;

/**
 * Whether a write of a cards document was refused because it changed
 * since it was read, or was made since it was read as absent (a 412).
 */
function cardsChangedElsewhere(error: unknown): boolean {
  return (
    changedElsewhere(error) || (error instanceof AppError && error.code === "createdElsewhere")
  );
}

/**
 * A bulk edit's write of a cards document: one PUT of the whole document,
 * which no pod cuts short, made only while the document is at the
 * version read (none to check when the pod gave none).
 */
function wholeAt(version: string | null): { whole: true; version?: string } {
  return version === null ? { whole: true } : { whole: true, version };
}

/**
 * A deck's cards and their review states (domain/cardBulk.ts,
 * domain/cardTransfer.ts): each added, changed and removed, edited,
 * forgotten, set due or moved between decks in bulk, and a deck saved as
 * a file or made of one (domain/deckFile.ts), the deck's schedule in the
 * digest brought up to date after.
 */
export function createCardUseCases({
  deckRepository,
  reviewStateRepository,
  deckLibrary,
  deckArchive,
  fileExchange,
  digestStore,
  newId,
  now,
}: {
  deckRepository: DeckRepository;
  reviewStateRepository: ReviewStateRepository;
  deckLibrary: DeckLibrary;
  deckArchive: DeckArchive;
  fileExchange: FileExchange;
  digestStore: Pick<DigestStore, "refresh">;
  newId: () => string;
  now: () => Date;
}): CardUseCases {
  /**
   * Normalized card content, or a throw naming what is missing; `saved`
   * the card edited, if any, whose untagged sides may stay as they are.
   */
  function validContent(content: CardContent, saved?: CardContent): CardContent {
    const validation = validateCardContent(content, saved);
    if (!validation.ok) {
      throw validation.error;
    }
    return validation.content;
  }
  /**
   * Write a bulk edit of the deck's cards (editCards, undoCardEdit): the
   * changes `plan` makes of the cards and review states as they are now,
   * in one conditional write of the cards document, again from a fresh
   * read when it changed meanwhile; then one write of the reviews
   * document, and the digest brought up to date. Resolves to the
   * changes written.
   */
  async function writeCardEdit<T extends CardChanges>(
    instanceUrl: string,
    deck: Deck,
    plan: (cards: Card[], reviews: ReviewState[]) => T,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const [read, reviews] = await Promise.all([
        readNow(deckRepository.readCardsSince(deck, undefined)),
        reviewStateRepository.listReviewStates(deck),
      ]);
      const changes = plan(read.value, reviews.sm2);
      if (changes.save.length === 0 && changes.remove.length === 0) return changes;
      try {
        await deckRepository.applyCardChanges(
          deck,
          { save: changes.save, remove: changes.remove },
          wholeAt(read.version),
        );
      } catch (error) {
        if (cardsChangedElsewhere(error) && attempt < CARD_EDIT_ATTEMPTS) continue;
        throw error;
      }
      // A card joins before its state, and leaves before it: no state is ever without its card for long.
      if (changes.reviewSaves.length > 0 || changes.reviewRemovals.length > 0) {
        // A card removed takes every state it has with it, SM-2's and FSRS-6's, as removing a card does;
        // another scheduler's stays. Undone, its SM-2 states come back, and FSRS-6 estimates from them.
        await reviewStateRepository.applyReviewChanges(deck, {
          save: changes.reviewSaves,
          remove: changes.reviewRemovals,
          every: true,
        });
      }
      // The edit is made: a digest left behind is brought up to date by the next deck list.
      await digestStore.refresh(instanceUrl, deck).catch(() => undefined);
      return changes;
    }
  }
  /**
   * Write an edit of the deck's review states (resetCards,
   * rescheduleCards) in one write of the reviews document, none when it
   * changes nothing; then bring the digest up to date. How many cards it
   * changed.
   */
  async function writeReviewEdit(
    instanceUrl: string,
    deck: Deck,
    changes: { save: ReviewState[]; remove: ReviewKey[]; fsrsSave?: FsrsState[] },
  ): Promise<number> {
    const { save, remove, fsrsSave = [] } = changes;
    const cards = new Set([...save, ...remove].map((key) => key.cardId));
    if (cards.size === 0) return 0;
    // A card forgotten loses every state it has that way, SM-2's and FSRS-6's, so none is read in its place.
    await reviewStateRepository.applyReviewChanges(deck, {
      save,
      remove,
      fsrs: { save: fsrsSave, remove: [] },
      every: true,
    });
    // The edit is made: a digest left behind is brought up to date by the next deck list.
    await digestStore.refresh(instanceUrl, deck).catch(() => undefined);
    return cards.size;
  }
  /**
   * One attempt at a transfer (transferCards): read both decks, plan,
   * write the target's documents, then for a move the source's (its
   * reviews before its cards), each cards document If-Match its read.
   */
  async function transferOnce(
    from: Deck,
    to: Deck,
    ids: readonly string[],
    options: TransferOptions,
  ): Promise<CardTransferPlan> {
    const [sourceCards, sourceStates, targetCards, targetStates] = await Promise.all([
      readNow(deckRepository.readCardsSince(from, undefined)),
      reviewStateRepository.listReviewStates(from),
      readNow(deckRepository.readCardsSince(to, undefined)),
      reviewStateRepository.listReviewStates(to),
    ]);
    const plan = planCardTransfer(
      {
        url: from.url,
        cards: sourceCards.value,
        states: sourceStates.sm2,
        fsrs: sourceStates.fsrs,
      },
      { url: to.url, cards: targetCards.value, states: targetStates.sm2, fsrs: targetStates.fsrs },
      ids,
      options,
    );
    // The target first: a move stopped here leaves the cards in both decks, never in neither.
    if (plan.target.save.length > 0) {
      await deckRepository.applyCardChanges(
        to,
        { save: plan.target.save, remove: [] },
        wholeAt(targetCards.version),
      );
    }
    if (plan.target.reviewSaves.length > 0 || plan.target.reviewRemovals.length > 0) {
      await reviewStateRepository.applyReviewChanges(to, {
        save: plan.target.reviewSaves,
        remove: plan.target.reviewRemovals,
        fsrs: { save: plan.target.fsrsSaves, remove: plan.target.fsrsRemovals },
        every: true,
      });
    }
    // The source's states before its cards: a move stopped between leaves the cards in the
    // source without progress, which the target has, and making it again finishes it.
    if (plan.source.reviewRemovals.length > 0) {
      await reviewStateRepository.applyReviewChanges(from, {
        save: [],
        remove: plan.source.reviewRemovals,
        every: true,
      });
    }
    if (plan.source.remove.length > 0) {
      await deckRepository.applyCardChanges(
        from,
        { save: [], remove: plan.source.remove },
        wholeAt(sourceCards.version),
      );
    }
    return plan;
  }

  return {
    listCards(deck) {
      return deckRepository.listCards(deck);
    },
    listDeckReviewStates(deck) {
      return reviewStateRepository.listReviewStates(deck);
    },
    async addCard(deck, content) {
      return deckRepository.addCard(deck, validContent(content));
    },
    async updateCard(deck, card, content) {
      return deckRepository.updateCard(deck, card, validContent(content, card));
    },
    removeCard(deck, card) {
      return deckRepository.removeCard(deck, card);
    },
    async stateCardLanguages(deck, languages) {
      const stated: StatedLanguages = {};
      for (const side of ["front", "back"] as const) {
        const tag = languages[side];
        if (tag === undefined) continue;
        const canonical = canonicalTag(tag);
        if (canonical === null) throw new AppError("textLanguageInvalid", { tag });
        stated[side] = canonical;
      }
      if (Object.keys(stated).length === 0) return 0;
      const [cards, release] = await Promise.all([
        deckRepository.listCards(deck),
        deck.sourceUrl === undefined ? null : deckLibrary.fetchLibraryDeck(deck.sourceUrl),
      ]);
      const ids = unlikeRelease(cards, release?.cards)
        .filter((card) => withStatedLanguages(card, stated) !== null)
        .map((card) => card.id);
      return ids.length === 0 ? 0 : deckRepository.stateCardLanguages(deck, ids, stated);
    },
    editCards(instanceUrl, deck, ids, edit, previewed) {
      return writeCardEdit(instanceUrl, deck, (cards, reviews) => {
        const plan = planCardEdit(cards, ids, edit, reviews);
        if (!sameCardEditPlan(plan, previewed))
          throw new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });
        return plan;
      });
    },
    async undoCardEdit(instanceUrl, deck, plan) {
      await writeCardEdit(instanceUrl, deck, (cards) => {
        const inverse = planUndo(cards, plan);
        if (inverse === null)
          throw new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });
        return inverse;
      });
    },
    async resetCards(instanceUrl, deck, ids, direction) {
      const states = await reviewStateRepository.listReviewStates(deck);
      // An FSRS-6 state without an SM-2 state beside it goes too: every removes both kinds.
      const remove = resetStates([...states.sm2, ...states.fsrs], ids, direction);
      return writeReviewEdit(instanceUrl, deck, { save: [], remove });
    },
    async rescheduleCards(instanceUrl, deck, ids, due, direction) {
      if (!isStudyDay(due)) throw new AppError("dueDayInvalid", { day: due });
      const states = await reviewStateRepository.listReviewStates(deck);
      // Both schedulers' states fall due that day, so it holds whichever sets the due days.
      return writeReviewEdit(instanceUrl, deck, {
        save: rescheduleStates(states.sm2, ids, due, direction),
        remove: [],
        fsrsSave: rescheduleStates(states.fsrs, ids, due, direction),
      });
    },
    async transferCards(instanceUrl, from, to, ids, options) {
      if (from.url === to.url) throw new AppError("cardTransferSameDeck");
      for (let attempt = 1; ; attempt++) {
        try {
          const plan = await transferOnce(from, to, ids, options);
          // The cards are where they go: a digest left behind is brought up to date by the next deck list.
          await digestStore.refresh(instanceUrl, to).catch(() => undefined);
          if (options.mode === "move")
            await digestStore.refresh(instanceUrl, from).catch(() => undefined);
          return plan;
        } catch (error) {
          if (!cardsChangedElsewhere(error) || attempt === CARD_EDIT_ATTEMPTS) throw error;
        }
      }
    },
    async exportDeckFile(deck, options) {
      const text = await deckArchive.exportDeck(deck, options);
      fileExchange.save(
        deckFileName(deck, options.format),
        DECK_FILE_TYPES[options.format].mediaType,
        text,
      );
    },
    async openDeckFile() {
      const picked = await fileExchange.open(DECK_FILE_ACCEPT);
      if (picked === null) return null;
      const format = deckFileFormatOf(picked.name, picked.text);
      return {
        name: picked.name,
        format,
        content: await deckArchive.readDeckFile(picked.text, format, deckFileBaseOf(picked.name)),
      };
    },
    async importDeckFile(instanceUrl, file, { withProgress }) {
      let decks = await deckRepository.listDecks(instanceUrl);
      for (let attempt = 1; ; attempt++) {
        const { deck, cards, reviews, fsrsReviews } = importedDeck(instanceUrl, file.content, {
          withProgress,
          decks,
          freshId: `deck-${newId()}`,
          now: now().toISOString(),
        });
        try {
          // Only where nothing is yet: a deck's documents are never written over.
          await deckRepository.applyCardChanges(
            deck,
            { save: cards, remove: [] },
            { whole: true, version: ABSENT_VERSION },
          );
        } catch (error) {
          // A cards document an import cut off before its entry left: the deck takes another id.
          if (!(error instanceof AppError && error.code === "createdElsewhere") || attempt === 2)
            throw error;
          decks = [...decks, deck];
          continue;
        }
        if (reviews.length + fsrsReviews.length > 0)
          await reviewStateRepository.applyReviewChanges(deck, {
            save: reviews,
            remove: [],
            fsrs: { save: fsrsReviews, remove: [] },
          });
        await deckRepository.registerDeck(deck);
        // The deck is in: a digest left behind is brought up to date by the next deck list.
        await digestStore.refresh(instanceUrl, deck).catch(() => undefined);
        return deck;
      }
    },
  };
}
