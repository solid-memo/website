import type { CardContent, Deck } from "./deck";
import { ensureTrailingSlash } from "./instanceLayout";

/**
 * Backups of the documents an update changes in place (docs/migrations.md
 * "The backup"): before the format update or a library upgrade writes a
 * document, it keeps the document's bytes, exactly as the pod served them,
 * in a folder of the instance's `backups/`, with a manifest naming the
 * document each file is of and the Content-Type and version it was served
 * with. Putting those bytes back makes the document exactly as it was,
 * prefixes, comments, order and all. While the update runs, the same
 * folder holds its working copy (`staging/`): the updated documents,
 * written and checked there before any document of the user's is.
 */

/** One document of a backup. */
export interface BackupEntry {
  /** The document, at its own address. */
  document: string;
  /** Where its bytes are kept, `<path>.orig` below the folder; absent when there was no document (the update was to create it). */
  copy?: string;
  /** The Content-Type the bytes were served with, which they are put back with; absent when there was no document. */
  contentType?: string;
  /** The version the bytes were read at; absent when there was no document. */
  versionBackedUp?: string;
  /** The version the update left the document at, once it wrote it. */
  versionUpdated?: string;
}

export interface Backup {
  /** The backup's folder: `<instance>backups/<stamp>/`. */
  url: string;
  /** What it was made for: the instance's container (the format update) or a deck's catalog entry (a library upgrade). */
  of: string;
  /** ISO dateTime it was made. */
  createdAt: string;
  /**
   * For a library upgrade's backup: the release the deck came from when
   * it was made, whose cards the backup holds. It is restored only while
   * the deck's entry still names that release.
   */
  release?: string;
  entries: BackupEntry[];
}

/** A document a restore left as it is now, changed since the update wrote it: `copy` holds its bytes from before the update. */
export interface KeptDocument {
  document: string;
  copy?: string;
}

/** What putting a backup back did, document by document. */
export interface BackupRestore {
  /** Documents put back exactly as they were before the update (or deleted again, for one it created). */
  restored: string[];
  /** Documents changed since the update wrote them (or that cannot be told from such), kept as they are now. */
  kept: KeptDocument[];
  /** Whether the backup, and the update's working copy, were deleted after: they are, once nothing of it was kept. */
  removed: boolean;
}

/**
 * What an update that failed after writing did to put back what it had
 * written. `failed` is why putting back stopped, when it did: then the
 * backup, the working copy and the browser's note are kept, to try again.
 */
export interface RunUndo extends BackupRestore {
  failed?: unknown;
}

/** The folder of an instance's backups. */
export function backupsContainerOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}backups/`;
}

/**
 * A new backup's folder: named by when it is made (UTC, to the second)
 * and the first characters of a fresh id, `backups/20261009T100000Z-0f3a1b2c/`.
 */
export function backupFolderOf(instanceUrl: string, at: Date, id: string): string {
  const stamp = at.toISOString().replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "");
  return `${backupsContainerOf(instanceUrl)}${stamp}-${id.replace(/-/g, "").slice(0, 8)}/`;
}

/** The instance a backup's folder (`<instance>backups/<stamp>/`) is in, spelled as the folder is. */
export function instanceOfBackup(folder: string): string {
  const parent = (url: string) => url.slice(0, url.lastIndexOf("/", url.length - 2) + 1);
  return parent(parent(folder));
}

/** The manifest of the backup in the folder. */
export function manifestUrlOf(folder: string): string {
  return `${folder}manifest.ttl`;
}

/**
 * Where a backup keeps a document's bytes: at the document's path below
 * the folder, `.orig` added (no server takes the file for RDF, so none
 * rewrites it); a document outside the instance (a deck's catalog entry
 * may name one), or at a path the folder uses itself (`staging/…`, the
 * working copy's, which is deleted whole, and `elsewhere/…`), at
 * `elsewhere/<n>.orig`, `n` its entry's number from 1.
 */
export function backupCopyUrlOf(folder: string, instanceUrl: string, document: string, n: number): string {
  const instance = ensureTrailingSlash(instanceUrl);
  const path = document.startsWith(instance) ? document.slice(instance.length) : null;
  return path === null || /^(?:staging|elsewhere)\//.test(path) ? `${folder}elsewhere/${n}.orig` : `${folder}${path}.orig`;
}

/**
 * Whether a URL says plainly where it is: no "." or ".." segment, in any
 * spelling ("%2e"), which a request resolves, stepping out of the folder
 * the URL seems to be in; no backslash or control character, which a
 * request reads as "/" or drops (a tab between two dots, say); no query
 * or fragment.
 */
export function isPlainUrl(url: string): boolean {
  return !/[\x00-\x1f\\?#]/.test(url) && !url.split("/").some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment));
}

/**
 * Whether a backup is as an update writes one: its folder and every
 * document plain URLs (isPlainUrl), and each document's bytes kept where
 * an update keeps them (backupCopyUrlOf, its entry numbered as the
 * manifest lists it). Anyone who may write in the instance could leave a
 * manifest naming any file: one that is not so is no backup of the app's,
 * so nothing it names is read, written or deleted.
 */
export function isAsWritten(backup: Backup): boolean {
  const instance = instanceOfBackup(backup.url);
  return (
    isPlainUrl(backup.url) &&
    backup.entries.every(
      ({ document, copy }, index) =>
        isPlainUrl(document) && (copy === undefined || copy === backupCopyUrlOf(backup.url, instance, document, index + 1)),
    )
  );
}

/** The folder an update writes its working copy in while it runs: `staging/` in its backup's folder. */
export function stagingFolderOf(folder: string): string {
  return `${folder}staging/`;
}

/**
 * The working copy's address of a document: its path below the instance,
 * below the staging folder; a document outside the instance at
 * `elsewhere/<n>.ttl`, `n` its entry's number from 1.
 */
export function stagedUrlOf(folder: string, instanceUrl: string, document: string, n: number): string {
  const instance = ensureTrailingSlash(instanceUrl);
  const staging = stagingFolderOf(folder);
  return document.startsWith(instance) ? `${staging}${document.slice(instance.length)}` : `${staging}elsewhere/${n}.ttl`;
}

/** How the IRIs of an update's working copy relate to the instance's. */
export interface StagingMap {
  /** Where the working copy has an IRI: one of the instance, or of a document of the backup outside it, moved into the staging folder; any other as it is. */
  toStaged(iri: string): string;
  /** The IRI the working copy's stands for: `toStaged` undone. */
  toOriginal(iri: string): string;
}

/**
 * The working copy's IRIs: every IRI below the instance at the same path
 * below the staging folder, so the copy's documents stand to each other as
 * the instance's do (a deck's entry to its cards, a review state to its
 * card, in any cards document the deck has had); each document of the
 * backup outside the instance, and its fragments, at its own place in the
 * folder. Every other IRI (a WebID, a vocabulary term) stays.
 */
export function stagingMapOf(backup: Backup): StagingMap {
  const instance = instanceOfBackup(backup.url);
  const staging = stagingFolderOf(backup.url);
  const outside = backup.entries.flatMap(({ document }, index) =>
    document.startsWith(instance) ? [] : [{ document, staged: stagedUrlOf(backup.url, instance, document, index + 1) }],
  );
  const moved = (iri: string, from: string, to: string) =>
    iri === from || iri.startsWith(`${from}#`) ? `${to}${iri.slice(from.length)}` : null;
  return {
    toStaged(iri) {
      for (const { document, staged } of outside) {
        const result = moved(iri, document, staged);
        if (result !== null) return result;
      }
      return iri.startsWith(instance) ? `${staging}${iri.slice(instance.length)}` : iri;
    },
    toOriginal(iri) {
      for (const { document, staged } of outside) {
        const result = moved(iri, staged, document);
        if (result !== null) return result;
      }
      return iri.startsWith(staging) ? `${instance}${iri.slice(staging.length)}` : iri;
    },
  };
}

/** The deck as it is found through a map of IRIs: its entry and documents where the map puts them. */
export function deckAt(deck: Deck, map: (iri: string) => string): Deck {
  return { ...deck, url: map(deck.url), cardsDocumentUrl: map(deck.cardsDocumentUrl), reviewsDocumentUrl: map(deck.reviewsDocumentUrl) };
}

/** Cards with the IRIs of their pictures mapped: a working copy's read as the deck's own. */
export function withPicturesAt<T extends CardContent>(cards: readonly T[], map: (iri: string) => string): T[] {
  return cards.map((card) => ({
    ...card,
    ...(card.frontImageUrl === undefined ? {} : { frontImageUrl: map(card.frontImageUrl) }),
    ...(card.backImageUrl === undefined ? {} : { backImageUrl: map(card.backImageUrl) }),
  }));
}

/** What is known of a document of a backup as it is now. */
export interface DocumentState {
  /** The version it is at now; null when there is no document. */
  version: string | null;
  /** Whether it is exactly as backed up: the very bytes the backup holds (or, where there was no document, still none). */
  asBackedUp: boolean;
}

/**
 * What a restore does with a document of a backup, given how it is now:
 * nothing, when it is as backed up; put its bytes back when it is still at
 * the version the update noted it left it at (`updated`: the manifest's,
 * else the browser's note); keep it when it is gone since. Else "compare":
 * it is put back when it says just what the update's working copy of it
 * says (a write whose answer was lost, so its version was never noted),
 * and kept, changed since by someone else, when it does not or the copy is
 * not there to say.
 */
export function restoreActionOf(
  entry: BackupEntry,
  state: DocumentState,
  updated: string | undefined = entry.versionUpdated,
): "asItWas" | "restore" | "compare" | "keep" {
  if (state.asBackedUp) return "asItWas";
  if (state.version === null) return "keep";
  return state.version === updated ? "restore" : "compare";
}

/** The backup with the version the update left a document at noted down. */
export function withVersionUpdated(backup: Backup, document: string, version: string): Backup {
  return {
    ...backup,
    entries: backup.entries.map((entry) => (entry.document === document ? { ...entry, versionUpdated: version } : entry)),
  };
}

/**
 * How long an update may run before the browser's note of it counts as
 * left behind by a closed tab. An update takes seconds; until then, the
 * note may be another tab's update under way (it is kept per browser, not
 * per tab).
 */
export const ABANDONED_RUN_MS = 10 * 60 * 1000;

/**
 * What this browser notes of an update while it runs (UpdateJournal), so
 * that one cut off can be found again: its backup's folder, when it began,
 * how far it got, and the version it left each document it wrote at, as
 * the manifest notes too.
 */
export interface RunNote {
  folder: string;
  /** ISO dateTime the update began. */
  startedAt: string;
  /**
   * "running": under way, or cut off; "done": every document written and
   * checked, only tidying left; "stopped": it ended without putting back
   * everything it wrote.
   */
  state: "running" | "done" | "stopped";
  /** The version the update left each document it wrote at, by document. */
  updated: Record<string, string>;
}

export function encodeRunNote(note: RunNote): string {
  return JSON.stringify(note);
}

/** The note again; null when it is not one (forgotten, or a note of another kind: an earlier version's). */
export function decodeRunNote(text: string | null): RunNote | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { folder, startedAt, state, updated } = value as Record<string, unknown>;
  if (typeof folder !== "string" || typeof startedAt !== "string") return null;
  if (state !== "running" && state !== "done" && state !== "stopped") return null;
  if (typeof updated !== "object" || updated === null) return null;
  const versions = Object.entries(updated).filter((pair): pair is [string, string] => typeof pair[1] === "string");
  return { folder, startedAt, state, updated: Object.fromEntries(versions) };
}

/** Whether the update the note is of is over: it ended, or began long enough ago to have been cut off. */
export function isRunOver(note: RunNote, now: Date): boolean {
  if (note.state !== "running") return true;
  const started = Date.parse(note.startedAt);
  return Number.isNaN(started) || now.getTime() - started >= ABANDONED_RUN_MS;
}
