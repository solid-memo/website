import { AppError } from "@solid-memo/domain/appError";

/**
 * The version a document is at, as a backup notes it and an update's
 * write is held to (domain/backup.ts): the pod's ETag, as it gave it;
 * where it gives none, `Last-Modified: <its date>`; where it gives
 * neither, `sha256:<a hash of the bytes served>`. Always asked for as
 * Turtle, as the app reads documents: an ETag belongs to one
 * representation, and the bytes are those of that representation.
 */

const TURTLE = "text/turtle";

async function sha256(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A document as the pod served it: its bytes, the Content-Type and the version of that very response. */
export interface Served {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
  version: string;
}

/**
 * The resource at the URL as the pod serves it now, never answered from
 * an earlier read (`cache: "no-store"`: a browser may otherwise answer
 * from its own cache, which a pod that gives a modification time and no
 * Cache-Control lets it keep for days): as Turtle (the app's documents),
 * or, `accept` null, as it is stored (a backup's file); null when there
 * is none. Any other answer throws.
 */
export async function served(
  url: string,
  fetch: typeof globalThis.fetch,
  accept: string | null = TURTLE,
): Promise<Served | null> {
  const response = await fetch(url, { cache: "no-store", ...(accept === null ? {} : { headers: { Accept: accept } }) });
  if (response.status === 404) return null;
  if (!response.ok) throw new AppError("cannotCheck", { url, status: response.status });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const etag = response.headers.get("ETag");
  const modified = response.headers.get("Last-Modified");
  const version = etag ?? (modified === null ? `sha256:${await sha256(bytes)}` : `Last-Modified: ${modified}`);
  return { bytes, contentType: response.headers.get("Content-Type") ?? TURTLE, version };
}

/**
 * The version the document is at now, asked of the pod as a backup reads
 * it: a GET, whose answer says it (a HEAD may not say the same: node-
 * solid-server answers one with a weak ETag of no content, which no edit
 * changes); null when there is none. Any other answer throws.
 */
export async function currentVersion(url: string, fetch: typeof globalThis.fetch): Promise<string | null> {
  return (await served(url, fetch))?.version ?? null;
}

/** The ETag a write can be held to with If-Match; undefined for a weak one, or a version that is no ETag. */
export function ifMatchOf(version: string): string | undefined {
  return version.startsWith('"') ? version : undefined;
}

/** Whether two byte strings are the same. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
