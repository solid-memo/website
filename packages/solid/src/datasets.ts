import {
  createSolidDataset,
  deleteFile,
  deleteSolidDataset,
  getSolidDataset,
  saveSolidDatasetAt,
  setThing,
  solidDatasetAsTurtle,
  toRdfJsDataset,
  type SolidDataset,
  type Thing,
  type WithChangeLog,
  type WithServerResourceInfo,
} from "@inrupt/solid-client";

import type { Literal, Quad } from "@rdfjs/types";
import { getSolidDatasetLinear } from "./linearDataset";
import { AppError } from "@solid-memo/domain/appError";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";

type Dataset = Awaited<ReturnType<typeof getSolidDataset>>;

/**
 * Reading and writing pod documents with HTTP preconditions, so that a
 * write never silently undoes someone else's (docs/data-model.md#write-discipline):
 *
 * - every read remembers the document's ETag, with the dataset it returned
 *   (keyed by its resource info, which edits of the dataset keep);
 * - saving an edit of a dataset read from the same URL sends
 *   `If-Match: <that ETag>`: had the document changed since, the pod
 *   answers 412 and nothing is written;
 * - saving a new dataset is a creation, which @inrupt/solid-client sends
 *   with `If-None-Match: *`: had the document appeared meanwhile, 412;
 * - deleting a document read before sends `If-Match` too.
 *
 * An edit's PATCH body is written here (patchBody), not by
 * @inrupt/solid-client: node-solid-server's parser fails on a triple whose
 * closing "." touches the term before it (`<#a> <#b> 1.}`), which is how
 * @inrupt/solid-client writes every patch, so no edit could be saved
 * there. Ours has one triple a line, a space before each ".". An edit too
 * large for one PATCH (MAX_PATCH_BYTES) is written as one PUT of the whole
 * document instead, with the same If-Match: node-solid-server reads a
 * PATCH body of at most 100 kB, and past that parses "[object Object]"
 * and fails, so an edit of every card of a large deck (a format update)
 * could not be saved there.
 *
 * A 412 becomes a PreconditionFailedError naming the document. Weak
 * ETags (`W/"…"`) are never sent in `If-Match`, where the comparison is
 * strong and would always fail; a document without an ETag, or one saved
 * since it was read (pods need not return the new ETag), is written
 * without `If-Match`.
 */
const ETAGS = new WeakMap<object, string>();

/** The largest PATCH body sent; a larger edit is a PUT of the whole document. Well under 100 kB. */
export const MAX_PATCH_BYTES = 64 * 1024;

/** The pod refused a write because the document is not as Solid Memo last saw it. */
export class PreconditionFailedError extends AppError {
  constructor(
    readonly url: string,
    readonly expected: "unchanged" | "absent",
  ) {
    super(expected === "unchanged" ? "changedElsewhere" : "createdElsewhere", { url });
    this.name = "PreconditionFailedError";
  }
}

/**
 * What has been read through each fetch, by URL. A screen asks for the
 * same document several times (a deck's cards for its study queue, the
 * format check and the data check), at once and again later:
 *
 * - a read already under way is shared rather than made again;
 * - a document read before is asked for with `If-None-Match: <its ETag>`,
 *   and on 304 the dataset read then is returned: datasets are immutable,
 *   so it is as good as a new one, without downloading the document again.
 *
 * A write to the URL forgets both, so no read after it gets what was
 * there before. Both are kept by document: a read by one of its subjects
 * (a WebID, `card#me`) is forgotten by a write to the document (`card`).
 */
const READS = new WeakMap<
  typeof globalThis.fetch,
  { inFlight: Map<string, Promise<Dataset>>; known: Map<string, { etag: string; dataset: Dataset }> }
>();

function readsOf(fetch: typeof globalThis.fetch) {
  let reads = READS.get(fetch);
  if (reads === undefined) {
    reads = { inFlight: new Map(), known: new Map() };
    READS.set(fetch, reads);
  }
  return reads;
}

/** Fetch a dataset, remembering its ETag for a later conditional write; see READS. */
export function readDataset(url: string, fetch: typeof globalThis.fetch): Promise<Dataset> {
  const { inFlight, known } = readsOf(fetch);
  const key = documentUrlOf(url);
  const shared = inFlight.get(key);
  if (shared !== undefined) return shared;
  const read = fetchDataset(url, fetch, known).finally(() => {
    if (inFlight.get(key) === read) inFlight.delete(key);
  });
  inFlight.set(key, read);
  return read;
}

/** A write is about to change the document: reads from now on fetch it again. */
function forgetRead(url: string, fetch: typeof globalThis.fetch): void {
  const reads = READS.get(fetch);
  if (reads === undefined) return;
  url = documentUrlOf(url);
  for (const key of reads.inFlight.keys()) {
    // Plain reads are keyed by the URL, reads since a version by the URL, a newline and the version.
    if (key === url || key.startsWith(`${url}\n`)) reads.inFlight.delete(key);
  }
  reads.known.delete(url);
}

/** A conditional read's answer: the document is still at the version asked about. */
export const UNCHANGED = "unchanged" as const;

/**
 * Read a document unless it is still at `version` (a version an earlier
 * visit learned, kept in the instance's digest): UNCHANGED on 304,
 * without a download; else the dataset, as readDataset gives it, or null
 * when there is none. Reads of the same document at the same version
 * under way at once are shared.
 */
export function readDatasetSince(
  url: string,
  version: string,
  fetch: typeof globalThis.fetch,
): Promise<Dataset | typeof UNCHANGED | null> {
  const { inFlight, known } = readsOf(fetch);
  const key = `${documentUrlOf(url)}\n${version}`;
  const shared = inFlight.get(key);
  if (shared !== undefined) return shared as Promise<Dataset | typeof UNCHANGED | null>;
  const read = fetchDataset(url, fetch, known, version)
    .catch((error: unknown) => {
      if (statusOf(error) === 404) return null;
      throw error;
    })
    .finally(() => {
      if (inFlight.get(key) === read) inFlight.delete(key);
    });
  inFlight.set(key, read as Promise<Dataset>);
  return read;
}

/** The version (ETag) a dataset was read at; undefined when the pod gave none. */
export function versionOf(dataset: object): string | undefined {
  const info = resourceInfoOf(dataset);
  return info === undefined ? undefined : ETAGS.get(info);
}

async function fetchDataset(
  url: string,
  fetch: typeof globalThis.fetch,
  known: Map<string, { etag: string; dataset: Dataset }>,
): Promise<Dataset>;
async function fetchDataset(
  url: string,
  fetch: typeof globalThis.fetch,
  known: Map<string, { etag: string; dataset: Dataset }>,
  since: string,
): Promise<Dataset | typeof UNCHANGED>;
async function fetchDataset(
  url: string,
  fetch: typeof globalThis.fetch,
  known: Map<string, { etag: string; dataset: Dataset }>,
  since?: string,
): Promise<Dataset | typeof UNCHANGED> {
  const document = documentUrlOf(url);
  const before = known.get(document);
  const asked = since ?? before?.etag;
  let etag: string | null = null;
  let notModified = false;
  let dataset: Dataset;
  try {
    dataset = await getSolidDatasetLinear(url, {
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        if (asked !== undefined) headers.set("If-None-Match", asked);
        const response = await fetch(input, { ...init, headers });
        // @inrupt/solid-client fails on a 304 without saying its status: noted here.
        notModified = response.status === 304;
        etag = response.headers.get("ETag");
        return response;
      },
    });
  } catch (error) {
    if (notModified && since !== undefined) return UNCHANGED;
    if (notModified && before !== undefined) return before.dataset;
    known.delete(document);
    throw error;
  }
  const info = resourceInfoOf(dataset);
  if (etag !== null && info !== undefined) ETAGS.set(info, etag);
  if (etag !== null) known.set(document, { etag, dataset });
  else known.delete(document);
  return dataset;
}

/**
 * Fetch a dataset, treating 404 as null — not-yet-created documents are a
 * normal state in this app. Any other failure still throws.
 */
export async function getSolidDatasetOrNull(
  url: string,
  fetch: typeof globalThis.fetch,
): Promise<Dataset | null> {
  try {
    return await readDataset(url, fetch);
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw error;
  }
}

/**
 * Save a dataset: an edit of the document it was read from only if that
 * is unchanged (If-Match), a new dataset only if nothing is there yet
 * (If-None-Match: *, sent by @inrupt/solid-client). `whole` writes an
 * edit as one PUT of the whole document (with the same If-Match) however
 * small it is: for a bulk edit of text, which Community Solid Server's
 * in-memory store cuts short when a PATCH holds characters beyond ASCII.
 */
export async function saveDataset<T extends SolidDataset>(
  url: string,
  dataset: T,
  fetch: typeof globalThis.fetch,
  { whole = false }: { whole?: boolean } = {},
): Promise<void> {
  const info = resourceInfoOf(dataset);
  const isEdit = info !== undefined && info.sourceIri === url;
  const etag = isEdit ? strong(ETAGS.get(info)) : undefined;
  forgetRead(url, fetch);
  try {
    await saveSolidDatasetAt(url, dataset, { fetch: ownPatches(withIfMatch(fetch, etag), dataset, whole) });
  } catch (error) {
    if (statusOf(error) === 412) throw new PreconditionFailedError(url, isEdit ? "unchanged" : "absent");
    throw error;
  }
  // The pod need not say the new ETag; a later write reads again.
  if (info !== undefined) ETAGS.delete(info);
}

/** Delete a document read before, only if it is unchanged since (If-Match). */
export async function deleteDataset(
  url: string,
  dataset: SolidDataset,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  const info = resourceInfoOf(dataset);
  const etag = info !== undefined && info.sourceIri === url ? strong(ETAGS.get(info)) : undefined;
  forgetRead(url, fetch);
  try {
    await deleteSolidDataset(url, { fetch: withIfMatch(fetch, etag) });
  } catch (error) {
    if (statusOf(error) === 412) throw new PreconditionFailedError(url, "unchanged");
    throw error;
  }
}

/**
 * Delete a resource without reading it whole; one that is gone counts as
 * deleted. For removing documents Solid Memo wrote whole, where no edit
 * made since is to be kept: an instance being deleted (instanceData.ts).
 * Whether it is there is asked first (HEAD): node-solid-server answers a
 * DELETE of what is not there with 401, not 404.
 */
export async function deleteIfPresent(url: string, fetch: typeof globalThis.fetch): Promise<void> {
  forgetRead(url, fetch);
  if ((await fetch(url, { method: "HEAD" })).status === 404) return;
  try {
    await deleteFile(url, { fetch });
  } catch (error) {
    if (statusOf(error) !== 404) throw error;
  }
}

/** The fetch, with `If-Match` added to the request that writes (the only one @inrupt/solid-client makes for it). */
function withIfMatch(fetch: typeof globalThis.fetch, etag: string | undefined): typeof globalThis.fetch {
  if (etag === undefined) return fetch;
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("If-Match", etag);
    return fetch(input, { ...init, headers });
  };
}

/**
 * The fetch, with the PATCH @inrupt/solid-client sends given our body
 * (patchBody), or sent as a PUT of the whole dataset (its every triple,
 * the edit applied) when that body is larger than MAX_PATCH_BYTES, or
 * always (`whole`); other headers kept. @inrupt/solid-client takes the
 * answer as its PATCH's.
 */
function ownPatches(fetch: typeof globalThis.fetch, dataset: SolidDataset, whole: boolean): typeof globalThis.fetch {
  return async (input, init) => {
    if (init?.method !== "PATCH") return fetch(input, init);
    const body = patchBody(dataset) ?? init.body;
    if (!whole && (typeof body !== "string" || new TextEncoder().encode(body).length <= MAX_PATCH_BYTES)) {
      return fetch(input, { ...init, body });
    }
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "text/turtle");
    return fetch(input, { ...init, method: "PUT", headers, body: await solidDatasetAsTurtle(dataset) });
  };
}

/**
 * Add a subject's triples to a document without reading it first: one
 * insert-only PATCH, with no precondition, since inserting a subject no
 * other writer names cannot clash with any other edit. Every server the
 * app is tested on creates the document (and its container) when it is
 * missing, and keeps every one of several concurrent inserts.
 */
export function appendToDocument(url: string, thing: Thing, fetch: typeof globalThis.fetch): Promise<void> {
  return appendAllToDocument(url, [thing], fetch);
}

/**
 * Add several subjects' triples to a document without reading it, as
 * appendToDocument adds one: one insert-only PATCH, or several in turn
 * where one would be larger than MAX_PATCH_BYTES, each subject whole in
 * one. A subject whose triples are there already changes nothing.
 */
export async function appendAllToDocument(
  url: string,
  things: readonly Thing[],
  fetch: typeof globalThis.fetch,
): Promise<void> {
  const encoder = new TextEncoder();
  const batches: (string | null)[][] = [];
  let size = 0;
  for (const thing of things) {
    const lines = [...toRdfJsDataset(setThing(createSolidDataset(), thing))].map(tripleLine);
    const bytes = encoder.encode(lines.join("\n")).length + 1;
    if (batches.length === 0 || size + bytes > MAX_PATCH_BYTES) {
      batches.push(lines);
      size = bytes;
    } else {
      batches.at(-1)!.push(...lines);
      size += bytes;
    }
  }
  for (const triples of batches) {
    forgetRead(url, fetch);
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/sparql-update" },
      body: `INSERT DATA {\n${triples.join("\n")}\n};\n`,
    });
    if (!response.ok) throw new AppError("addFailed", { url, status: response.status });
  }
}

/** Where @inrupt/solid-client names a Thing that has no URL yet: `<#name>` in the document. */
const LOCAL_NODE = "https://inrupt.com/.well-known/sdk-local-node/";
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

/**
 * The SPARQL Update of a dataset's changes, one triple a line in
 * N-Triples form, every triple closed by " .": what every Solid server
 * parses, node-solid-server's too. Null when a change has a blank node,
 * which DELETE DATA cannot name; then @inrupt/solid-client's body is sent.
 */
export function patchBody(dataset: SolidDataset): string | null {
  const changes = (dataset as Partial<WithChangeLog>).internal_changeLog;
  if (changes === undefined) return null;
  const block = (operation: string, quads: readonly Quad[]): string | null => {
    const triples = quads.map(tripleLine);
    if (triples.includes(null)) return null;
    return triples.length === 0 ? "" : `${operation} {\n${triples.join("\n")}\n};\n`;
  };
  const deletions = block("DELETE DATA", changes.deletions);
  const additions = block("INSERT DATA", changes.additions);
  return deletions === null || additions === null ? null : deletions + additions;
}

function tripleLine(quad: Quad): string | null {
  const { subject, predicate, object } = quad;
  if (subject.termType !== "NamedNode" || (object.termType !== "NamedNode" && object.termType !== "Literal")) {
    return null;
  }
  return `${iri(subject.value)} ${iri(predicate.value)} ${object.termType === "Literal" ? literal(object) : iri(object.value)} .`;
}

function iri(value: string): string {
  return value.startsWith(LOCAL_NODE) ? `<#${value.slice(LOCAL_NODE.length)}>` : `<${value}>`;
}

function literal(term: Literal): string {
  const text = `"${term.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
  if (term.language !== "") return `${text}@${term.language}`;
  return term.datatype.value === XSD_STRING ? text : `${text}^^<${term.datatype.value}>`;
}

function strong(etag: string | undefined): string | undefined {
  return etag === undefined || etag.startsWith("W/") ? undefined : etag;
}

function resourceInfoOf(dataset: object): WithServerResourceInfo["internal_resourceInfo"] | undefined {
  return (dataset as Partial<WithServerResourceInfo>).internal_resourceInfo;
}

function statusOf(error: unknown): number | undefined {
  const candidate = error as { statusCode?: number; response?: { status?: number } };
  return candidate.statusCode ?? candidate.response?.status;
}
