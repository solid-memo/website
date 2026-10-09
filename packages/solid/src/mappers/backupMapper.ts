import { getThing, getThingAll, setThing, type SolidDataset } from "@inrupt/solid-client";
import { manifestUrlOf, type Backup, type BackupEntry } from "@solid-memo/domain/backup";
import { BACKUP_ENTRY_V1, BACKUP_V1 } from "@solid-memo/vocab/descriptors.generated";
import { readVersioned, recordThing } from "../records";

/**
 * A backup's manifest (domain/backup.ts): the backup at `#it`, and one
 * entry per document at `#entry-<n>`, numbered from 1 in the order the
 * update changes them.
 */

const ENTRY = /#entry-(\d+)$/;

/** The subject of the backup's n-th entry, from 1. */
export function entryUrlOf(folder: string, n: number): string {
  return `${manifestUrlOf(folder)}#entry-${n}`;
}

/** The backup a manifest holds; null when its `#it` is no backup (or does not fit its shape). */
export function toBackup(dataset: SolidDataset, folder: string): Backup | null {
  const it = getThing(dataset, `${manifestUrlOf(folder)}#it`);
  const read = it === null ? null : readVersioned(it, "backup");
  if (read === null) return null;
  const entries = getThingAll(dataset)
    .map((thing) => ({ n: Number(ENTRY.exec(thing.url)?.[1] ?? NaN), read: readVersioned(thing, "backupEntry") }))
    .filter((entry): entry is { n: number; read: NonNullable<typeof entry.read> } => entry.read !== null && !Number.isNaN(entry.n))
    .sort((a, b) => a.n - b.n)
    .map(({ read: { record } }): BackupEntry => ({ ...record.data }));
  const { backupOf, created, release } = read.record.data;
  return { url: folder, of: backupOf, createdAt: created, ...(release === undefined ? {} : { release }), entries };
}

/** A new manifest's dataset, and the subjects it holds. */
export function manifestOf(dataset: SolidDataset, backup: Backup): { dataset: SolidDataset; subjects: string[] } {
  const it = `${manifestUrlOf(backup.url)}#it`;
  let written = setThing(dataset, recordThing(
      it,
      BACKUP_V1,
      { backupOf: backup.of, created: backup.createdAt, ...(backup.release === undefined ? {} : { release: backup.release }) },
      null,
    ));
  const subjects = [it];
  for (const [index, entry] of backup.entries.entries()) {
    const url = entryUrlOf(backup.url, index + 1);
    written = setThing(written, recordThing(url, BACKUP_ENTRY_V1, entry, null));
    subjects.push(url);
  }
  return { dataset: written, subjects };
}

/**
 * The manifest with the version the update left a document at on the
 * document's entry; null when no entry is of that document.
 */
export function withVersionUpdated(
  dataset: SolidDataset,
  document: string,
  version: string,
): { dataset: SolidDataset; subject: string } | null {
  for (const thing of getThingAll(dataset)) {
    const read = readVersioned(thing, "backupEntry");
    if (read === null || read.record.data.document !== document) continue;
    const updated = recordThing(thing.url, BACKUP_ENTRY_V1, { ...read.record.data, versionUpdated: version }, thing);
    return { dataset: setThing(dataset, updated), subject: thing.url };
  }
  return null;
}
