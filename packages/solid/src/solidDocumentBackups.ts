import { createSolidDataset, fromRdfJsDataset, toRdfJsDataset } from "@inrupt/solid-client";
import type { DocumentBackups } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";
import {
  backupCopyUrlOf,
  manifestUrlOf,
  stagingFolderOf,
  stagingMapOf,
  type Backup,
  type BackupEntry,
} from "@solid-memo/domain/backup";
import { listBackupsOf, readBackupIn, removeBackup } from "./backupData";
import { deleteContainerRecursively } from "./containers";
import { forgetRead, getSolidDatasetOrNull, PreconditionFailedError, saveDataset } from "./datasets";
import { currentVersion, ifMatchOf, sameBytes, served, type Served } from "./documentVersion";
import { parseTurtle, turtleDataset } from "./linearDataset";
import { manifestOf, withVersionUpdated } from "./mappers/backupMapper";
import { copyEffectiveAccessControl } from "./solidInstanceCopier";
import { sameStatements } from "./statements";
import { noWriteCheck, type WriteCheck } from "./writeCheck";

type Fetch = typeof globalThis.fetch;

/** How a backup keeps a document's bytes: as no RDF, which no server reads or rewrites. */
const OCTET_STREAM = "application/octet-stream";

export interface SolidDocumentBackupsDeps {
  fetch: Fetch;
  /** Checks the manifest before it is written; see writeCheck.ts. A document's bytes are kept as they were, and are not checked. */
  checkWrite?: WriteCheck;
  /** The IRI mapper the working copy, and a copy's access control, are moved with; injected for tests. */
  loadEngine?: () => Promise<{ mapIris: typeof import("@solid-memo/shacl/engine").mapIris }>;
}

/** Throw unless the pod accepted the write: changedElsewhere when the document was not at the version given. */
function ensureWritten(response: Response, url: string): void {
  if (response.status === 412) throw new PreconditionFailedError(url, "unchanged");
  if (!response.ok) throw new AppError("addFailed", { url, status: response.status });
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/**
 * The DocumentBackups over a Solid pod (docs/migrations.md "The backup").
 * A document's bytes are kept exactly as the pod served them when Turtle
 * was asked for, in a file of the backup's folder the pod is told is no
 * RDF (application/octet-stream), so none parses or rewrites it: its
 * prefixes, comments, order, blank node labels and relative IRIs are kept.
 * Putting it back is one PUT of those bytes, with the Content-Type they
 * were served with, at the document's own address, where its relative
 * IRIs mean what they meant; then the pod is asked for it, and must give
 * those very bytes back. The update's working copy is the documents as
 * Turtle with every IRI moved into the folder (domain/backup.ts
 * stagingMapOf), each with the access its document has.
 */
export function createSolidDocumentBackups({
  fetch,
  checkWrite = noWriteCheck,
  loadEngine = () => import("@solid-memo/shacl/engine"),
}: SolidDocumentBackupsDeps): DocumentBackups {
  /** A backup's file as it is stored; null when it is gone. */
  const stored = (url: string) => served(url, fetch, null);

  /** The bytes a backup holds of a document; throws backupFileGone when they are gone. */
  async function bytesOf({ document, copy }: BackupEntry & { copy: string }): Promise<Uint8Array<ArrayBuffer>> {
    const file = await stored(copy);
    if (file === null) throw new AppError("backupFileGone", { url: copy, document });
    return file.bytes;
  }

  return {
    async create({ folder, of, createdAt, instanceUrl, documents, release }, onBackedUp = () => undefined) {
      const read: { document: string; now: Served | null; copy: string }[] = [];
      for (const [index, document] of documents.entries()) {
        read.push({ document, now: await served(document, fetch), copy: backupCopyUrlOf(folder, instanceUrl, document, index + 1) });
        // What was read of it before may be older than these bytes, at the same version (an ETag that outlives
        // an edit made in the same second): forgotten, so the next read, an update's write's, fetches it whole.
        forgetRead(document, fetch);
      }
      const backup: Backup = {
        url: folder,
        of,
        createdAt,
        ...(release === undefined ? {} : { release }),
        entries: read.map(({ document, now, copy }) =>
          now === null ? { document } : { document, copy, contentType: now.contentType, versionBackedUp: now.version },
        ),
      };
      // The manifest first: whatever is written after it, it names.
      const manifest = manifestOf(createSolidDataset(), backup);
      await checkWrite(manifest.dataset, manifest.subjects);
      await saveDataset(manifestUrlOf(folder), manifest.dataset, fetch);
      for (const { document, now, copy } of read) {
        if (now !== null) {
          forgetRead(copy, fetch);
          const response = await fetch(copy, {
            method: "PUT",
            headers: { "Content-Type": OCTET_STREAM, "If-None-Match": "*" },
            body: now.bytes,
          });
          if (response.status === 412) throw new PreconditionFailedError(copy, "absent");
          if (!response.ok) throw new AppError("addFailed", { url: copy, status: response.status });
          // Given the access its document has, its own or inherited, as its own: no more open than the document.
          await copyEffectiveAccessControl({ fetch, loadEngine }, document, copy);
          const kept = await stored(copy);
          if (kept === null || !sameBytes(kept.bytes, now.bytes)) throw new AppError("backupNotExact", { url: document, copy });
        }
        onBackedUp();
      }
      return backup;
    },

    async stage(backup, onStaged = () => undefined) {
      const map = stagingMapOf(backup);
      const { mapIris } = await loadEngine();
      for (const entry of backup.entries) {
        if (entry.copy !== undefined) {
          // The bytes read where the document is, so its relative IRIs mean what they mean there.
          const dataset = await turtleDataset(text(await bytesOf({ ...entry, copy: entry.copy })), entry.document);
          const staged = map.toStaged(entry.document);
          // Created where nothing is (If-None-Match: *): a new dataset is a creation.
          await saveDataset(staged, fromRdfJsDataset(mapIris(toRdfJsDataset(dataset), map.toStaged)), fetch);
          await copyEffectiveAccessControl({ fetch, loadEngine }, entry.document, staged);
        }
        onStaged();
      }
    },

    async stateOf(entry) {
      const now = await served(entry.document, fetch);
      // As create(): a write made after this check is made from a read of the document whole.
      forgetRead(entry.document, fetch);
      if (entry.copy === undefined) return { version: now?.version ?? null, asBackedUp: now === null };
      if (now === null) return { version: null, asBackedUp: false };
      const kept = await stored(entry.copy);
      // Without its bytes (cut off before they were written), the version it was read at says.
      return {
        version: now.version,
        asBackedUp: kept === null ? now.version === entry.versionBackedUp : sameBytes(kept.bytes, now.bytes),
      };
    },

    async sameAsStaged(backup, entry) {
      const map = stagingMapOf(backup);
      const stagedUrl = map.toStaged(entry.document);
      const copy = await served(stagedUrl, fetch);
      if (copy === null) return null;
      const now = await served(entry.document, fetch);
      if (now === null) return false;
      const [mine, staged] = await Promise.all([
        parseTurtle(text(now.bytes), entry.document),
        parseTurtle(text(copy.bytes), stagedUrl),
      ]);
      return sameStatements(mine, staged, map.toOriginal);
    },

    versionOf: (url) => currentVersion(url, fetch),

    async noteUpdated(backup, document, version) {
      const url = manifestUrlOf(backup.url);
      const dataset = await getSolidDatasetOrNull(url, fetch);
      const updated = dataset === null ? null : withVersionUpdated(dataset, document, version);
      if (updated === null) throw new AppError("backupGone", { url: backup.url, document });
      await checkWrite(updated.dataset, [updated.subject]);
      await saveDataset(url, updated.dataset, fetch);
    },

    list: (instanceUrl) => listBackupsOf(instanceUrl, fetch),

    read: (folder) => readBackupIn(folder, fetch),

    async putBack(entry, version) {
      // The bytes read first: where the version is checked rather than sent, the check comes just before the write.
      const bytes = entry.copy === undefined ? null : await bytesOf({ ...entry, copy: entry.copy });
      const etag = ifMatchOf(version);
      if (etag === undefined && (await currentVersion(entry.document, fetch)) !== version) {
        throw new PreconditionFailedError(entry.document, "unchanged");
      }
      const conditions: Record<string, string> = etag === undefined ? {} : { "If-Match": etag };
      forgetRead(entry.document, fetch);
      const response =
        bytes === null
          ? await fetch(entry.document, { method: "DELETE", headers: conditions })
          : await fetch(entry.document, {
              method: "PUT",
              headers: { ...conditions, "Content-Type": entry.contentType ?? "text/turtle" },
              body: bytes,
            });
      ensureWritten(response, entry.document);
      if (bytes === null) return;
      // Put back is the very bytes the pod serves again, or it is not put back.
      const now = await served(entry.document, fetch);
      if (now === null || !sameBytes(now.bytes, bytes)) throw new AppError("restoredNotExact", { url: entry.document, copy: entry.copy! });
    },

    unstage: (backup) => deleteContainerRecursively(stagingFolderOf(backup.url), fetch),

    remove: (backup) => removeBackup(backup, fetch),
  };
}
