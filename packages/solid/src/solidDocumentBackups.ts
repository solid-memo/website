import {
  createSolidDataset,
  fromRdfJsDataset,
  getSolidDataset,
  solidDatasetAsTurtle,
  toRdfJsDataset,
  type SolidDataset,
} from "@inrupt/solid-client";
import type { DocumentBackups } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";
import { backupCopyUrlOf, manifestUrlOf, type Backup } from "@solid-memo/domain/backup";
import { listBackupsOf, readBackupIn, removeBackup } from "./backupData";
import { getSolidDatasetOrNull, PreconditionFailedError, saveDataset } from "./datasets";
import { currentVersion, ifMatchOf, versionOfResponse } from "./documentVersion";
import { getSolidDatasetLinear } from "./linearDataset";
import { manifestOf, withVersionUpdated } from "./mappers/backupMapper";
import { copyEffectiveAccessControl } from "./solidInstanceCopier";
import { noWriteCheck, type WriteCheck } from "./writeCheck";

type Fetch = typeof globalThis.fetch;

export interface SolidDocumentBackupsDeps {
  fetch: Fetch;
  /** Checks the manifest before it is written; see writeCheck.ts. A copy is the document as it was, and is not checked. */
  checkWrite?: WriteCheck;
  /** The IRI mapper a copy's access control is moved with; injected for tests. */
  loadEngine?: () => Promise<{ mapIris: typeof import("@solid-memo/shacl/engine").mapIris }>;
}

/**
 * A document as it is now, read fresh (never answered from an earlier
 * read), with the version of the very response it was read from; null
 * when there is none.
 */
async function readWithVersion(url: string, fetch: Fetch): Promise<{ dataset: SolidDataset; version: string } | null> {
  let version: string | undefined;
  let missing = false;
  const recording: Fetch = async (input, init) => {
    const response = await fetch(input, init);
    missing = response.status === 404;
    if (response.ok) version = await versionOfResponse(response);
    return response;
  };
  try {
    return { dataset: await getSolidDatasetLinear(url, { fetch: recording }), version: version! };
  } catch (error) {
    if (missing) return null;
    throw error;
  }
}

/** Throw unless the pod accepted the write: changedElsewhere when the document was not at the version given. */
function ensureWritten(response: Response, url: string): void {
  if (response.status === 412) throw new PreconditionFailedError(url, "unchanged");
  if (!response.ok) throw new AppError("addFailed", { url, status: response.status });
}

/**
 * The DocumentBackups over a Solid pod (docs/migrations.md "The backup").
 * A copy holds the document's triples, every IRI as it was (Turtle with
 * absolute IRIs, so it reads the same at its new address), and is put
 * back the same way.
 */
export function createSolidDocumentBackups({
  fetch,
  checkWrite = noWriteCheck,
  loadEngine = () => import("@solid-memo/shacl/engine"),
}: SolidDocumentBackupsDeps): DocumentBackups {
  return {
    async create({ folder, of, createdAt, instanceUrl, documents, release }, onCopied = () => undefined) {
      const read = [];
      for (const [index, document] of documents.entries()) {
        const now = await readWithVersion(document, fetch);
        read.push({ document, now, copy: backupCopyUrlOf(folder, instanceUrl, document, index) });
      }
      const backup: Backup = {
        url: folder,
        of,
        createdAt,
        ...(release === undefined ? {} : { release }),
        entries: read.map(({ document, now, copy }) =>
          now === null ? { document } : { document, copy, versionBackedUp: now.version },
        ),
      };
      // The manifest first: whatever is copied after it, it names.
      const manifest = manifestOf(createSolidDataset(), backup);
      await checkWrite(manifest.dataset, manifest.subjects);
      await saveDataset(manifestUrlOf(folder), manifest.dataset, fetch);
      for (const { document, now, copy } of read) {
        if (now !== null) {
          await saveDataset(copy, fromRdfJsDataset(toRdfJsDataset(now.dataset)), fetch);
          // The copy is given the access the document has, its own or inherited, as its own: no more open.
          await copyEffectiveAccessControl({ fetch, loadEngine }, document, copy);
        }
        onCopied();
      }
      return backup;
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
      // The copy read first: where the version is checked rather than sent, the check comes just before the write.
      const body = entry.copy === undefined ? null : await solidDatasetAsTurtle(await getSolidDataset(entry.copy, { fetch }));
      const etag = ifMatchOf(version);
      if (etag === undefined && (await currentVersion(entry.document, fetch)) !== version) {
        throw new PreconditionFailedError(entry.document, "unchanged");
      }
      const conditions: Record<string, string> = etag === undefined ? {} : { "If-Match": etag };
      const response =
        body === null
          ? await fetch(entry.document, { method: "DELETE", headers: conditions })
          : await fetch(entry.document, { method: "PUT", headers: { ...conditions, "Content-Type": "text/turtle" }, body });
      ensureWritten(response, entry.document);
    },

    remove: (backup) => removeBackup(backup, fetch),
  };
}
