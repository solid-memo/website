// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * The driven ports of the data in a pod: instances, decks and their cards, review states, preferences, palettes, the digest, the answer log, and moving a guest's pod. The solid adapters implement them.
 */

import type { Catalog, CatalogRead } from "@solid-memo/domain/catalog";
import type { LangText } from "@solid-memo/domain/langText";
import type { CustomPalette } from "@solid-memo/domain/customPalette";
import type { Card, CardContent, Deck } from "@solid-memo/domain/deck";
import type { DeckPause } from "@solid-memo/domain/deckPause";
import type { CompletedChaptersEdit } from "@solid-memo/domain/course";
import type { StatedLanguages } from "@solid-memo/domain/deckLanguages";
import type { DeckTree, DeckTreeEdit } from "@solid-memo/domain/deckTree";
import type {
  Instance,
  InstanceDeletion,
  KeptDocuments,
  InstanceMeta,
  OldRegistrations,
  RegistrationOptions,
  RegistrationTarget,
} from "@solid-memo/domain/instance";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import type { PreferencesRead, StudyPreferences } from "@solid-memo/domain/preferences";
import type { GradedPrompt, PromptStates } from "@solid-memo/domain/grading";
import type { FsrsState, ReviewKey, ReviewState, ReviewStates } from "@solid-memo/domain/review";
import type { Answer } from "@solid-memo/domain/answer";
import type { DigestChange, InstanceDigest } from "@solid-memo/domain/studyDigest";
import type { DraftTriple } from "@solid-memo/domain/release/releaseDraft";
import type { ReadBudget, SharedReads } from "./checks";
import type { Since } from "./shared";

/** Driven port: Solid Memo instances registered in the user's type indexes. */
export interface InstanceRepository {
  /** The instances registered in the private and public type indexes, the first MAX_CATALOG_LINKS of them. */
  listInstances(webId: string): Promise<Instance[]>;
  /** Which type indexes exist, for the UI's warn-and-choose flow. */
  getRegistrationOptions(webId: string): Promise<RegistrationOptions>;
  /**
   * Create the instance container + meta document and register it in the
   * chosen type index (creating the index if needed): its sm:Instance
   * registration, and none for the classes of its data, which are
   * reached from the instance (docs/data-model.md "Discovery chain").
   * Fails loudly and cleans up the container when the registration
   * fails.
   */
  createInstance(args: {
    webId: string;
    containerUrl: string;
    name: string;
    registrationTarget: RegistrationTarget;
  }): Promise<Instance>;
  /**
   * Register an existing instance container in a type index (recovery):
   * its sm:Instance registration only, unless the index has one.
   */
  attachInstance(args: {
    webId: string;
    instanceUrl: string;
    registrationTarget: RegistrationTarget;
  }): Promise<Instance>;
  /**
   * Delete what the instance's container holds of Solid Memo's (its
   * meta, preferences, catalog and digest documents, every deck's cards
   * and reviews documents, the answer log's months), its sub-containers
   * and the container itself only once empty, then drop its type index
   * registrations. Anything else, another app's, is kept, and so is the
   * container holding it. Data goes first: a failure part-way leaves the
   * instance registered, so the user can retry rather than lose track of
   * a half-deleted pod container.
   */
  deleteInstance(args: { webId: string; instance: Instance }): Promise<InstanceDeletion>;
  /**
   * Drop the instance's registrations from the user's type indexes and
   * nothing else: no request goes to the instance's server, so it works
   * whatever that server answers, or if it is gone, and its data stays
   * as it is, to attach again by its address.
   */
  detachInstance(args: { webId: string; instance: Instance }): Promise<void>;
  /**
   * Which registrations earlier versions wrote for the instance's data
   * are still in the user's own type indexes (docs/data-model.md
   * "Registrations"): only those surely the app's, by their class, what
   * they name and the app's own name for them; never an sm:Instance
   * one. An index that cannot be read is left out, and said to be
   * unreadable; one that is not there holds none. Reads only.
   */
  readOldRegistrations(args: { webId: string; instanceUrl: string }): Promise<OldRegistrations>;
  /**
   * Remove the registrations readOldRegistrations finds, and nothing
   * else: one save per index that holds any (If-Match, read again and
   * retried when the index changed meanwhile), none in an index that
   * cannot be read. Each index is tried whatever the other answers; the
   * first failure is thrown once both were tried.
   */
  removeOldRegistrations(args: { webId: string; instanceUrl: string }): Promise<void>;
  /**
   * Give the instance's registrations a new title, in every type index
   * that registers it: its sm:Instance registration, which names it in
   * the instance list, and those of its data's classes earlier versions
   * wrote.
   * One write per index, made only if the index is as it was read
   * (If-Match), else read and written again, a few times. An index
   * already saying so is not written.
   */
  renameRegistrations(args: { webId: string; instanceUrl: string; title: string }): Promise<void>;
  /** What the instance's meta document says; null when there is none. */
  readMeta(instanceUrl: string): Promise<InstanceMeta | null>;
  /**
   * Edit the instance's meta as it is now, for the Studio's rename:
   * `change` is given the meta as read and returns the meta to write, or
   * null for no change, which writes nothing. The subject is rewritten in
   * place, in this app's format (unknown triples survive), from that same
   * read, in ONE save made only if the document is still as read
   * (If-Match); when it changed meanwhile, it is read and changed again,
   * a few times. Throws noMetaToUpdate, writing nothing, when there is
   * no meta to edit (none, or one that does not fit its shape): a meta
   * document is created with its instance, never on its own. The meta
   * as it then stands.
   */
  editMeta(
    instanceUrl: string,
    change: (meta: InstanceMeta) => InstanceMeta | null,
  ): Promise<InstanceMeta>;
  /**
   * For the format update: bring the meta document's subject up to this
   * app's format in place (unknown triples survive), in ONE save made
   * only if the document is still as it was read (If-Match): the subject
   * as read, brought up to date in memory, stamped with the format this
   * app writes. Whether anything was written (nothing when it is up to
   * date already, or there is no such document).
   */
  upgradeMeta(instanceUrl: string): Promise<boolean>;
}

/** Driven port: decks and their cards inside one instance. */

/**
 * Where subjects a write makes anew were copied or moved from: the deck
 * that holds them, and for each one written, by its id, the id of the
 * one it is a copy of there. A subject made anew starts from what its
 * source says, so what a later version of the app, or another app, said
 * of it beyond what this app knows goes with it; what this app knows it
 * writes as it is given. `asNoOne` reads the source's document as no
 * one, as the caller read it.
 */
export interface CarriedFrom {
  deck: Deck;
  asNoOne?: boolean;
  ids: Readonly<Record<string, string>>;
}

/** A card to write by its fragment id (DeckRepository.applyCardChanges). */
type CardToSave = CardContent & {
  id: string;
  retired?: true;
  createdAt?: string;
  fromRelease?: string;
};

/** The cards DeckRepository.applyCardChanges saves of a deck, and the ids of those it removes. */
export interface CardChanges {
  save: CardToSave[];
  remove: string[];
}

/**
 * How DeckRepository.applyCardChanges writes a deck's cards document.
 * `fromFile`: the cards of a deck file's import, refused
 * (deckFileTooLarge) before anything is sent when the document, as
 * written, would be larger than a read of it outside the user's
 * storages takes in: no later read could open it.
 */
export interface CardChangeOptions {
  whole?: boolean;
  version?: string;
  carried?: CarriedFrom;
  fromFile?: true;
}

export interface DeckRepository {
  listDecks(instanceUrl: string): Promise<Deck[]>;
  /**
   * The instance's catalog (catalog.ttl#catalog); "misfit" when it has
   * one that does not fit its shape; null when it has none yet.
   */
  readCatalog(instanceUrl: string): Promise<CatalogRead>;
  /** Write the instance's catalog, listing every deck, creating the catalog document if need be. */
  saveCatalog(instanceUrl: string, catalog: Catalog): Promise<void>;
  /**
   * Edit the instance's catalog as it is now, for the Studio: `change`
   * is given the catalog as read (as readCatalog reads it) and returns
   * the catalog to write, or null for no change, which writes nothing.
   * The catalog is written from that same read, as saveCatalog writes
   * it, in ONE save made only if the document is still as read
   * (If-Match; created only if nothing is there, when there is no
   * document); when it changed meanwhile, it is read and changed again,
   * a few times. What `change` throws is thrown at once. What `change`
   * last returned.
   */
  editCatalog<C extends Catalog | null>(
    instanceUrl: string,
    change: (catalog: CatalogRead) => C,
  ): Promise<C>;
  /**
   * Throw what saveCatalog would (writtenByNewerApp when a newer version
   * of the app wrote the catalog or its publisher, a failed write check),
   * writing nothing: for a change that writes other documents before the
   * catalog to check it first, so a refusal leaves them as they were.
   */
  checkCatalogSave(instanceUrl: string, catalog: Catalog): Promise<void>;
  /**
   * For the format update: bring every deck entry of the catalog document
   * stored in an older format up to this app's, in place (unknown triples
   * survive), each as read and brought up to date in memory, and write
   * `catalog` as the instance's catalog when one is given and the
   * document has none (no statements of `#catalog`: one that does not
   * fit its shape, whatever its type, is left as it is), all in ONE save
   * of the catalog document, made only if it is still as it was read
   * (If-Match; created only if nothing is there, when there is no
   * document). An entry that does not fit its
   * shape is left as it is. Whether anything was written.
   */
  upgradeDecks(instanceUrl: string, catalog: Catalog | null): Promise<boolean>;
  /**
   * A new, empty deck by that title. Every way of adding a deck
   * (createDeck, registerDeck, importDeck, addDeck) refuses it, writing
   * nothing, as catalogFull when the catalog has MAX_CATALOG_LINKS decks
   * already: none of them would be read past that.
   */
  createDeck(instanceUrl: string, title: LangText): Promise<Deck>;
  /**
   * Add a deck's entry to its catalog, its course progress
   * (sm:completedChapter) with it: a deck made from a file, whose cards
   * and reviews documents are written already. Throws alreadyExists,
   * writing nothing, when the catalog has an entry of its URL, and
   * catalogFull when it has MAX_CATALOG_LINKS decks.
   */
  registerDeck(deck: Deck): Promise<Deck>;
  /**
   * Removes the deck's catalog entry, cards document and reviews
   * document, and the deck from its group, in the same write. Of a
   * document that also holds another app's data, only the deck's cards
   * and review states are removed, and the document is kept, which the
   * result names, as is one that cannot be read as RDF or, outside the
   * instance's folder, cannot be read at all. A failed read of any other
   * throws before the entry is written: the entry stays, and the removal
   * can be made again.
   */
  removeDeck(deck: Deck): Promise<KeptDocuments>;
  /**
   * Removes several decks as removeDeck does: their cards and reviews
   * documents, then their catalog entries in ONE write of their catalog
   * document. A throw leaves the entries of that document, and any it
   * had not reached, in place.
   */
  removeDecks(decks: readonly Deck[]): Promise<KeptDocuments>;
  /**
   * The instance's decks as the user arranged them into groups
   * (domain/deckTree.ts buildTree); an empty tree when it has no catalog
   * document.
   */
  readDeckTree(instanceUrl: string): Promise<DeckTree>;
  /**
   * Make one edit of the arrangement to the catalog document as it is
   * now: read it, apply the edit to the tree it states, and write what
   * changed in ONE save, made only if the document is as it was read
   * (If-Match); when it changed meanwhile, read it and apply the edit
   * again, a few times, then throw changedElsewhere. An edit that
   * changes nothing writes nothing. Returns the tree as written.
   * Throws deckTreeChanged when the edit no longer fits the tree, and
   * deckTreeTooNew when a newer app arranged it.
   */
  editDeckTree(instanceUrl: string, edit: DeckTreeEdit): Promise<DeckTree>;
  /**
   * Create a deck with all its cards at once — one write of the cards
   * document rather than one per card — remembering the library deck it
   * came from. The cards keep their library ids, and each names the
   * release it was taken from (Card.fromRelease, `content.url`). The
   * entry is checked before anything is written, and a failure after
   * that deletes the cards document, unless the entry was written after
   * all; one that cannot be deleted is reported, as for any import
   * (finishCutOffImport in writes.ts). A release whose license, topics
   * or cards link to the guest's pod is refused before any write
   * (releaseLinksGuestPod, domain/guest.ts linksGuestPod).
   */
  importDeck(instanceUrl: string, content: LibraryDeckContent): Promise<Deck>;
  /**
   * The deck's cards, read as the instance's data is (in the user's own
   * pod as the user), or with `asNoOne`, as no one: for cards copied
   * into a place they may not be the user's to share. The array may be
   * frozen and shared with the other decks that name the cards document
   * (domain/frozen.ts), and its cards with it: never changed in place.
   * With `reads`, the cards document is read as those reads share it.
   */
  listCards(deck: Deck, options?: { asNoOne?: boolean; reads?: SharedReads }): Promise<Card[]>;
  /**
   * The deck's cards unless its cards document is still at `version`
   * (undefined: read them), read as listCards reads them, `asNoOne` too.
   */
  readCardsSince(
    deck: Deck,
    version: string | undefined,
    options?: { asNoOne?: boolean },
  ): Promise<Since<Card[]>>;
  addCard(deck: Deck, content: CardContent): Promise<Card>;
  /**
   * Replaces the card's content, writing it in this app's format; review
   * state is untouched. What `content` does not state (its wrong options,
   * text format and what the card is about), when the card was made and
   * whether it is retired are kept as the card says now, not as `card`,
   * the card as the editor read it, says.
   */
  updateCard(deck: Deck, card: Card, content: CardContent): Promise<Card>;
  /** Removes the card and its review state. */
  removeCard(deck: Deck, card: Card): Promise<void>;
  /**
   * For the format update: bring every card of the deck's cards document
   * stored in an older format up to this app's, in ONE save of the
   * document made only if it is still as it was read (If-Match): each
   * card as read, brought up to date in memory, edited in place, so
   * triples this app does not know survive. Whether anything was written
   * (nothing when no card is outdated, or there is no document).
   */
  upgradeCards(deck: Deck): Promise<boolean>;
  /**
   * State the language of the given cards' untagged fronts and backs
   * (withStatedLanguages), in ONE write of the cards document, made only
   * if the document is as it was read (If-Match): each card is re-keyed
   * as it is in the pod then, so a side that states its language by then
   * is left as it is. A card that no longer exists is skipped. How many
   * cards changed; nothing is written when none did.
   */
  stateCardLanguages(
    deck: Deck,
    cardIds: readonly string[],
    languages: StatedLanguages,
  ): Promise<number>;
  /**
   * Write cards by fragment id, new or existing (an existing card keeps
   * its creation time and triples this app does not know; a new one is
   * made at `createdAt` when given, else now; one that names a release
   * it was taken from, `fromRelease`, names it, else keeps the one it
   * names, if any), retired or not, and
   * remove others, in one write of the cards document (created when
   * there is none, only if nothing is there yet). `whole` writes it as
   * one PUT of the whole document (with the same If-Match), for a bulk
   * edit of text, which a PATCH could have cut short (docs/testing.md).
   * With `version`, the version a read of the document gave
   * (readCardsSince), the changes are written only while the document is
   * still at it: one changed since (changedElsewhere) or created since is
   * not written, as changes made on another read of it would undo what
   * changed. With `carried`, a card or a distractor the document does
   * not hold yet starts from the subject of the source's cards document
   * it is a copy of (CarriedFrom, by fragment id), but for the release
   * that one came from and the distractors it names, which are the
   * source's.
   */
  applyCardChanges(deck: Deck, changes: CardChanges, options?: CardChangeOptions): Promise<void>;
  /**
   * The write applyCardChanges makes, with the document read, and
   * refused and checked as applyCardChanges refuses and checks it, but
   * not sent: the function returned sends it, If-Match that read. For a
   * write made after another, so that what would refuse it refuses it
   * before the first, and what is sent is what was checked.
   */
  prepareCardChanges(
    deck: Deck,
    changes: CardChanges,
    options?: CardChangeOptions,
  ): Promise<() => Promise<void>>;
  /**
   * Write the card only when the deck has no card it can read at its
   * fragment id, in one write of the cards document as applyCardChanges
   * writes it. A card already there stays as it is, its text and the
   * release it names, or none, and nothing is written. Says whether the
   * card was written.
   */
  addCardIfAbsent(deck: Deck, card: CardToSave): Promise<boolean>;
  /**
   * Add a deck's catalog entry as the deck says it, its chapters
   * completed (sm:completedChapter) included: for a deck whose documents
   * are written already, at the URLs the caller chose for it in this
   * instance, as when a guest's study is added to an instance. One write
   * of the catalog document (If-Match the read; created when there is
   * none), read and made again on a 412, a few times at most. Refuses
   * (createdElsewhere, writing nothing) when the catalog has an entry at
   * the deck's URL, and (catalogFull) when it has MAX_CATALOG_LINKS
   * decks. The deck as written.
   */
  addDeck(deck: Deck): Promise<Deck>;
  /** The deck as its catalog entry says now; null when it has none (any more). */
  readDeck(deckUrl: string): Promise<Deck | null>;
  /**
   * Edit the deck as its catalog entry says now (its name, direction,
   * pace, description, provenance, languages): `change` is given the deck as read (as readDeck reads it) and returns
   * the deck to write, or null for no change, which writes nothing. The
   * entry is rewritten in place from that same read, in this app's
   * format (triples this app does not know survive; cards and review
   * state are untouched), in ONE
   * save made only if the catalog document is still as read (If-Match);
   * when it changed meanwhile, it is read and changed again, a few
   * times. Throws deckGone, writing nothing, when the deck has no entry.
   * The deck as it then stands.
   */
  editDeck(deck: Deck, change: (stored: Deck) => Deck | null): Promise<Deck>;
  /**
   * Edit several decks as their catalog entries say now, as editDeck
   * edits one (`change` made to each), in ONE save of their catalog
   * document (one per document, should they be in several), read and
   * changed again on a 412. Throws deckGone, before its document is
   * written, when one of them has no entry. The decks as they then stand,
   * in the order given.
   */
  editDecks(decks: readonly Deck[], change: (stored: Deck) => Deck | null): Promise<Deck[]>;
  /**
   * For a library upgrade (domain/deckUpgrade.ts): write the deck's entry
   * as `next` in one write of the catalog document — what changed from
   * `current`, as withDeckChanges puts it — only if the entry still says
   * what `current` does (sameDeckState); else throws
   * deckChangedDuringUpgrade and writes nothing.
   */
  upgradeDeckEntry(current: Deck, next: Deck): Promise<Deck>;
  /**
   * Throw what upgradeDeckEntry would, writing nothing: for an upgrade to
   * check its entry before it writes the deck's other documents.
   */
  checkDeckEntryUpgrade(current: Deck, next: Deck): Promise<void>;
  /**
   * The deck's cards and reviews documents that do not say they are the
   * deck's (`<> dcterms:isPartOf` its entry) and that Solid Memo may not
   * mark as its own by itself, being outside the instance's own folder
   * (docs/data-model.md, "Where an instance's documents are"): read, never
   * written to or deleted, until the user claims them. Writes nothing.
   * One outside the instance's folder, on anyone's server, is read within
   * `budget` if given: once it is spent, one not read by then counts as
   * unreadable, so unclaimed. With `reads`, each is read as those reads
   * share it.
   */
  unclaimedDocuments(deck: Deck, budget?: ReadBudget, reads?: SharedReads): Promise<string[]>;
  /**
   * Whether the document, read now, is unclaimed for every one of the
   * decks that name it: unlike unclaimedDocuments, it says so of one in
   * the instance's own folder too, a release or another deck's document
   * there, which the check then leaves out. One that cannot be read is
   * not, so that the check keeps what it found; nor is one not read
   * before `budget`, if given, is spent. With `reads`, it is read as
   * those reads share it. Writes nothing.
   */
  isUnclaimedAsRead(
    decks: readonly Deck[],
    url: string,
    budget?: ReadBudget,
    reads?: SharedReads,
  ): Promise<boolean>;
  /**
   * Claim the deck's unclaimed documents, `documents` being those the
   * user was shown and confirmed: each of them is marked as the deck's,
   * in one write made only while it is as read; nothing else in it
   * changes. Refused with changedElsewhere, before anything is written, when
   * the deck's unclaimed documents, read again, are not those (in any
   * order and spelling, documentKeyOf).
   */
  claimDocuments(deck: Deck, documents: readonly string[]): Promise<void>;
  /**
   * Delete a document of the deck that its entry does not name yet, as
   * one a guest's deck being added wrote before its catalog entry
   * failed: the deck's cards and review states are removed from it, and
   * it is deleted when nothing else is left in it; one that is gone
   * counts as deleted. One that cannot be read as RDF or, outside the
   * instance's folder, cannot be read at all is kept. Throws unless it
   * can be read to be gone.
   */
  deleteDocument(deck: Deck, url: string): Promise<void>;
  /**
   * Note a course chapter completed: add `sm:completedChapter
   * <chapterUrl>` to the deck's catalog entry, as it is now, in ONE save
   * made only if the catalog document is as it was read (If-Match); when
   * it changed meanwhile, read it and add it again, a few times, then
   * throw changedElsewhere. A chapter already completed, in this release
   * or another (same fragment id), writes nothing.
   * Returns the deck as its entry says then; throws deckGone when it has
   * no entry.
   */
  completeChapter(deck: Deck, chapterUrl: string): Promise<Deck>;
  /**
   * Change the chapters a course's deck completed as `edit` says, of
   * those its entry names now, as completeChapter adds one: one save,
   * If-Match, a few attempts, then changedElsewhere. Unlike a learner's
   * completion, the entry passes the write check. An edit that changes
   * nothing writes nothing. Returns the deck as its entry says then;
   * throws deckGone when it has no entry.
   */
  setCompletedChapters(deck: Deck, edit: CompletedChaptersEdit): Promise<Deck>;
  /**
   * Set the deck's card language (`sm:deckCardLanguage`, a lower-case
   * tag already checked), or remove it for null, on its catalog entry as
   * it is now, as completeChapter edits it: one save, If-Match, a few
   * attempts, then changedElsewhere. Every other write of the entry keeps
   * it as stored, so a deck read before it changed cannot undo it. The
   * same language writes nothing. Returns the deck as its entry says
   * then; throws deckGone when it has no entry.
   */
  setCardLanguage(deck: Deck, language: string | null): Promise<Deck>;
  /**
   * Add a host to the hosts whose pictures the deck shows
   * (`sm:deckPictureHost`, a host already checked), or take it away, on
   * its catalog entry as it is now, as setCardLanguage edits it. What the
   * entry already says writes nothing. Returns the deck as its entry says
   * then; throws deckGone when it has no entry.
   */
  setPictureHost(deck: Deck, host: string, shown: boolean): Promise<Deck>;
  /**
   * Set the deck's pause (`sm:deckPausedAt` and `sm:deckResumesOn`, a
   * pause already checked), or remove it for null, on its catalog entry
   * as it is now, as setCardLanguage edits it. The same pause writes
   * nothing. Returns the deck as its entry says then; throws deckGone
   * when it has no entry.
   */
  setPause(deck: Deck, pause: DeckPause | null): Promise<Deck>;
}

/**
 * The states applyReviewChanges saves and removes of a deck, and where a
 * state carried starts from. `fromFile`: the progress of a deck file's
 * import, refused as CardChangeOptions' `fromFile` refuses its cards.
 */
export interface ReviewChanges {
  save: ReviewState[];
  remove: ReviewKey[];
  fsrs?: { save: FsrsState[]; remove: ReviewKey[] };
  every?: boolean;
  carried?: CarriedFrom;
  fromFile?: true;
}

/**
 * Driven port: review state, stored separately from card content: each
 * prompt's SM-2 state and, once FSRS-6 has scheduled it, its FSRS-6
 * state beside it, both in the deck's reviews document.
 */
export interface ReviewStateRepository {
  /**
   * The deck's review states, read as the instance's data is (in the
   * user's own pod as the user), or with `asNoOne`, as no one: for
   * states copied into a place they may not be the user's to share.
   * They may be frozen and shared with the other decks that name the
   * reviews document (domain/frozen.ts): never changed in place.
   */
  listReviewStates(deck: Deck, options?: { asNoOne?: boolean }): Promise<ReviewStates>;
  /**
   * The deck's review states unless its reviews document is still at
   * `version` (undefined: read them), read as listReviewStates reads
   * them, `asNoOne` too.
   */
  readReviewStatesSince(
    deck: Deck,
    version: string | undefined,
    options?: { asNoOne?: boolean },
  ): Promise<Since<ReviewStates>>;
  /** The prompt's states, each null when it has none (an SM-2 one: never reviewed that way). */
  getReviewState(deck: Deck, key: ReviewKey): Promise<PromptStates>;
  /**
   * Write the states of one prompt as `grade` makes them of the states
   * stored now (each null: none), the deck's others kept, in one edit of
   * the reviews document made only if it is as last read or written; the
   * document is read first only when its version is not known. Had it
   * changed since (another device's grade), it is read and graded again,
   * once. The SM-2 state is written, and the FSRS-6 one when the grade
   * gives one, in that one edit. The states written, and those they were
   * made of.
   */
  gradeReviewState(
    deck: Deck,
    key: ReviewKey,
    grade: (current: PromptStates) => GradedPrompt,
  ): Promise<{ state: GradedPrompt; current: PromptStates }>;
  /**
   * Create the deck's reviews document with these states, in ONE write
   * made only if nothing is there yet (If-None-Match: *; else
   * createdElsewhere, writing nothing): for a deck written whole, as when
   * a guest's study is added to an instance.
   */
  createReviewStates(deck: Deck, states: ReviewStates): Promise<void>;
  /**
   * Write several states and drop others in ONE save of the reviews
   * document, so a day reset cannot be left half-applied. A deck without
   * one gets it when there are states to save; else nothing is written.
   * A removal drops only the state read for its card and direction (a
   * second one, never read, stays, as a day reset wants), of its kind:
   * `remove` SM-2's, `fsrs.remove` FSRS-6's. With `every`, a key of
   * `remove` loses every state of it, SM-2's and this app's FSRS-6's,
   * read or not, as removing a card does (a card forgotten, removed or
   * moved away), but for one a newer version of the app wrote that is
   * not the one read, which stays. Another scheduler's state stays
   * either way. With
   * `carried`, a state written at a new subject starts from the state
   * of its kind the source's reviews document holds of the card it is a
   * copy of (CarriedFrom, by card id) in its direction. The save is
   * made only if the document is still as read (If-Match); when it
   * changed meanwhile, the same changes are made of it again, read
   * afresh (editReviewStates). For changes that hold whatever the
   * document holds now: an answer undone puts its state back.
   */
  applyReviewChanges(deck: Deck, changes: ReviewChanges): Promise<void>;
  /**
   * Write the changes `change` makes of the deck's review states as its
   * reviews document holds them now (as listReviewStates reads them), as
   * applyReviewChanges writes them, in ONE save made only if the
   * document is still as read (If-Match); when it changed meanwhile (a
   * grade on another device), it is read and changed again, a few
   * times. `change` gives null for no change, which writes nothing; what
   * it throws is thrown at once. The changes last written, or null. For
   * an edit made of the states, so the save never writes states made of
   * an older read over a later one.
   */
  editReviewStates(
    deck: Deck,
    change: (states: ReviewStates) => ReviewChanges | null,
  ): Promise<ReviewChanges | null>;
  /**
   * The write applyReviewChanges makes, with what it reads read, and
   * refused and checked as applyReviewChanges refuses and checks it (a
   * state it would remove or carry that a newer version of the app
   * wrote: writtenByNewerApp), but not sent: the function returned sends
   * it, If-Match the read. For a write made after another, so that what
   * would refuse it refuses it before the first, and what is sent is
   * what was checked. With `version`, the one the changes were made
   * from (readReviewStatesSince), a document no longer at it refuses
   * them at once (PreconditionFailedError), nothing sent, so the edit is
   * planned again. One that changes once the function returned is
   * called, after the write before it was sent, has the same changes
   * made of it read afresh (editReviewStates).
   */
  prepareReviewChanges(
    deck: Deck,
    changes: ReviewChanges,
    options?: { version?: string },
  ): Promise<() => Promise<void>>;
  /**
   * Write the FSRS-6 states `edit` makes of the deck's states as its
   * reviews document holds them now, in ONE edit made only if it is
   * still as read (If-Match); had it changed meanwhile (a grade on
   * another device), it is read and the states made again, three times
   * in all. Each is written over this app's FSRS-6 state of its prompt,
   * else at the subject named for it. Nothing is written when there is
   * no document or `edit` gives no state. For switching to FSRS-6, whose
   * states are made of the SM-2 states as they are when written.
   */
  writeFsrsStates(deck: Deck, edit: (states: ReviewStates) => FsrsState[]): Promise<void>;
  /**
   * For the format update: bring every review state of the deck in its
   * reviews document stored in an older format up to this app's, in ONE
   * save of the document made only if it is still as it was read
   * (If-Match): each state as read, brought up to date in memory, written
   * back at its own subject (unknown triples survive). Whether anything
   * was written (nothing when no state is outdated, or there is no
   * document).
   */
  upgradeReviewStates(deck: Deck): Promise<boolean>;
}

/** Driven port: per-instance study preferences. */
export interface PreferencesRepository {
  /**
   * The stored preferences with their format version; "misfit" when the
   * preferences document says something of its `#it` that does not fit
   * the preferences' shape; null when it says nothing of it, or the
   * instance has no preferences document yet.
   */
  getPreferences(instanceUrl: string): Promise<PreferencesRead>;
  /**
   * Write the preferences on the subject as stored, every triple their
   * shape does not own kept, in ONE save of the whole document made only
   * if it is still as it was read (If-Match). Preferences stored that do
   * not fit their shape are refused (preferencesMisfit), before anything
   * is sent, unless `replaceMisfit`: the user said to replace them.
   */
  savePreferences(
    instanceUrl: string,
    preferences: StudyPreferences,
    options?: { replaceMisfit?: boolean },
  ): Promise<void>;
  /**
   * Remember that the learner answered "Not now" to the invitation to
   * switch to FSRS-6 (sm:schedulerInvitationDismissed true) on the
   * preferences as stored, whether or not they fit their shape, every
   * other triple kept, in ONE save of the whole document made only if it
   * is still as it was read (If-Match). Preferences of a newer format are
   * refused (writtenByNewerApp). Nothing is written when there is no
   * preferences subject, or it says so already.
   */
  markSchedulerInvitationDismissed(instanceUrl: string): Promise<void>;
  /**
   * For the format update: bring the preferences up to this app's format,
   * in place (unknown triples survive), in ONE save of the document made
   * only if it is still as it was read (If-Match): the preferences as
   * read, brought up to date in memory. Whether anything was written
   * (nothing when they are up to date already, or there are none).
   */
  upgradePreferences(instanceUrl: string): Promise<boolean>;
  /**
   * Whether the preferences say logging in skips the Connected screen
   * (sm:connectedScreenSkipped true), read on the subject whatever its
   * format, a newer one too, and whether or not it fits its shape: so a
   * choice markConnectedScreen wrote on any preferences counts. False
   * when there are none, or a value that is not true is stated.
   */
  connectedScreenSkipped(instanceUrl: string): Promise<boolean>;
  /**
   * Set whether logging in skips the Connected screen
   * (sm:connectedScreenSkipped, outside the preferences' shape) on the
   * preferences as stored, every other triple kept, in ONE save of the
   * whole document made only if it is still as it was read (If-Match).
   * Preferences of a newer format are refused (writtenByNewerApp). When
   * the instance has no preferences subject, `created` is written with
   * it, in this app's format, made only if nothing is there yet; with
   * `created` null nothing is written. When the preferences changed, or
   * were made, elsewhere meanwhile (412), they are read and the choice
   * set on them again, a few times. "unchanged" when they already say
   * so, "none" when there was nothing to write it on.
   */
  markConnectedScreen(
    instanceUrl: string,
    skipped: boolean,
    created: StudyPreferences | null,
  ): Promise<"written" | "unchanged" | "none">;
}

/**
 * Driven port: the palettes the user designed, in the instance's
 * palettes document (docs/theme.md, Palettes of one's own).
 */
export interface PaletteRepository {
  /**
   * The instance's palettes, by their address, in the order written;
   * none when it has no palettes document. A palette that does not fit
   * its shape is left out, and a color its color set does not hold as
   * `#rrggbb` with it (paletteFromRecord). At most MAX_PALETTES, the
   * first it can read; the rest are left out.
   */
  listPalettes(instanceUrl: string): Promise<CustomPalette[]>;
  /**
   * Write the palette and its two color sets in place, so triples this
   * app does not know survive, in one save of the document made only if
   * it is still as it was read (If-Match).
   */
  savePalette(instanceUrl: string, palette: CustomPalette): Promise<void>;
}

/**
 * Driven port: one pod document checked against Solid Memo's shapes
 * (docs/validation.md). A document that does not exist is reported as
 * missing, not failed; any other failure to read it throws.
 */
/**
 * Driven port: each instance's digest (domain/studyDigest.ts), kept in
 * the pod so every device can rely on it.
 */
export interface DigestRepository {
  /** null when the instance has none, or one this app cannot read. */
  readDigest(instanceUrl: string): Promise<InstanceDigest | null>;
  /**
   * Change the stored digest (an empty one when there is none): read,
   * change, write only if unchanged meanwhile (else again). Changes asked
   * for together may be made to one copy of it (changedDigest).
   */
  updateDigest(instanceUrl: string, change: DigestChange): Promise<void>;
}

/**
 * Driven port: each instance's answer log (domain/answer.ts), one
 * document per study month, which the study statistics are computed from.
 */
export interface AnswerLog {
  /**
   * Add an answer to its month's document, without reading it. Adding
   * one that is there already changes nothing; an add the pod does not
   * answer in time fails, so a queued answer can be tried again.
   */
  append(instanceUrl: string, answer: Answer): Promise<void>;
  /**
   * Add answers to their months' documents, without reading them: one
   * insert-only PATCH per month, or more where one would be larger than
   * every pod reads, each answer whole in one. An answer that is there
   * already, as it was, changes nothing.
   */
  appendAll(instanceUrl: string, answers: readonly Answer[]): Promise<void>;
  /**
   * The study months up to `until` ("YYYY-MM") the log has a document
   * for, oldest first: of more than MAX_LOG_MONTHS, the newest. A later
   * month is left out first, so none can push out one of those.
   */
  months(instanceUrl: string, until: string): Promise<string[]>;
  /** A month's answers; an answer that does not fit its shape is left out. */
  readMonth(instanceUrl: string, month: string): Promise<Answer[]>;
  /**
   * A month's answers, as readMonth reads them, unless its document is
   * still at `version` (undefined: read them); a month with no document
   * is at ABSENT_VERSION, with no answers.
   */
  readMonthSince(
    instanceUrl: string,
    month: string,
    version: string | undefined,
  ): Promise<Since<Answer[]>>;
  /** Remove a deck's answers of a study day: what resetting the day undoes. */
  removeDay(instanceUrl: string, deckUrl: string, studyDay: string): Promise<void>;
  /** Remove one answer, by its id, from its study day's month: what undoing it undoes. */
  removeAnswer(instanceUrl: string, studyDay: string, id: string): Promise<void>;
}

/**
 * Driven port: an instance's documents as their statements, for the
 * Studio's graph of it (instanceGraph.ts). Read-only, and only the
 * document it is handed: it follows no link the document states.
 */
export interface InstanceGraphReader {
  /** The document's statements, a blank node as `_:<label>`; null when there is none (404). */
  readDocument(url: string): Promise<DraftTriple[] | null>;
}

/** Where a guest's study moves: every IRI under the container `from` becomes one under `to`. */
export interface ContainerMove {
  from: string;
  to: string;
  /**
   * IRIs outside `from` that become others: the guest's WebID becomes the
   * user's when a guest's study moves into their pod.
   */
  renames?: Readonly<Record<string, string>>;
}

/**
 * Driven port: copying an instance's container, for moving a guest's
 * study into the user's pod (docs/guest-mode.md).
 */
export interface InstanceCopier {
  /** Every resource below the container, depth first; containers end with a slash. */
  listResources(containerUrl: string): Promise<string[]>;
  /** Throws unless nothing is at the URL yet. */
  ensureAbsent(url: string): Promise<void>;
  createContainer(url: string): Promise<void>;
  /**
   * Copy one resource: a container is created, RDF rebased, anything
   * else byte for byte; the target must not exist yet (If-None-Match: *).
   * Resolves to the version that was copied (opaque: its ETag, else its
   * Last-Modified, else a hash of its content), taken from the very
   * response the copy was made from.
   */
  copyResource(from: string, to: string, move: ContainerMove): Promise<string>;
  /**
   * Whether the resource is still at that version: asked of the pod with
   * a conditional request (If-None-Match / If-Modified-Since), which
   * answers 304 when it is.
   */
  isUnchanged(url: string, version: string): Promise<boolean>;
  /**
   * The version a document is at now, read as the app reads it (as
   * Turtle, never from the browser's cache): its ETag, else its
   * modification time, else a hash of its bytes; null when there is none.
   */
  versionOf(url: string): Promise<string | null>;
  /**
   * Whether the document names an IRI at `origin`'s origin, as a parsed
   * URL gives it (in any case, with or without the default port), in any
   * of its subjects, predicates, objects and graphs. Its literals are not
   * looked at, their text or their datatypes, which the move leaves as
   * they are too (mapIris); nor is a file that is not Turtle, which a copy
   * takes byte for byte (copyResource).
   */
  namesIriAt(url: string, origin: string): Promise<boolean>;
  /**
   * Whether the document uses a term of Solid Memo's vocabulary that
   * this app does not know where only a term goes: as a property, as a
   * subject's class, or as the value of a property whose values are
   * concepts. An IRI of the vocabulary as the value of any other
   * property is a resource like any other. Such a term is data a
   * later version of the app added (docs/vocab.md "Versioning policy"),
   * which this one would leave behind where it copies what it reads
   * rather than the document. A file that is not RDF uses none.
   */
  namesLaterTerm(url: string): Promise<boolean>;
  /**
   * Delete a container and everything below it; one that is gone counts
   * as deleted. Only for a copy this app made whole, at a URL it found
   * free, before anything names it — a guest's study being moved, or
   * the copy a cut-off move left, while no instance of the user's is
   * there and it holds only that move's copies — : every resource in it
   * is a copy whose original stays where it was. An
   * instance in use is deleted by what it holds of Solid Memo's
   * (InstanceRepository.deleteInstance), never whole.
   */
  deleteRecursively(url: string): Promise<void>;
}

/**
 * A wait a server asked of the app (docs/architecture.md#a-request-on-its-way-to-a-pod):
 * no request goes to `host` before `until`. `asked` says the server
 * refused a request as too many, or as unavailable for a while; without
 * it, soon after such a refusal, a request to it failed with no status,
 * which a rate limit without CORS headers looks like, and a server that
 * is down too.
 */
export interface PodWait {
  readonly host: string;
  readonly until: Date;
  readonly asked: boolean;
}

/** Driven port: the waits servers asked of the app, as the requests to them keep them. */
export interface PodWaits {
  /** The waits not over yet, the one that ends first first. */
  current(): PodWait[];
  /** Calls `listener` each time a wait starts or grows longer. Returns a function that stops it. */
  listen(listener: () => void): () => void;
}

/**
 * Driven port: makes a container read-only for a while. Moving a guest's
 * study holds the guest's instance, so nothing else in this tab writes to
 * it until the move is over. A move another tab runs is held the same
 * way, with its copy.
 */
export interface WriteFence {
  /** Refuse every write under the container (a URL ending in "/") until the returned release is called. */
  hold(containerUrl: string): () => void;
}

/**
 * Driven port: the pod a guest studies in before logging in, kept on this
 * device (docs/guest-mode.md). Its WebID is GUEST_WEBID; every resource
 * is below GUEST_ORIGIN.
 */
export interface GuestPod {
  /** Whether a guest pod was started on this device (and not discarded). */
  exists(): Promise<boolean>;
  /** Start one, with a WebID profile naming its storage; one already started is kept. */
  start(): Promise<void>;
  /** Delete everything in it. */
  discard(): Promise<void>;
}
