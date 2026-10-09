import { getContainedResourceUrlAll } from "@inrupt/solid-client";
import { backupsContainerOf, manifestUrlOf, stagingFolderOf, type Backup } from "@solid-memo/domain/backup";
import type { InstanceDeletion } from "@solid-memo/domain/instance";
import { deleteContainerIfEmpty, deleteContainerRecursively } from "./containers";
import { deleteIfPresent, getSolidDatasetOrNull } from "./datasets";
import { toBackup } from "./mappers/backupMapper";

/**
 * The backups in an instance's backups/ folder (domain/backup.ts): each a
 * folder whose manifest names what Solid Memo put in it. Shared by the
 * backups adapter and the deletion of an instance (instanceData.ts).
 */

/** The backup in the folder; null when its manifest is gone or holds no backup. */
export async function readBackupIn(folder: string, fetch: typeof globalThis.fetch): Promise<Backup | null> {
  const manifest = await getSolidDatasetOrNull(manifestUrlOf(folder), fetch);
  return manifest === null ? null : toBackup(manifest, folder);
}

/** Every backup of the instance, newest first; a folder without a readable manifest is none. */
export async function listBackupsOf(instanceUrl: string, fetch: typeof globalThis.fetch): Promise<Backup[]> {
  const container = backupsContainerOf(instanceUrl);
  const listing = await getSolidDatasetOrNull(container, fetch);
  if (listing === null) return [];
  const folders = getContainedResourceUrlAll(listing).filter(
    (url) => url.startsWith(container) && url !== container && url.endsWith("/"),
  );
  const backups = await Promise.all(folders.map((folder) => readBackupIn(folder, fetch).catch(() => null)));
  return backups
    .filter((backup): backup is Backup => backup !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Delete what a backup holds of Solid Memo's: its update's working copy
 * (staging/, whole: the update made it, and nothing names it), each file
 * of bytes its manifest names below its folder (a file's access control
 * goes with it), then the manifest, then each folder below it and the
 * folder itself, each only once empty; and the instance's backups/
 * folder, once that is empty too. A folder that still holds what another
 * app put there is kept, and named.
 */
export async function removeBackup(backup: Backup, fetch: typeof globalThis.fetch): Promise<InstanceDeletion> {
  await deleteContainerRecursively(stagingFolderOf(backup.url), fetch);
  const copies = backup.entries
    .map((entry) => entry.copy)
    .filter((copy): copy is string => copy !== undefined && copy.startsWith(backup.url) && copy !== backup.url);
  for (const copy of copies) await deleteIfPresent(copy, fetch);
  await deleteIfPresent(manifestUrlOf(backup.url), fetch);
  // The folders the copies were in, deepest first.
  const folders = new Set<string>();
  for (const copy of copies) {
    for (let end = copy.lastIndexOf("/"); end >= backup.url.length; end = copy.lastIndexOf("/", end - 1)) {
      folders.add(copy.slice(0, end + 1));
    }
  }
  for (const folder of [...folders].sort((a, b) => b.length - a.length)) await deleteContainerIfEmpty(folder, fetch);
  const gone = await deleteContainerIfEmpty(backup.url, fetch);
  // The backups/ folder too, when this was its last backup: tidying, which may fail without harm.
  if (gone) await deleteContainerIfEmpty(backup.url.slice(0, backup.url.lastIndexOf("/", backup.url.length - 2) + 1), fetch).catch(() => false);
  return { keptFolder: gone ? null : backup.url };
}
