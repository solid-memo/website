import { ensureTrailingSlash } from "./instanceLayout";

/**
 * Backups of documents an update changes in place (docs/migrations.md
 * "The backup"): the format update, and a library upgrade, first copy
 * each document they are about to change into a folder of the
 * instance's `backups/`, with a manifest saying which. Each document
 * then keeps its address; a restore puts back the earlier version of
 * each one still as the update left it.
 */

/** One document of a backup. */
export interface BackupEntry {
  /** The document, at its own address. */
  document: string;
  /** Where its earlier version is kept; absent when there was no document (the update was to create it). */
  copy?: string;
  /** The version the copy was made from; absent when there was no document. */
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
   * it was made, of which the copies hold the cards. It is restored only
   * while the deck's entry still names that release.
   */
  release?: string;
  entries: BackupEntry[];
}

/** What restoring a backup did, document by document. */
export interface BackupRestore {
  /** Documents put back as they were before the update (or deleted, for one it created). */
  restored: string[];
  /** Documents changed since the update wrote them, kept as they are now. */
  kept: string[];
  /** Whether the backup was deleted after: it is, once nothing of it was kept. */
  removed: boolean;
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

/** The manifest of the backup in the folder. */
export function manifestUrlOf(folder: string): string {
  return `${folder}manifest.ttl`;
}

/**
 * Where a backup keeps a document's earlier version: at the same path
 * below the folder as the document has below the instance; a document
 * outside the instance (a deck's catalogue may name one) at
 * `elsewhere/<index>.ttl`.
 */
export function backupCopyUrlOf(folder: string, instanceUrl: string, document: string, index: number): string {
  const instance = ensureTrailingSlash(instanceUrl);
  return document.startsWith(instance) ? `${folder}${document.slice(instance.length)}` : `${folder}elsewhere/${index}.ttl`;
}

/**
 * What a restore does with a document, given the version it is at now
 * (null: there is none): put back the earlier version when it is still
 * as the update left it; nothing, when the update never wrote it and it
 * is as it was; else keep it, changed since by someone else (or by an
 * update cut off before it noted what it wrote, which cannot be told
 * from someone else).
 */
export function restoreActionOf(entry: BackupEntry, current: string | null): "restore" | "asItWas" | "keep" {
  if (entry.versionUpdated !== undefined) return current === entry.versionUpdated ? "restore" : "keep";
  return current === (entry.versionBackedUp ?? null) ? "asItWas" : "keep";
}

/** The backup with the version the update left a document at noted down. */
export function withVersionUpdated(backup: Backup, document: string, version: string): Backup {
  return {
    ...backup,
    entries: backup.entries.map((entry) => (entry.document === document ? { ...entry, versionUpdated: version } : entry)),
  };
}
