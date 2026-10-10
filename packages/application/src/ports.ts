import type { Catalog } from "@solid-memo/domain/catalog";
import type { Locale } from "@solid-memo/domain/locale";
import type { LangText } from "@solid-memo/domain/langText";
import type { ThemeChoice } from "@solid-memo/domain/theme";
import type { Repair } from "@solid-memo/domain/repair";
import type { Card, CardContent, Deck } from "@solid-memo/domain/deck";
import type { DeckFileContent, DeckFileFormat, DeckFileOptions } from "@solid-memo/domain/deckFile";
import type { CompletedChaptersEdit, CourseOutline } from "@solid-memo/domain/course";
import type { StatedLanguages } from "@solid-memo/domain/deckLanguages";
import type { DeckTree, DeckTreeEdit } from "@solid-memo/domain/deckTree";
import type {
  DataClassRegistrations,
  Instance,
  InstanceDeletion,
  InstanceMeta,
  RegistrationOptions,
  RegistrationTarget,
} from "@solid-memo/domain/instance";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import type { StoredPreferences, StudyPreferences } from "@solid-memo/domain/preferences";
import type { ReviewKey, ReviewState } from "@solid-memo/domain/review";
import type { Answer } from "@solid-memo/domain/answer";
import type { EstablishedSession } from "@solid-memo/domain/session";
import type { Storage } from "@solid-memo/domain/storage";
import type { DocumentReport } from "@solid-memo/domain/validation";
import type { InstanceDigest } from "@solid-memo/domain/studyDigest";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import type { LibraryIndexView } from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";

/**
 * Driven port: authentication against a Solid identity provider.
 * Implemented by the Solid infrastructure layer.
 */
export interface SessionGateway {
  /**
   * Complete a pending login redirect or restore a stored session. The
   * origin tells a just-completed login from a silent restore.
   */
  restore(): Promise<EstablishedSession | null>;
  /**
   * Subscribe to session expiry (e.g. a 401 from the pod). Returns an
   * unsubscribe function.
   */
  onSessionExpired(listener: () => void): () => void;
  /**
   * The identity provider the WebID profile declares (solid:oidcIssuer).
   * Never derived from the WebID's own origin: the two may differ.
   */
  discoverOidcIssuer(webId: string): Promise<string>;
  /**
   * Start the login flow for the given WebID. On success the browser
   * navigates away to the identity provider, so this never resolves
   * normally; it only rejects on failure.
   */
  login(webId: string): Promise<void>;
  /**
   * Start the login flow at a known identity provider, for users who pick
   * a provider instead of typing their WebID. Like login(), it only ever
   * rejects; the WebID arrives with the session after the redirect.
   */
  loginWithIssuer(oidcIssuer: string): Promise<void>;
  logout(): Promise<void>;
}

/** Driven port: read access to WebID documents. */
export interface WebIdDocumentRepository {
  fetchWebIdDocument(webId: string): Promise<WebIdDocument>;
}

/** Driven port: Solid Memo instances registered in the user's type indexes. */
export interface InstanceRepository {
  /** All instances registered in the private and public type indexes. */
  listInstances(webId: string): Promise<Instance[]>;
  /** Which type indexes exist, for the UI's warn-and-choose flow. */
  getRegistrationOptions(webId: string): Promise<RegistrationOptions>;
  /**
   * Create the instance container + meta document and register it in the
   * chosen type index (creating the index if needed), with its
   * catalogue, decks and cards; its review states and answers in the
   * private index, whichever is chosen, and nowhere when there is none
   * (docs/data-model.md "Discovery chain"). Fails loudly and cleans up
   * the container when registration in the chosen index fails; the
   * review states' and answers' registrations of an instance registered
   * publicly are left out when the private index refuses them.
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
   * Delete the instance's data (deleteInstanceData), then drop its type
   * index registrations. Data goes first: a failure part-way leaves the
   * instance registered, so the user can retry rather than lose track of
   * a half-deleted pod container.
   */
  deleteInstance(args: { webId: string; instance: Instance }): Promise<InstanceDeletion>;
  /**
   * Delete what the instance's container holds of Solid Memo's (its
   * meta, preferences, catalogue and digest documents, every deck's cards
   * and reviews documents, the answer log's months), its sub-containers
   * and the container itself only once empty. Anything else, another
   * app's, is kept, and so is the container holding it. Its
   * registrations are left as they are.
   */
  deleteInstanceData(instanceUrl: string): Promise<InstanceDeletion>;
  /**
   * The registrations of the instance's data, one per class, that
   * belong in the type indexes there are, and whether each is there:
   * Solid Memo's own, the catalogue's, the decks' and the cards' in each
   * index that registers the instance, the review states' and answers'
   * in the private index only. An index that cannot be read is left
   * out, and said to be unreadable.
   */
  readDataClassRegistrations(args: { webId: string; instanceUrl: string }): Promise<DataClassRegistrations>;
  /**
   * Add each registration readDataClassRegistrations finds missing,
   * titled `title`, one save per index (If-Match, read again and
   * retried when the index changed meanwhile), none where an equal one
   * is there, and none in an index that cannot be read.
   */
  registerDataClasses(args: { webId: string; instanceUrl: string; title: string }): Promise<void>;
  /**
   * Give the instance's registrations a new title, in every type index
   * that registers it: its sm:Instance registration, which names it in
   * the instance list, and its catalogue's dcat:Catalog registration.
   * One write per index, made only if the index is as it was read
   * (If-Match), else read and written again, a few times. An index
   * already saying so is not written.
   */
  renameRegistrations(args: { webId: string; instanceUrl: string; title: string }): Promise<void>;
  /** What the instance's meta document says; null when there is none. */
  readMeta(instanceUrl: string): Promise<InstanceMeta | null>;
  /**
   * Rewrite the meta document's subject in place, in this app's format,
   * in ONE save made only if the document is still as it was read
   * (If-Match): the Studio's rename. Fails when the document is missing:
   * a meta document is created with its instance, never on its own.
   */
  saveMeta(instanceUrl: string, meta: InstanceMeta): Promise<void>;
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
 * A document's contents as of now, with the version (ETag) they are at,
 * or word that it is still at the version the caller knew (a document
 * there is none of is at ABSENT_VERSION, domain/studyDigest.ts).
 */
export type Since<T> = { unchanged: true } | { unchanged: false; value: T; version: string | null };

export interface DeckRepository {
  listDecks(instanceUrl: string): Promise<Deck[]>;
  /** The instance's catalogue (catalog.ttl#catalog); null when it has none yet. */
  readCatalog(instanceUrl: string): Promise<Catalog | null>;
  /** Write the instance's catalogue, listing every deck, creating the catalog document if need be. */
  saveCatalog(instanceUrl: string, catalog: Catalog): Promise<void>;
  /**
   * For the format update: bring every deck entry of the catalog document
   * stored in an older format up to this app's, in place (unknown triples
   * survive), each as read and brought up to date in memory, and write
   * `catalog` as the instance's catalogue when one is given and the
   * document has none, all in ONE save of the catalog document, made only
   * if it is still as it was read (If-Match; created only if nothing is
   * there, when there is no document). An entry that does not fit its
   * shape is left as it is. Whether anything was written.
   */
  upgradeDecks(instanceUrl: string, catalog: Catalog | null): Promise<boolean>;
  /** A new, empty deck by that title. */
  createDeck(instanceUrl: string, title: LangText): Promise<Deck>;
  /**
   * Add a deck's entry to its catalog, its course progress
   * (sm:completedChapter) with it: a deck made from a file, whose cards
   * and reviews documents are written already. Throws alreadyExists,
   * writing nothing, when the catalog has an entry of its URL.
   */
  registerDeck(deck: Deck): Promise<Deck>;
  /** Replaces the deck's title; cards and review state are untouched. */
  renameDeck(deck: Deck, title: LangText): Promise<Deck>;
  /**
   * Rewrite the deck's catalog entry — name, direction and format
   * version — in place, so triples this app does not know survive.
   * Cards and review state are untouched.
   */
  saveDeck(deck: Deck): Promise<Deck>;
  /**
   * Rewrite several decks' catalog entries as saveDeck does, in ONE save
   * of their catalog document (one per document, should they be in
   * several). Throws deckGone, before its document is written, when one
   * of them is gone. Returns the decks as written.
   */
  saveDecks(decks: readonly Deck[]): Promise<Deck[]>;
  /**
   * Removes the deck's catalog entry, cards document and reviews
   * document, and the deck from its group, in the same write.
   */
  removeDeck(deck: Deck): Promise<void>;
  /**
   * Removes several decks as removeDeck does: their cards and reviews
   * documents, then their catalog entries in ONE write of their catalog
   * document.
   */
  removeDecks(decks: readonly Deck[]): Promise<void>;
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
   * came from. The cards keep their library ids.
   */
  importDeck(instanceUrl: string, content: LibraryDeckContent): Promise<Deck>;
  listCards(deck: Deck): Promise<Card[]>;
  /** The deck's cards unless its cards document is still at `version` (undefined: read them). */
  readCardsSince(deck: Deck, version: string | undefined): Promise<Since<Card[]>>;
  addCard(deck: Deck, content: CardContent): Promise<Card>;
  /**
   * Replaces the card's content, writing it in this app's format; review
   * state is untouched.
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
  stateCardLanguages(deck: Deck, cardIds: readonly string[], languages: StatedLanguages): Promise<number>;
  /**
   * Write cards by fragment id, new or existing (an existing card keeps
   * its creation time and triples this app does not know; a new one is
   * made at `createdAt` when given, else now), retired or not, and
   * remove others, in one write of the cards document (created when
   * there is none, only if nothing is there yet). `whole` writes it as
   * one PUT of the whole document (with the same If-Match), for a bulk
   * edit of text, which a PATCH could have cut short (docs/testing.md).
   * With `version`, the version a read of the document gave
   * (readCardsSince), the changes are written only while the document is
   * still at it: one changed since (changedElsewhere) or created since is
   * not written, as changes made on another read of it would undo what
   * changed.
   */
  applyCardChanges(
    deck: Deck,
    changes: { save: (CardContent & { id: string; retired?: true; createdAt?: string })[]; remove: string[] },
    options?: { whole?: boolean; version?: string },
  ): Promise<void>;
  /**
   * Add a deck's catalog entry as the deck says it, its chapters
   * completed (sm:completedChapter) included: for a deck whose documents
   * are written already, at the URLs the caller chose for it in this
   * instance, as when a guest's study is added to an instance. One write
   * of the catalog document (If-Match the read; created when there is
   * none), read and made again on a 412, a few times at most. Refuses
   * (createdElsewhere, writing nothing) when the catalog has an entry at
   * the deck's URL. The deck as written.
   */
  addDeck(deck: Deck): Promise<Deck>;
  /** The deck as its catalog entry says now; null when it has none (any more). */
  readDeck(deckUrl: string): Promise<Deck | null>;
  /**
   * For a library upgrade (domain/deckUpgrade.ts): write the deck's entry
   * as `next` in one write of the catalog document — what changed from
   * `current`, as withDeckChanges puts it — only if the entry still says
   * what `current` does (sameDeckState); else throws
   * deckChangedDuringUpgrade and writes nothing.
   */
  upgradeDeckEntry(current: Deck, next: Deck): Promise<Deck>;
  /**
   * Delete a document no deck names, as one a guest's deck being added
   * wrote before its catalog entry failed; one that is gone counts as
   * deleted.
   */
  deleteDocument(url: string): Promise<void>;
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
}

/** Driven port: the app's read-only library of ready-made decks. */
export interface DeckLibrary {
  /** Every deck the library's index lists; empty when the library is. */
  listLibraryDecks(): Promise<LibraryDeck[]>;
  /** What the index says that places a release in the library: its address, its publisher, every release it lists. */
  readLibraryIndex(): Promise<LibraryIndexView>;
  /** The deck document with its cards. */
  fetchLibraryDeck(url: string): Promise<LibraryDeckContent>;
  /**
   * A course release's outline: its chapters and their steps (see
   * domain/course.ts), from the same read of the release as its cards.
   * Empty for a release that is no course.
   */
  fetchCourseOutline(releaseUrl: string): Promise<CourseOutline>;
}

/**
 * Driven port: a deck as a file, in Turtle or JSON-LD
 * (domain/deckFile.ts). Reads the pod to export; never writes it.
 */
export interface DeckArchive {
  /**
   * The deck's entry, with its agents and distribution, and every subject
   * of its cards document, as the pod has them, at their IRIs; with
   * `withProgress`, every subject of its reviews document and a course's
   * completed chapters too. Throws deckGone when the catalog has no entry
   * of it.
   */
  exportDeck(deck: Deck, options: DeckFileOptions): Promise<string>;
  /**
   * What a file holds: its one deck, read as the pod's are (an older
   * format brought up to date, in memory), the cards of its cards
   * document and the review states of its reviews document. Relative
   * IRIs are resolved against `baseUrl`. Throws deckFileUnreadable when
   * the text does not parse (or a JSON-LD context would be fetched from
   * elsewhere), notADeckFile when it holds no deck this app can read, or
   * more than one, and deckFileTooNew when a deck, card or review state
   * is in a newer format than this app reads.
   */
  readDeckFile(text: string, format: DeckFileFormat, baseUrl: string): Promise<DeckFileContent>;
}

/**
 * Driven port: the drafts of releases an instance's owner writes in it
 * (docs/studio.md, Drafts; domain/release/draftLayout.ts). A draft is a
 * container of documents, linked from the instance's catalogue
 * (`sm:releaseDraft`); its subjects are read into a ReleaseDraft, each
 * named as a fragment of its release document, and written back where
 * draftDocuments keeps them. What its shapes describe is written in this
 * app's format and checked against the draft shapes; every other
 * statement is kept as it is.
 */
export interface ReleaseDraftRepository {
  /** The drafts the instance's catalogue links, each as its release document says; one that cannot be read is listed as such. */
  list(instanceUrl: string): Promise<ReleaseDraftSummary[]>;
  /** Every document of the instance's drafts, for the instance's check. */
  documents(instanceUrl: string): Promise<string[]>;
  /**
   * Write a new draft where its URL says (draftLayout.ts): each document
   * made only if nothing is there yet (If-None-Match: *), the release
   * document first, then the link from the catalogue, If-Match, read and
   * made again on a 412, a few times. A release document there already is
   * createdElsewhere naming it, with nothing written. Any later failure
   * deletes the documents written, and their containers left empty,
   * before it is thrown: no draft is left that the catalogue does not
   * link. Throws noCatalogToUpdate when the instance has no catalogue.
   */
  create(instanceUrl: string, draft: ReleaseDraft): Promise<ReleaseDraftSummary>;
  /**
   * The draft as its documents say now, with the version they are at
   * together (opaque: it changes when any of them does, or one comes or
   * goes). Nothing it published before is known here: `published` is
   * empty. Throws draftGone when it has no release document.
   */
  read(draftUrl: string): Promise<{ draft: ReleaseDraft; version: string }>;
  /** The draft unless none of its documents changed since `version` (undefined: read it). */
  readSince(draftUrl: string, version: string | undefined): Promise<Since<ReleaseDraft>>;
  /**
   * Write what changed from `before` to `after`, `before` as `read` read
   * it last, at `version`: one write per document that changed (a PUT of
   * it whole), made only if it is still as it was read (If-Match; else
   * changedElsewhere), a new chapter's only if none is there yet. A
   * chapter's document nothing is left in is deleted, as it was read.
   * changedElsewhere too when the draft was read since at another
   * version, or not by this repository.
   */
  applyChanges(before: ReleaseDraft, after: ReleaseDraft, version: string): Promise<void>;
  /**
   * The draft as one release document at `targetUrl`, in Turtle
   * (`@base` its URL, the usual prefixes): every subject moved there,
   * released `issued` (also its time of change), written at library
   * deck format 6, with the series it starts described in it. With
   * `version`, the draft as it was at that version (read), or
   * changedElsewhere when its documents changed since.
   */
  assemble(draftUrl: string, targetUrl: string, issued: string, version?: string): Promise<string>;
  /**
   * A release document anywhere, as it states itself, at its own URL;
   * releaseUnreadable when there is none to read there, or its version
   * is none of 1, 2, ….
   */
  readRelease(url: string): Promise<ReleaseDraft>;
  /**
   * A release from a file's text, at the address its root names (the
   * file's own when it names none); notAReleaseFile when it holds no
   * one release, or its version is none of 1, 2, …; deckFileUnreadable
   * when it does not parse.
   */
  parseRelease(text: string, format: DeckFileFormat): Promise<ReleaseDraft>;
  /**
   * Delete a draft: its documents (those of a draft's, nothing else in
   * its container), its container and the ones above it when they are
   * then empty, then its link from the catalogue.
   */
  delete(draft: ReleaseDraftSummary): Promise<void>;
}

/**
 * Driven port: the releases a creator publishes from an instance
 * (docs/studio.md, Publishing a release), each one Turtle document,
 * frozen once written. The only port that changes who may read
 * something: it makes a release it wrote readable by everyone, that
 * document alone.
 */
export interface ReleasePublisher {
  /**
   * Write the release's text at `targetUrl`, only if nothing is there
   * (If-None-Match: *; else releaseTaken, with nothing written: a
   * release is never written over; but a release there that states what
   * this one does, its time of issue aside, is this one, written by a
   * publishing cut short, and is finished as if just written), then
   * make it readable by everyone,
   * then link it from the instance's catalogue (`sm:publishedRelease`,
   * If-Match, read and made again on a 412). `public` is false when the
   * pod would not make it readable by everyone: it is written and linked
   * all the same, readable by its owner alone, until makePublic.
   */
  publish(instanceUrl: string, turtle: string, targetUrl: string): Promise<{ public: boolean }>;
  /** Make the release readable by everyone, again; publicAccessRefused when the pod will not. */
  makePublic(url: string): Promise<void>;
  /** Whether someone with no login can read the release at `url`. */
  isPublic(url: string): Promise<boolean>;
  /** The releases the instance's catalogue says it published, in the order it names them. */
  listPublished(instanceUrl: string): Promise<string[]>;
}

/**
 * Driven port: files on the user's device, which the user picks. Text
 * only.
 */
export interface FileExchange {
  /** Hand the text to the browser to save, as a download named `name`. */
  save(name: string, mediaType: string, text: string): void;
  /** The file the user picks, of those `accept` names (as an input's accept attribute); null when they pick none. */
  open(accept: string): Promise<{ name: string; text: string } | null>;
}

/** Driven port: SM-2 review state, stored separately from card content. */
export interface ReviewStateRepository {
  listReviewStates(deck: Deck): Promise<ReviewState[]>;
  /** The deck's review states unless its reviews document is still at `version` (undefined: read them). */
  readReviewStatesSince(deck: Deck, version: string | undefined): Promise<Since<ReviewState[]>>;
  /** null when the card has never been reviewed in that direction. */
  getReviewState(deck: Deck, key: ReviewKey): Promise<ReviewState | null>;
  saveReviewState(deck: Deck, state: ReviewState): Promise<void>;
  /**
   * Create the deck's reviews document with these states, in ONE write
   * made only if nothing is there yet (If-None-Match: *; else
   * createdElsewhere, writing nothing): for a deck written whole, as when
   * a guest's study is added to an instance.
   */
  createReviewStates(deck: Deck, states: readonly ReviewState[]): Promise<void>;
  /**
   * Write several states and drop others in ONE save of the reviews
   * document, so a day reset cannot be left half-applied. A deck without
   * one gets it when there are states to save; else nothing is written.
   * A removal drops only the state read for its card and direction (a
   * second one, never read, stays, as a day reset wants); with `every`,
   * every SM-2 state of it, read or not, as removing a card does (a card
   * forgotten, removed or moved away). Another scheduler's state stays
   * either way.
   */
  applyReviewChanges(
    deck: Deck,
    changes: { save: ReviewState[]; remove: ReviewKey[]; every?: boolean },
  ): Promise<void>;
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
   * The stored preferences with their format version; null when the
   * instance has no preferences document yet.
   */
  getPreferences(instanceUrl: string): Promise<StoredPreferences | null>;
  savePreferences(
    instanceUrl: string,
    preferences: StudyPreferences,
  ): Promise<void>;
  /**
   * For the format update: bring the preferences up to this app's format,
   * in place (unknown triples survive), in ONE save of the document made
   * only if it is still as it was read (If-Match): the preferences as
   * read, brought up to date in memory. Whether anything was written
   * (nothing when they are up to date already, or there are none).
   */
  upgradePreferences(instanceUrl: string): Promise<boolean>;
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
  /** Change the stored digest: read, change, write only if unchanged meanwhile (else again). */
  updateDigest(instanceUrl: string, change: (stored: InstanceDigest | null) => InstanceDigest): Promise<void>;
}

/**
 * Driven port: each instance's answer log (domain/answer.ts), one
 * document per study month, which the study statistics are computed from.
 */
export interface AnswerLog {
  /** Add an answer to its month's document, without reading it. */
  append(instanceUrl: string, answer: Answer): Promise<void>;
  /**
   * Add answers to their months' documents, without reading them: one
   * insert-only PATCH per month, or more where one would be larger than
   * every pod reads, each answer whole in one. An answer that is there
   * already, as it was, changes nothing.
   */
  appendAll(instanceUrl: string, answers: readonly Answer[]): Promise<void>;
  /** The study months the log has a document for, "YYYY-MM", oldest first. */
  months(instanceUrl: string): Promise<string[]>;
  /** A month's answers; an answer that does not fit its shape is left out. */
  readMonth(instanceUrl: string, month: string): Promise<Answer[]>;
  /**
   * A month's answers, as readMonth reads them, unless its document is
   * still at `version` (undefined: read them); a month with no document
   * is at ABSENT_VERSION, with no answers.
   */
  readMonthSince(instanceUrl: string, month: string, version: string | undefined): Promise<Since<Answer[]>>;
  /** Remove a deck's answers of a study day: what resetting the day undoes. */
  removeDay(instanceUrl: string, deckUrl: string, studyDay: string): Promise<void>;
}

/**
 * Where a document checked is: an instance's own ("pod"), or a release's
 * draft ("draft"), whose deck, chapters and steps the draft shapes check
 * (docs/validation.md).
 */
export type DocumentContext = "pod" | "draft";

export interface ShapeValidator {
  validateDocument(url: string, context?: DocumentContext): Promise<DocumentReport>;
  /** The document's report unless it is still at `version` (undefined: check it). */
  validateDocumentSince(url: string, version: string | undefined, context?: DocumentContext): Promise<Since<DocumentReport>>;
  /**
   * What the shapes say of a draft as the release it will be, published
   * at `asUrl` (docs/studio.md, The release check): the release as it is
   * assembled, every subject moved there, each subject of a Solid Memo
   * class checked against its library shape, and the whole against
   * DCAT-AP and SKOS with the reference data. With `indexUrl`, a
   * library's index is beside it, the release's series in it (described
   * there for a release it does not list yet). Each problem names its
   * subject in the draft.
   */
  validateRelease(draft: ReleaseDraft, asUrl: string, indexUrl?: string): Promise<ReleaseProblem[]>;
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
  /** Whether the resource's content holds `text` anywhere (a URL, as an IRI or in a literal). */
  mentions(url: string, text: string): Promise<boolean>;
  /**
   * Delete a container and everything below it; one that is gone counts
   * as deleted. Only for a copy this app made whole, at a URL it found
   * free, before anything names it — a guest's study being moved — :
   * every resource in it is a copy whose original stays where it was. An
   * instance in use is deleted by what it holds of Solid Memo's
   * (InstanceRepository.deleteInstanceData), never whole.
   */
  deleteRecursively(url: string): Promise<void>;
}

/**
 * Driven port: the language the user chose for the app, kept where the
 * app runs (the browser), since it is needed before any pod is reached.
 * Best effort: it may forget, and the app then speaks the browser's
 * language.
 */
export interface LanguagePreference {
  /** The chosen language; null when none was chosen (or it was forgotten). */
  chosen(): Locale | null;
  choose(locale: Locale): void;
}

/**
 * Driven port: the theme the user chose for the app, kept where the app
 * runs (the browser), since it is needed before any pod is reached: on
 * the sign-in screens, and for the first paint. An instance's preferences,
 * once it has them, keep the choice too and win. Best effort: it may
 * forget, and the app then looks as the browser prefers.
 */
export interface ThemePreference {
  /** The chosen theme; "system" when none was chosen (or it was forgotten). */
  chosen(): ThemeChoice;
  choose(choice: ThemeChoice): void;
}

/**
 * Driven port: a note of an update in progress, kept where the app runs
 * (the browser), so an update cut off half-way (a closed tab) can be
 * found: a guest's study being moved into its new folder, or each
 * guest's deck already added to an instance (domain/guest.ts
 * GuestMergeNote). Best effort: it may forget.
 */
export interface UpdateJournal {
  begin(sourceUrl: string, stagingUrl: string): void;
  end(sourceUrl: string): void;
  /** What an unfinished update of the source was writing; null when none. */
  staging(sourceUrl: string): string | null;
  /**
   * Mark this page as running a move of the guest's instance until the
   * returned function is called, or the page goes away. An entry outlives
   * its run when the move fails half-way: only the mark tells other pages
   * the move still runs.
   */
  run(sourceUrl: string): () => void;
  /**
   * Call `changed` for each move another page of the app, in this
   * browser, runs: at once for those running already, then as each begins
   * (`staging` its copy); with `staging` null once it stops running or its
   * entry ends. Never for this page's own. It watches for as long as the
   * page lives.
   */
  watch(changed: (sourceUrl: string, staging: string | null) => void): void;
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

/** Driven port: repairs of what an instance check found (docs/validation.md). */
export interface RepairRepository {
  /** Apply the repairs, one read and one write per document. */
  applyRepairs(repairs: readonly Repair[]): Promise<void>;
}

/** Driven port: discovery of storage roots in the user's pod(s). */
export interface StorageGateway {
  /**
   * All storages advertised for the WebID (profile pim:storage triples,
   * falling back to the server's Link-header discovery). May be empty.
   */
  discoverStorages(webId: string): Promise<Storage[]>;
  /** Validate a manually entered storage URL; rejects if unreachable. */
  probeStorage(url: string): Promise<Storage>;
}

/**
 * A resource of the pod kept in the browser for guests (docs/guest-mode.md):
 * a container, an RDF document (its triples as N-Triples lines, IRIs
 * absolute) or any other file. Every write gives it a new `etag`.
 */
export type StoredResource =
  | { kind: "container"; etag: string }
  | { kind: "rdf"; etag: string; triples: string[] }
  | { kind: "file"; etag: string; contentType: string; bytes: Uint8Array };

/**
 * Driven port: where the guest's pod keeps its resources, by URL, on this
 * device. Implemented over IndexedDB in the browser, in memory in tests.
 */
export interface ResourceStore {
  get(url: string): Promise<StoredResource | undefined>;
  set(url: string, resource: StoredResource): Promise<void>;
  delete(url: string): Promise<void>;
  /** The URL of every resource kept, in no particular order. */
  urls(): Promise<string[]>;
  /** Forget every resource. */
  clear(): Promise<void>;
  /**
   * Run `work` while no other exclusive work runs on the same store, in
   * this tab or another, so a read-check-write is never interleaved.
   */
  exclusive<T>(work: () => Promise<T>): Promise<T>;
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
