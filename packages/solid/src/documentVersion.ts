import { AppError } from "@solid-memo/domain/appError";

/**
 * The version a document is at, as a backup notes it and an update's
 * write is held to (domain/backup.ts): the pod's ETag, as it gave it;
 * where it gives none, `Last-Modified: <its date>`; where it gives
 * neither, `sha256:<a hash of the content>`. Always asked for as Turtle:
 * an ETag belongs to one representation.
 */

const TURTLE = "text/turtle";

async function sha256(body: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", body);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The version a response says its document is at; its body is read only when it says nothing. */
export async function versionOfResponse(response: Response): Promise<string> {
  const etag = response.headers.get("ETag");
  if (etag !== null) return etag;
  const modified = response.headers.get("Last-Modified");
  if (modified !== null) return `Last-Modified: ${modified}`;
  return `sha256:${await sha256(await response.clone().arrayBuffer())}`;
}

/**
 * The version the document is at now, asked of the pod as a copy of it is
 * made: a GET, whose answer says it (a HEAD may not say the same: node-
 * solid-server answers one with a weak ETag of no content, which no edit
 * changes); null when there is none. Any other answer throws.
 */
export async function currentVersion(url: string, fetch: typeof globalThis.fetch): Promise<string | null> {
  const response = await fetch(url, { headers: { Accept: TURTLE } });
  if (response.status === 404) return null;
  if (!response.ok) throw new AppError("cannotCheck", { url, status: response.status });
  return versionOfResponse(response);
}

/** The ETag a write can be held to with If-Match; undefined for a weak one, or a version that is no ETag. */
export function ifMatchOf(version: string): string | undefined {
  return version.startsWith('"') ? version : undefined;
}
