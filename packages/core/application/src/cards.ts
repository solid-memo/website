// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  MAX_CATALOG_LINKS,
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
  carriedIdsOf,
  planCardTransfer,
  sharesDocuments,
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
import type { FileExchange } from "./ports/device";
import type { DeckLibrary, DeckArchive } from "./ports/library";
import type { DeckRepository, ReviewChanges, ReviewStateRepository } from "./ports/pod";
import { AppError } from "@solid-memo/domain/appError";
import {
  PLACE_ATTEMPTS,
  atVersion,
  cutOffOf,
  finishCutOffImport,
  readNow,
  unsent,
  writeInOrder,
  type WriteSet,
} from "./writes";
import type { DigestStore } from "./digestStore";
import type { ReadScope } from "./readScope";
import type { inTurns } from "./atOnce";

export interface CardUseCases {
  /** The deck's cards, read now: for a screen of the one deck. */
  listCards(deck: Deck): Promise<Card[]>;
  /**
   * The deck's cards, as listCards reads them, in turns with every other
   * deck's read for a list of decks (the Studio's deck table, and the
   * copies planLibraryUpgrade plans): a catalog as long as anyone may
   * write never has all of its decks' cards read together. A read whose
   * `signal` is aborted before its turn comes gives the turn up without
   * reading, so the reads of a screen that has gone don't hold up the
   * next. Its caller caches it under a key of its own, so that a screen
   * of one deck, reading with listCards, never waits for it.
   */
  listCardsInTurn(deck: Deck, signal?: AbortSignal): Promise<Card[]>;
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
   * removes nothing. Both writes are made and checked before the first
   * is sent, so a card or a state a newer version wrote that either
   * would rewrite refuses the edit (writtenByNewerApp) with nothing
   * written. The deck's own entry is untouched, as updateCard
   * leaves it. Resolves to the plan as written, whose inverse undoes it;
   * `cardsWritten` hears of that plan once the cards document is
   * written, so that an edit whose reviews write then fails can still be
   * undone.
   */
  editCards(
    instanceUrl: string,
    deck: Deck,
    ids: readonly string[],
    edit: CardEdit,
    previewed: CardEditPlan,
    cardsWritten?: (plan: CardEditPlan) => void,
  ): Promise<CardEditPlan>;
  /**
   * Undo an edit editCards made, the same way: its inverse is written
   * while the cards are as the edit left them (planUndo), else
   * changedElsewhere and nothing is written. A deleted card already back
   * as it was is not written again, so an undo whose reviews write
   * failed can be made again and writes the deleted cards' review states
   * again, those from before the edit.
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
   * changedElsewhere. Every write is made and checked before the first
   * is sent (prepareCardChanges, prepareReviewChanges), so a card or a
   * state one would refuse refuses the transfer with nothing written. A
   * transfer stopped half way (the
   * target written, the source not, or only its reviews) is finished by
   * making it again: cards the target holds already are not written
   * twice, and keep the states they have there. Then the
   * target's schedule in the digest is brought up to date, and for a
   * move the source's. The answer log is untouched. Refuses a transfer
   * to `from` itself, or to a deck that shares a cards or reviews
   * document with it (cardTransferSameDeck), before any read. The
   * source's cards and review states are copied into `to`, so each of its
   * two documents is read as the user only when it is the instance's
   * (ReadScope.asNoOneOf): an instance attached from someone else's pod may
   * name a deck whose documents are the user's own, kept from everyone.
   * Any other is read as no one. Resolves to the plan as written.
   */
  transferCards(
    instanceUrl: string,
    from: Deck,
    to: Deck,
    ids: readonly string[],
    options: TransferOptions,
  ): Promise<CardTransferPlan>;
  /**
   * Save the deck of the instance as a file (domain/deckFile.ts,
   * DeckArchive.exportDeck), in `options.format`, named after its title
   * (deckFileName), with its progress when `options.withProgress`. Each
   * of the deck's two documents is read as the user only when it is the
   * instance's (ReadScope.asNoOneOf), any other as no one, as transferCards
   * reads a source: the file holds what it reads. Writes nothing to the
   * pod.
   */
  exportDeckFile(instanceUrl: string, deck: Deck, options: DeckFileOptions): Promise<void>;
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
   * A failure after the cards document deletes the documents the import
   * wrote, which no entry names. An instance with MAX_CATALOG_LINKS
   * decks already is refused (catalogFull) before anything is written,
   * and so is a deck whose cards or review states document would be
   * larger than a read of it outside the user's storages takes in
   * (deckFileTooLarge, `fromFile`). Then the deck's schedule in the
   * digest is brought up to date. The deck as written.
   */
  importDeckFile(
    instanceUrl: string,
    file: DeckFile,
    options: { withProgress: boolean },
  ): Promise<Deck>;
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
  readScope,
  cardsTurn,
  newId,
  now,
  pause,
}: {
  deckRepository: DeckRepository;
  reviewStateRepository: ReviewStateRepository;
  deckLibrary: DeckLibrary;
  deckArchive: DeckArchive;
  fileExchange: FileExchange;
  digestStore: Pick<DigestStore, "refresh">;
  readScope: Pick<ReadScope, "asNoOneOf">;
  /** The turns whole decks' cards are read in, shared with planLibraryUpgrade (listCardsInTurn). */
  cardsTurn: ReturnType<typeof inTurns>;
  newId: () => string;
  now: () => Date;
  /** Waits before a write refused with a 412 is planned again (pauseBefore). */
  pause: (attempt: number) => Promise<void>;
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
   * in one conditional write of the cards document (one PUT of the whole
   * document, which no pod cuts short), then one write of the reviews
   * document, made only while it is as read (writeInOrder): planned again
   * from fresh reads while nothing was sent; one that changed once the
   * cards were sent has the same changes made of it read afresh. A plan
   * that gives null no longer fits what is there: changedElsewhere, with
   * nothing written. Then the digest is brought up to date. Both writes
   * are made and checked before the first is sent, so one that would be
   * refused (a card or a state a newer version wrote that the edit would
   * rewrite) refuses the edit with nothing written. `cardsWritten` hears
   * of the changes once the cards are written, before the reviews are.
   * Resolves to the changes written.
   */
  async function writeCardEdit<T extends CardChanges>(
    instanceUrl: string,
    deck: Deck,
    plan: (cards: Card[], reviews: ReviewState[]) => T | null,
    cardsWritten: (changes: T) => void = () => undefined,
  ): Promise<T> {
    const { result: changes, sent } = await writeInOrder<T | null>(
      async () => {
        const [read, reviews] = await Promise.all([
          readNow(deckRepository.readCardsSince(deck, undefined)),
          readNow(reviewStateRepository.readReviewStatesSince(deck, undefined)),
        ]);
        const changes = plan(read.value, reviews.value.sm2);
        if (changes === null) return { result: null, writes: [] };
        const cardsChange = changes.save.length > 0 || changes.remove.length > 0;
        const reviewsChange = changes.reviewSaves.length > 0 || changes.reviewRemovals.length > 0;
        if (!cardsChange && !reviewsChange) return { result: changes, writes: [] };
        // A card removed takes every state it has with it, SM-2's and FSRS-6's, as removing a card does;
        // another scheduler's stays. Undone, its SM-2 states come back, and FSRS-6 estimates from them.
        const reviewChanges: ReviewChanges = {
          save: changes.reviewSaves,
          remove: changes.reviewRemovals,
          every: true,
        };
        const writeCards = cardsChange
          ? await deckRepository.prepareCardChanges(
              deck,
              { save: changes.save, remove: changes.remove },
              { whole: true, ...atVersion(read.version) },
            )
          : undefined;
        const writeReviews = reviewsChange
          ? await reviewStateRepository.prepareReviewChanges(
              deck,
              reviewChanges,
              atVersion(reviews.version),
            )
          : undefined;
        // A card joins before its state, and leaves before it: no state is ever without its card for long.
        return { result: changes, writes: [writeCards, writeReviews] };
      },
      {
        pause,
        reached: (at, changes) => {
          if (at === 1) cardsWritten(changes!);
        },
      },
    );
    if (changes === null) throw new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });
    // The edit is made: a digest left behind is brought up to date by the next deck list.
    if (sent > 0) await digestStore.refresh(instanceUrl, deck).catch(() => undefined);
    return changes;
  }
  /**
   * Write an edit of the deck's review states (resetCards,
   * rescheduleCards): the changes `edit` makes of them as the reviews
   * document holds them now, in one write of it made only while it is as
   * read, made again of a fresh read when it changed meanwhile (a grade
   * on another device), none when it changes nothing; then bring the
   * digest up to date. How many cards it changed.
   */
  async function writeReviewEdit(
    instanceUrl: string,
    deck: Deck,
    edit: (states: ReviewStates) => {
      save: ReviewState[];
      remove: ReviewKey[];
      fsrsSave?: FsrsState[];
    },
  ): Promise<number> {
    const written = await reviewStateRepository.editReviewStates(deck, (states) => {
      const { save, remove, fsrsSave = [] } = edit(states);
      if (save.length + remove.length === 0) return null;
      // A card forgotten loses every state it has that way, SM-2's and FSRS-6's, so none is read in its place.
      return { save, remove, fsrs: { save: fsrsSave, remove: [] }, every: true };
    });
    if (written === null) return 0;
    // The edit is made: a digest left behind is brought up to date by the next deck list.
    await digestStore.refresh(instanceUrl, deck).catch(() => undefined);
    return new Set([...written.save, ...written.remove].map((key) => key.cardId)).size;
  }
  /**
   * One plan of a transfer (transferCards): read both decks, the
   * source's documents as no one where `asNoOne` says, plan, and make
   * the writes of the target's documents, then for a move the source's
   * (its reviews before its cards), each If-Match its read.
   */
  async function planTransfer(
    from: Deck,
    to: Deck,
    ids: readonly string[],
    options: TransferOptions,
    asNoOne: { cards: boolean; reviews: boolean },
  ): Promise<WriteSet<CardTransferPlan>> {
    const [sourceCards, sourceStates, targetCards, targetStates] = await Promise.all([
      readNow(deckRepository.readCardsSince(from, undefined, { asNoOne: asNoOne.cards })),
      readNow(
        reviewStateRepository.readReviewStatesSince(from, undefined, { asNoOne: asNoOne.reviews }),
      ),
      readNow(deckRepository.readCardsSince(to, undefined)),
      readNow(reviewStateRepository.readReviewStatesSince(to, undefined)),
    ]);
    const plan = planCardTransfer(
      {
        url: from.url,
        cardsDocumentUrl: from.cardsDocumentUrl,
        reviewsDocumentUrl: from.reviewsDocumentUrl,
        cards: sourceCards.value,
        states: sourceStates.value.sm2,
        fsrs: sourceStates.value.fsrs,
      },
      {
        url: to.url,
        cardsDocumentUrl: to.cardsDocumentUrl,
        reviewsDocumentUrl: to.reviewsDocumentUrl,
        cards: targetCards.value,
        states: targetStates.value.sm2,
        fsrs: targetStates.value.fsrs,
      },
      ids,
      options,
    );
    // What the source says of a card beyond what this app knows goes with it, and with its states.
    const cardIds = Object.fromEntries(plan.cards.map((card) => [card.to, card.from]));
    const targetReviews: ReviewChanges = {
      save: plan.target.reviewSaves,
      remove: plan.target.reviewRemovals,
      fsrs: { save: plan.target.fsrsSaves, remove: plan.target.fsrsRemovals },
      every: true,
      carried: { deck: from, asNoOne: asNoOne.reviews, ids: cardIds },
    };
    const sourceReviews: ReviewChanges = {
      save: [],
      remove: plan.source.reviewRemovals,
      every: true,
    };
    // Every write is made and checked before the first is sent: what would refuse one (a card or a
    // state a newer version wrote that the move would rewrite) refuses the move with nothing
    // written. Each is made only while its document is at the version the transfer was planned
    // from, so a document changed since has the whole transfer planned again, not one checked on
    // an older read. A reviews document that changes once a cards document was sent has the same
    // changes made of it read afresh (prepareReviewChanges).
    const writeTargetCards =
      plan.target.save.length > 0
        ? await deckRepository.prepareCardChanges(
            to,
            { save: plan.target.save, remove: [] },
            {
              whole: true,
              ...atVersion(targetCards.version),
              carried: {
                deck: from,
                asNoOne: asNoOne.cards,
                ids: carriedIdsOf(plan, sourceCards.value),
              },
            },
          )
        : undefined;
    const writeTargetReviews =
      plan.target.reviewSaves.length > 0 || plan.target.reviewRemovals.length > 0
        ? await reviewStateRepository.prepareReviewChanges(
            to,
            targetReviews,
            atVersion(targetStates.version),
          )
        : undefined;
    const writeSourceReviews =
      plan.source.reviewRemovals.length > 0
        ? await reviewStateRepository.prepareReviewChanges(
            from,
            sourceReviews,
            atVersion(sourceStates.version),
          )
        : undefined;
    const writeSourceCards =
      plan.source.remove.length > 0
        ? await deckRepository.prepareCardChanges(
            from,
            { save: [], remove: plan.source.remove },
            { whole: true, ...atVersion(sourceCards.version) },
          )
        : undefined;
    return {
      result: plan,
      writes: [
        // The target first: a move stopped here leaves the cards in both decks, never in neither.
        writeTargetCards,
        writeTargetReviews,
        // The source's states before its cards: a move stopped between leaves the cards in the
        // source without progress, which the target has, and making it again finishes it.
        writeSourceReviews,
        writeSourceCards,
      ],
    };
  }

  return {
    listCards(deck) {
      return deckRepository.listCards(deck);
    },
    listCardsInTurn(deck, signal) {
      return cardsTurn(() => {
        signal?.throwIfAborted();
        return deckRepository.listCards(deck);
      });
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
    editCards(instanceUrl, deck, ids, edit, previewed, cardsWritten) {
      return writeCardEdit(
        instanceUrl,
        deck,
        (cards, reviews) => {
          const plan = planCardEdit(cards, ids, edit, reviews);
          return sameCardEditPlan(plan, previewed) ? plan : null;
        },
        cardsWritten,
      );
    },
    async undoCardEdit(instanceUrl, deck, plan) {
      await writeCardEdit(instanceUrl, deck, (cards) => planUndo(cards, plan));
    },
    resetCards(instanceUrl, deck, ids, direction) {
      // An FSRS-6 state without an SM-2 state beside it goes too: every removes both kinds.
      return writeReviewEdit(instanceUrl, deck, (states) => ({
        save: [],
        remove: resetStates([...states.sm2, ...states.fsrs], ids, direction),
      }));
    },
    async rescheduleCards(instanceUrl, deck, ids, due, direction) {
      if (!isStudyDay(due)) throw new AppError("dueDayInvalid", { day: due });
      // Both schedulers' states fall due that day, so it holds whichever sets the due days.
      return writeReviewEdit(instanceUrl, deck, (states) => ({
        save: rescheduleStates(states.sm2, ids, due, direction),
        remove: [],
        fsrsSave: rescheduleStates(states.fsrs, ids, due, direction),
      }));
    },
    async transferCards(instanceUrl, from, to, ids, options) {
      if (sharesDocuments(from, to)) throw new AppError("cardTransferSameDeck");
      // Copied into `to`: each of the source's documents read as the user only when it is the instance's.
      const asNoOne = await readScope.asNoOneOf(instanceUrl, from);
      // Planned again on a 412 even once some writes were sent: a card the target holds already, saying
      // the same, is not written again (planCardTransfer), so the plan made afresh finishes the transfer.
      const { result: plan } = await writeInOrder(
        () => planTransfer(from, to, ids, options, asNoOne),
        { replanAfterSent: true, pause },
      );
      // The cards are where they go: a digest left behind is brought up to date by the next deck list.
      await digestStore.refresh(instanceUrl, to).catch(() => undefined);
      if (options.mode === "move")
        await digestStore.refresh(instanceUrl, from).catch(() => undefined);
      return plan;
    },
    async exportDeckFile(instanceUrl, deck, options) {
      // Saved to a file the user may hand on: each document read as the user only when it is the instance's.
      const text = await deckArchive.exportDeck(deck, options, {
        asNoOne: await readScope.asNoOneOf(instanceUrl, deck),
      });
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
      const decks = await deckRepository.listDecks(instanceUrl);
      // A catalog with no room for its entry is refused before the deck's documents are written.
      if (decks.length >= MAX_CATALOG_LINKS)
        throw new AppError("catalogFull", { limit: MAX_CATALOG_LINKS });
      /** Each deck planned so far: a cards document at one's URL makes the next take another id. */
      const tried: Deck[] = [];
      let imported: Deck;
      try {
        ({ result: imported } = await writeInOrder(
          async () => {
            const { deck, cards, reviews, fsrsReviews } = importedDeck(instanceUrl, file.content, {
              withProgress,
              decks: [...decks, ...tried],
              freshId: `deck-${newId()}`,
              now: now().toISOString(),
            });
            tried.push(deck);
            // The progress is made, and refused if no read would take it in, before the cards are written.
            const sendReviews =
              reviews.length + fsrsReviews.length > 0
                ? await reviewStateRepository.prepareReviewChanges(deck, {
                    save: reviews,
                    remove: [],
                    fsrs: { save: fsrsReviews, remove: [] },
                    fromFile: true,
                  })
                : undefined;
            return {
              result: deck,
              writes: [
                // Only where nothing is yet: a deck's documents are never written over.
                () =>
                  deckRepository.applyCardChanges(
                    deck,
                    { save: cards, remove: [] },
                    { whole: true, version: ABSENT_VERSION, fromFile: true },
                  ),
                sendReviews,
                () => deckRepository.registerDeck(deck),
              ],
            };
          },
          {
            // A cards document an import cut off before its entry left: the deck takes another id, at once.
            attempts: PLACE_ATTEMPTS,
            replanOn: (error) => error instanceof AppError && error.code === "createdElsewhere",
            pause: async () => undefined,
          },
        ));
      } catch (error) {
        const { sent, failedAt } = cutOffOf(error);
        // Failed at the cards document or before it: the failure stands as it is.
        if (sent === 0) throw error;
        // The review states' document too once sent, or when its write may have been made, its answer lost.
        const deck = tried.at(-1)!;
        const written = [deck.cardsDocumentUrl];
        if (sent > 1 || (failedAt === 1 && !unsent(error))) written.push(deck.reviewsDocumentUrl);
        imported = await finishCutOffImport(deckRepository, deck, written, error);
      }
      // The deck is in: a digest left behind is brought up to date by the next deck list.
      await digestStore.refresh(instanceUrl, imported).catch(() => undefined);
      return imported;
    },
  };
}
