// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * The driven ports of releases: the library's decks, a deck as a file, the drafts an instance's owner writes and the releases published from them. The solid adapters implement them.
 */

import type { Deck } from "@solid-memo/domain/deck";
import type { DeckFileContent, DeckFileFormat, DeckFileOptions } from "@solid-memo/domain/deckFile";
import type { CourseOutline } from "@solid-memo/domain/course";
import type { KeptDocuments } from "@solid-memo/domain/instance";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import type { DocumentReport } from "@solid-memo/domain/validation";
import type { DraftTriple, ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import type { LibraryIndexView } from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";

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
  /**
   * A release read on its own, as a learner adds it from a link
   * (docs/deck-library.md, From a link): what its one document says of
   * it, its series and its earlier versions, with no index. Read afresh
   * each time, as an address may hold anything, now or later. Throws
   * releaseUnreadable when nothing can be read there, podNoAnswer when
   * its server does not answer in time, releaseTooLarge
   * when it is larger than a release may be, notADeck when it holds no
   * deck, libraryDeckTooNew when its deck is in a newer format.
   *
   * With `accept`, that same read is checked against the library's
   * shapes too (DocumentContext "library"), once it reads as a release:
   * `accept` is handed what they say of it, and throws to refuse it. A
   * read it accepts is the release's from then on, as fetchLibraryDeck
   * and fetchCourseOutline read it, in place of any kept before. A read
   * refused is not kept. The adapter may let an accepted read go, once
   * it holds many: the release is then read and held to the same `accept`
   * when asked for. With `pin`, it does not let that read go, nor another
   * read of the release take its place, until the next read pinned takes
   * its place: what is checked and shown is what is imported.
   *
   * Reads of releases from a link are within one budget a page session,
   * whatever reads them, and a few run at once: past it, a read fails
   * with linkedReadsSpent until the page is loaded again, as do those
   * under way then. Reading a document again spends no more of it, unless
   * it grew or such reads have taken a generous allowance of their own.
   * This read knows no index: it counts whatever `url` is.
   */
  readRelease(
    url: string,
    accept?: (report: DocumentReport) => void,
    options?: { pin?: boolean },
  ): Promise<LibraryDeck>;
  /**
   * The releases the catalog of the instance that published `url`
   * links (`sm:publishedRelease`), read as anyone reads it: looked for
   * in the folders above the release, nearest first, up to the instance
   * its address names (releaseInstanceOf) and never above a storage's
   * root, the first that links it: those at an address a release may
   * have (isPublishedReleaseUrl), as listPublished lists, in that
   * catalog's folder. Null when none can be read, an instance's catalog
   * being private unless its owner shares it, or the address names no
   * instance.
   */
  publishedBeside(url: string): Promise<string[] | null>;
  /**
   * Reads of releases from a link for one upgrade plan (planLibraryUpgrade
   * of a copy from a link), or for one lookup of such a copy's series
   * (its release and those its creator's catalog links): read and kept
   * as the library's are, but kept only by what is returned, never by the
   * library, and all of them read under one release's limits together,
   * not each under its own: the releases are their creator's to make, as
   * many as a release or a catalog may list and each as large as a
   * release may be. Past those limits, the read that goes past them fails
   * with linkedReleasesTooLarge, of them all, not releaseTooLarge, as it
   * may be within a release's limits on its own. A lookup reads its
   * creator's catalog (publishedBeside) under them too.
   */
  linkedReads(): LinkedReleaseReads;
}

/** The reads of releases from a link one upgrade plan, or one lookup of a series, makes (DeckLibrary.linkedReads), as the library's are made. */
export type LinkedReleaseReads = Pick<
  DeckLibrary,
  "readRelease" | "fetchLibraryDeck" | "fetchCourseOutline" | "publishedBeside"
>;

/**
 * Driven port: a deck as a file, in Turtle or JSON-LD
 * (domain/deckFile.ts). Reads the pod to export; never writes it.
 */
export interface DeckArchive {
  /**
   * The deck's entry, with its agents and distribution, and its cards
   * with the distractors they name, as the pod has them, at their IRIs;
   * with `withProgress`, the review states of those cards and a course's
   * completed chapters too. Nothing else of its cards and reviews
   * documents. Each of the two documents `asNoOne` names is read as no
   * one (as listCards reads one), any other as the user: the caller
   * says which, so none is read as the user by default. Throws deckGone
   * when the catalog has no entry of it.
   */
  exportDeck(
    deck: Deck,
    options: DeckFileOptions,
    reads: { asNoOne: { cards: boolean; reviews: boolean } },
  ): Promise<string>;
  /**
   * What a file holds: its one deck, read as the pod's are (an older
   * format brought up to date, in memory), the cards of its cards
   * document and the review states of its reviews document. Relative
   * IRIs are resolved against `baseUrl`. Throws deckFileUnreadable when
   * the text does not parse (or a JSON-LD context would be fetched from
   * elsewhere), notADeckFile when it holds no deck this app can read, or
   * more than one, deckFileTooNew when a deck, card or review state
   * is in a newer format than this app reads, deckFileTooLarge when
   * the file is larger than a deck file may be, and
   * deckFileLinksGuestPod when an address it would keep, but its own
   * places, links to the guest's pod (domain/guest.ts linksGuestPod).
   */
  readDeckFile(text: string, format: DeckFileFormat, baseUrl: string): Promise<DeckFileContent>;
}

/**
 * Driven port: the drafts of releases an instance's owner writes in it
 * (docs/studio.md, Drafts; domain/release/draftLayout.ts). A draft is a
 * container of documents, linked from the instance's catalog
 * (`sm:releaseDraft`); its subjects are read into a ReleaseDraft, each
 * named as a fragment of its release document, and written back where
 * draftDocuments keeps them. What its shapes describe is written in this
 * app's format and checked against the draft shapes; every other
 * statement is kept as it is.
 */
export interface ReleaseDraftRepository {
  /** The drafts the instance's catalog links, each as its release document says; one that cannot be read is listed as such. */
  list(instanceUrl: string): Promise<ReleaseDraftSummary[]>;
  /**
   * Every document of the instance's drafts, for the instance's check: of
   * a draft past MAX_DRAFT_DOCUMENTS, its release document alone, so the
   * check of the rest still stands.
   */
  documents(instanceUrl: string): Promise<string[]>;
  /**
   * Write a new draft where its URL says (draftLayout.ts): each document
   * made only if nothing is there yet (If-None-Match: *), the release
   * document first, then the link from the catalog, If-Match, read and
   * made again on a 412, a few times. A release document there already is
   * createdElsewhere naming it, with nothing written. Any later failure
   * deletes the documents written, and their containers left empty,
   * before it is thrown: no draft is left that the catalog does not
   * link. Throws noCatalogToUpdate when the instance has no catalog;
   * draftIdUnsupported, with nothing written, for a draft with an id no
   * draft can have (DRAFT_ID); and draftTooManyDocuments, with nothing
   * written, for a draft of more documents than a read of one takes
   * (MAX_DRAFT_DOCUMENTS), or than a read of the instance's drafts takes
   * with theirs (MAX_DRAFT_DOCUMENTS_IN_ALL); unwritableTerm, with
   * nothing written, for one naming an IRI that looks like a prefixed
   * name its documents may be written with, which an edit, writing a
   * document whole, would save as that term.
   */
  create(instanceUrl: string, draft: ReleaseDraft): Promise<ReleaseDraftSummary>;
  /**
   * How many documents `create` would write the draft in, with nothing
   * written; refused as `create` refuses it for what it holds:
   * termTooLong or unwritableTerm for a term no write takes, or an IRI
   * that looks like a prefixed name,
   * draftIdUnsupported, and draftTooManyDocuments past
   * MAX_DRAFT_DOCUMENTS.
   */
  documentCountOf(draft: ReleaseDraft): number;
  /**
   * draftTooManyDocuments, with nothing written, when `count` documents
   * more would take the instance's drafts past what a read of them
   * takes together (MAX_DRAFT_DOCUMENTS_IN_ALL), as `create` refuses a
   * draft that would.
   */
  refuseTooManyInAll(instanceUrl: string, count: number): Promise<void>;
  /**
   * The draft as its documents say now, with the version of this read
   * of them (opaque: another when any of them is read anew rather than
   * found unchanged, or one comes or goes; never only their ETags, which
   * a server may leave out or keep for other content). Nothing it
   * published before is known here: `published` is empty. Throws
   * draftGone when it has no release document, and
   * draftIdUnsupported when it names a subject by an id no draft can
   * have (DRAFT_ID): a chapter's document is named after its id; and
   * draftHiddenValue when its documents state a predicate a subject's
   * shape owns otherwise than its record writes it: a value the record
   * does not keep, one it reads otherwise (an ill-formed integer or
   * date-time), or two that it reads as one; writtenByNewerApp when a
   * subject is stamped with a newer format than this app reads it in.
   */
  read(draftUrl: string): Promise<{ draft: ReleaseDraft; version: string }>;
  /**
   * Write what changed from `before` to `after`, `before` as `read` read
   * it last, at `version`: one write per document that changed (a PUT of
   * it whole), made only if it is still as it was read (If-Match; else
   * changedElsewhere), a new chapter's only if none is there yet. A
   * chapter's document nothing is left in is deleted, as it was read.
   * changedElsewhere too when the draft was read since at another
   * version, or not by this repository; draftIdUnsupported, with nothing
   * written, when `after` has an id no draft can have (DRAFT_ID);
   * draftTooManyDocuments, with nothing written, when `after` would have
   * more documents than a read of a draft takes (MAX_DRAFT_DOCUMENTS), or
   * would add documents past what a read of the instance's drafts takes
   * together (MAX_DRAFT_DOCUMENTS_IN_ALL).
   */
  applyChanges(before: ReleaseDraft, after: ReleaseDraft, version: string): Promise<void>;
  /**
   * The draft as one release document at `targetUrl`, in Turtle
   * (`@base` its URL, the usual prefixes): every subject moved there,
   * released `issued` (also its time of change), written at library
   * deck format 6, with the series it starts described in it. With
   * `version`, the draft as the read at that version had it, not read
   * again, so what was checked of that read is what is published; or
   * changedElsewhere when that read is not the draft's last (read again
   * or edited since). A draft that
   * states anything of `targetUrl` or a subject of it (`<targetUrl>#id`)
   * itself, which would say more of the release than its parts do, is
   * releaseForeignStatement. One whose documents name a subject of the
   * draft otherwise than the draft writes it, which no read of the draft
   * has, is draftAliasedSubject. One that read refuses as
   * draftHiddenValue or writtenByNewerApp is refused the same, so each
   * value of a predicate a shape owns is published as the value its
   * record holds, which the release check saw (apart from what
   * publishing writes of the root itself: its format, times and
   * sm:releasedAs).
   */
  assemble(draftUrl: string, targetUrl: string, issued: string, version?: string): Promise<string>;
  /**
   * A release document anywhere, as it states itself, at its own URL;
   * releaseUnreadable when there is none to read there, or its version
   * is none of 1, 2, …; podNoAnswer when its server does not answer in
   * time; releaseTooLarge when it is larger than a release
   * may be. Read as releases are (a release in the user's own pod as
   * the user), or with `asNoOne`, as no one, as readLinked reads: for a
   * release copied into a place it may not be the user's to share.
   */
  readRelease(url: string, options?: { asNoOne?: boolean }): Promise<ReleaseDraft>;
  /**
   * What the documents a release names its series and publisher in say
   * (a library's index), read as the release is: each document the
   * release links to by `dcat:inSeries`, `dcat:isVersionOf` or
   * `dcterms:publisher` outside its own and does not describe, once; none when
   * it describes them all. Read as no one; one that cannot be read
   * gives nothing.
   */
  readLinked(release: ReleaseDraft): Promise<DraftTriple[]>;
  /**
   * A release from a file's text, at the address its root names (the
   * file's own when it names none); notAReleaseFile when it holds no
   * one release, or its version is none of 1, 2, …; deckFileUnreadable
   * when it does not parse, deckFileTooLarge when it is larger than a
   * release may be.
   */
  parseRelease(text: string, format: DeckFileFormat): Promise<ReleaseDraft>;
  /**
   * Delete a draft: the draft's subjects from its documents (those of a
   * draft's, nothing else in its container), each document deleted when
   * nothing else is left in it, its container and the ones above it when
   * they are then empty, then its link from the catalog. Returns the
   * documents kept for another app's data in them. A draft past the limit
   * on what is read of one (MAX_DRAFT_DOCUMENTS) is deleted all the same.
   * Nothing is deleted of a draft the list doesn't give, one the
   * instance's catalog doesn't link at a draft's place in the instance
   * (draftPlaceOf): that is refused (draftGone).
   */
  delete(draft: ReleaseDraftSummary): Promise<KeptDocuments>;
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
   * then link it from the instance's catalog (`sm:publishedRelease`,
   * If-Match, read and made again on a 412). `public` is false when the
   * pod would not make it readable by everyone: it is written and linked
   * all the same, readable by its owner alone, until makePublic.
   */
  publish(instanceUrl: string, turtle: string, targetUrl: string): Promise<{ public: boolean }>;
  /**
   * Make the release readable by everyone, again; publicAccessRefused
   * when the pod will not, and when it is not a release the instance's
   * catalog lists (listPublished) whose document is a release.
   */
  makePublic(instanceUrl: string, url: string): Promise<void>;
  /** Whether someone with no login can read the release at `url`. */
  isPublic(url: string): Promise<boolean>;
  /**
   * The releases the instance's catalog says it published, in the order
   * it names them: those at an address a release may have
   * (isPublishedReleaseUrl).
   */
  listPublished(instanceUrl: string): Promise<string[]>;
}
