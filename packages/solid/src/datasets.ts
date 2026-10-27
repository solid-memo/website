// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  type FetchedDataset,
  type Subject,
  changesOf,
  createSolidDataset,
  getThing,
  localNameOf,
  removeThing,
  removeUrl,
  setThing,
  sourceOf,
  toRdfJsDataset,
  withQuads,
} from "./client/rdf";

import type { Quad } from "@rdfjs/types";
import { deleteSolidDataset, readDocument, writeDocument } from "./client/resources";
import { MAX_PATCH_BYTES, patchBody, tripleLine } from "./client/sparqlUpdate";
import { unlessNewer } from "./records";
import { refuseUnwritable } from "./writableTerms";
import { AppError } from "@solid-memo/domain/appError";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";

/**
 * Reading and writing pod documents with HTTP preconditions, so that a
 * write never silently undoes someone else's (docs/data-model.md#write-discipline):
 *
 * - every read remembers the document's ETag, with the dataset it returned
 *   (keyed by its source's key, which edits of the dataset keep);
 * - saving an edit of a dataset read from the same URL sends
 *   `If-Match: <that ETag>`: had the document changed since, the pod
 *   answers 412 and nothing is written;
 * - saving a new dataset is a creation, sent with `If-None-Match: *`
 *   (client/resources.ts writeDocument): had the document appeared
 *   meanwhile, 412;
 * - deleting a document read before sends `If-Match` too, and so does
 *   removing what Solid Memo owns of one (removeOwned).
 *
 * What goes over the wire, the PATCH of an edit or the PUT of a whole
 * document too large for one PATCH (MAX_PATCH_BYTES), each with the same
 * If-Match, is writeDocument's; this module decides which version a
 * write is conditional on, and keeps what a read or write learned.
 *
 * A 412 becomes a PreconditionFailedError naming the document. Weak
 * ETags (`W/"…"`) are never sent in `If-Match`, where the comparison is
 * strong and would always fail; a document without an ETag is written
 * without `If-Match`. A write the pod answers with a strong ETag, made
 * on a precondition (so the document now holds just what was written),
 * keeps the written dataset at that version, as a read keeps what it
 * read: a later edit of it sends `If-Match: <that ETag>`, and the next
 * read asks `If-None-Match` with it. Pods need not give the new ETag;
 * without one, a dataset saved is written again without `If-Match`, and
 * the next read downloads the document.
 */
const ETAGS = new WeakMap<object, string>();

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
 * there before, unless the write kept its own dataset (above): then that
 * is what is known. Both are kept by document: a read by one of its
 * subjects (a WebID, `card#me`) is forgotten by a write to the document
 * (`card`). Every read asks the pod, never the browser's cache
 * (readDocument): this is the only cache.
 */
const READS = new WeakMap<
  typeof globalThis.fetch,
  {
    inFlight: Map<string, Promise<FetchedDataset>>;
    known: Map<string, { etag: string; dataset: FetchedDataset }>;
  }
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
export function readDataset(url: string, fetch: typeof globalThis.fetch): Promise<FetchedDataset> {
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

/**
 * The dataset last read from a document, or written to it, at the strong
 * version the pod then gave, without asking the pod; undefined when none
 * is known, or only a weak one, which If-Match cannot name. An edit of it
 * is written only if the document is still at that version (If-Match):
 * one that changed since is refused (PreconditionFailedError), to be read
 * again.
 */
export function keptDataset(
  url: string,
  fetch: typeof globalThis.fetch,
): FetchedDataset | undefined {
  const kept = READS.get(fetch)?.known.get(documentUrlOf(url));
  return kept === undefined || strong(kept.etag) === undefined ? undefined : kept.dataset;
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
): Promise<FetchedDataset | typeof UNCHANGED | null> {
  const { inFlight, known } = readsOf(fetch);
  const key = `${documentUrlOf(url)}\n${version}`;
  const shared = inFlight.get(key);
  if (shared !== undefined) return shared as Promise<FetchedDataset | typeof UNCHANGED | null>;
  const read = fetchDataset(url, fetch, known, version)
    .catch((error: unknown) => {
      if (statusOf(error) === 404) return null;
      throw error;
    })
    .finally(() => {
      if (inFlight.get(key) === read) inFlight.delete(key);
    });
  inFlight.set(key, read as Promise<FetchedDataset>);
  return read;
}

/** The version (ETag) a dataset was read at; undefined when the pod gave none. */
export function versionOf(dataset: object): string | undefined {
  const source = sourceOf(dataset);
  return source === undefined ? undefined : ETAGS.get(source.key);
}

async function fetchDataset(
  url: string,
  fetch: typeof globalThis.fetch,
  known: Map<string, { etag: string; dataset: FetchedDataset }>,
): Promise<FetchedDataset>;
async function fetchDataset(
  url: string,
  fetch: typeof globalThis.fetch,
  known: Map<string, { etag: string; dataset: FetchedDataset }>,
  since: string,
): Promise<FetchedDataset | typeof UNCHANGED>;
async function fetchDataset(
  url: string,
  fetch: typeof globalThis.fetch,
  known: Map<string, { etag: string; dataset: FetchedDataset }>,
  since?: string,
): Promise<FetchedDataset | typeof UNCHANGED> {
  const document = documentUrlOf(url);
  const before = known.get(document);
  let read: Awaited<ReturnType<typeof readDocument>>;
  try {
    read = await readDocument(url, { fetch, ifNoneMatch: since ?? before?.etag });
  } catch (error) {
    known.delete(document);
    throw error;
  }
  // Asked without `since`, the version asked about is the one `before` was read at.
  if ("notModified" in read) return since === undefined ? before!.dataset : UNCHANGED;
  const { dataset, etag } = read;
  const source = sourceOf(dataset);
  if (etag !== undefined && source !== undefined) ETAGS.set(source.key, etag);
  if (etag !== undefined) known.set(document, { etag, dataset });
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
): Promise<FetchedDataset | null> {
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
 * (If-None-Match: *). `whole` writes an edit as one PUT of the whole
 * document (with the same If-Match) however small it is (writeDocument).
 */
export async function saveDataset<T extends Dataset>(
  url: string,
  dataset: T,
  fetch: typeof globalThis.fetch,
  { whole = false }: { whole?: boolean } = {},
): Promise<void> {
  const source = sourceOf(dataset);
  const isEdit = source !== undefined && source.url === url;
  const etag = isEdit ? strong(ETAGS.get(source.key)) : undefined;
  forgetRead(url, fetch);
  let written: Awaited<ReturnType<typeof writeDocument>>;
  try {
    written = await writeDocument(url, dataset, { fetch, ifMatch: etag, whole });
  } catch (error) {
    if (statusOf(error) === 412)
      throw new PreconditionFailedError(url, isEdit ? "unchanged" : "absent");
    throw error;
  }
  if (source !== undefined) ETAGS.delete(source.key);
  // Only where a precondition held does the document hold just what was written.
  const version = strong(written.etag);
  if (version === undefined || (isEdit && etag === undefined)) return;
  const savedSource = sourceOf(written.dataset);
  if (savedSource?.url !== url) return;
  ETAGS.set(savedSource.key, version);
  readsOf(fetch).known.set(documentUrlOf(url), { etag: version, dataset: written.dataset });
}

/** Whether `dataset` was read from (or last saved to) `url`: a save of it is an edit there, If-Match its version. */
export function isReadFrom(dataset: object, url: string): boolean {
  return sourceOf(dataset)?.url === url;
}

/** Delete a document read before, only if it is unchanged since (If-Match). */
export async function deleteDataset(
  url: string,
  dataset: Dataset,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  const source = sourceOf(dataset);
  const etag = source?.url === url ? strong(ETAGS.get(source.key)) : undefined;
  forgetRead(url, fetch);
  try {
    await deleteSolidDataset(url, { fetch, ifMatch: etag });
  } catch (error) {
    if (statusOf(error) === 412) throw new PreconditionFailedError(url, "unchanged");
    throw error;
  }
}

/** One statement of a document: its subject, predicate and object, an IRI each. */
export type Statement = readonly [subject: string, predicate: string, object: string];

/**
 * What of a document is Solid Memo's to remove (removeOwned): subjects,
 * each with all it states, or those and single statements of a subject
 * that otherwise stays.
 */
export type Owned =
  | ReadonlySet<string>
  | { readonly subjects: ReadonlySet<string>; readonly statements: readonly Statement[] };

/** What removeOwned did to a document: there was none, it is gone, or it is kept with what is not Solid Memo's. */
export type Removal = "absent" | "deleted" | "kept";

/**
 * Remove from a document what Solid Memo owns of it, and the document
 * itself only when nothing else is left in it (docs/data-model.md
 * "Write discipline"):
 *
 * 1. it is read afresh; none there is "absent", and one that is not RDF
 *    is never Solid Memo's: "kept", nothing sent;
 * 2. `owns` names the subjects of it that are Solid Memo's to remove
 *    (ownership.ts), less any a newer version of the app wrote
 *    (unlessNewer), and any single statements of another subject that
 *    are (Owned); a blank node goes with them when only they name it;
 * 3. nothing else left: the document is deleted, If-Match its read
 *    (where the pod gave a strong ETag: on a pod that gives none, an
 *    edit made meanwhile is deleted too, as it is written over by every
 *    other write there);
 * 4. something else left: the removed subjects are taken out of it, a
 *    PATCH of `DELETE DATA` (If-Match where the pod gave a strong ETag),
 *    or, where a blank node goes, one PUT of what is left, If-Match: a
 *    pod that gives no strong ETag gets neither, nor one PATCH too large
 *    for a PATCH (MAX_PATCH_BYTES), which would be a PUT written over
 *    whatever changed meanwhile; then the document is kept as it is.
 *
 * A document changed meanwhile (412) is read again and the removal made
 * once more; a second 412 is a PreconditionFailedError.
 */
export async function removeOwned(
  url: string,
  owns: (dataset: Dataset) => Owned,
  fetch: typeof globalThis.fetch,
): Promise<Removal> {
  try {
    return await removeOwnedOnce(url, owns, fetch);
  } catch (error) {
    if (!(error instanceof PreconditionFailedError)) throw error;
    return removeOwnedOnce(url, owns, fetch);
  }
}

async function removeOwnedOnce(
  url: string,
  owns: (dataset: Dataset) => Owned,
  fetch: typeof globalThis.fetch,
): Promise<Removal> {
  let served = false;
  // A fetch of its own, so the read is made afresh, never one remembered from before.
  const noting = (async (input, init) => {
    const response = await fetch(input, init);
    served = response.ok;
    return response;
  }) as typeof globalThis.fetch;
  let dataset: FetchedDataset | null;
  try {
    dataset = await getSolidDatasetOrNull(url, noting);
  } catch (error) {
    if (served) return "kept";
    throw error;
  }
  if (dataset === null) return "absent";
  const quads = [...toRdfJsDataset(dataset)];
  const found = owns(dataset);
  const { subjects, statements } =
    "subjects" in found ? found : { subjects: found, statements: [] };
  const owned = [...subjects].filter((subject) => !isNewer(dataset, subject));
  const removed = withOnlyTheirBlankNodes(quads, owned);
  const isGone = (quad: Quad) =>
    removed.has(termKey(quad.subject)) ||
    statements.some(
      ([subject, predicate, object]) =>
        quad.subject.value === subject &&
        quad.predicate.value === predicate &&
        quad.object.value === object,
    );
  const left = quads.filter((quad) => !isGone(quad));
  if (left.length === 0) {
    try {
      await deleteDataset(url, dataset, fetch);
    } catch (error) {
      // Gone since it was read: what was to be deleted is.
      if (statusOf(error) !== 404) throw error;
    }
    return "deleted";
  }
  const gone = quads.filter(isGone);
  if (gone.length === 0) return "kept";
  const etag = strong(ETAGS.get(sourceOf(dataset)!.key));
  if (
    gone.some(
      (quad) => quad.subject.termType === "BlankNode" || quad.object.termType === "BlankNode",
    )
  ) {
    if (etag === undefined) return "kept";
    await saveDataset(url, withQuads(dataset, left), fetch, { whole: true });
    return "kept";
  }
  const edited = statements.reduce(
    (current, [subject, predicate, object]) =>
      setThing(current, removeUrl(getThing(current, subject)!, predicate, object)),
    owned.reduce((current, subject) => removeThing(current, subject), dataset),
  );
  const body = patchBody(changesOf(edited), localNameOf)!;
  if (etag === undefined && new TextEncoder().encode(body).length > MAX_PATCH_BYTES) return "kept";
  await saveDataset(url, edited, fetch);
  return "kept";
}

/** Whether a newer version of the app wrote the subject (unlessNewer): it is never removed. */
function isNewer(dataset: Dataset, subject: string): boolean {
  const thing = getThing(dataset, subject);
  try {
    if (thing !== null) unlessNewer(thing);
    return false;
  } catch {
    return true;
  }
}

/**
 * The subjects, and the blank nodes only they name, and those only these
 * name, on: what goes with them. A blank node something else names stays.
 */
function withOnlyTheirBlankNodes(quads: readonly Quad[], subjects: readonly string[]): Set<string> {
  const namedBy = new Map<string, string[]>();
  const names = new Map<string, string[]>();
  for (const quad of quads) {
    if (quad.object.termType !== "BlankNode") continue;
    const from = termKey(quad.subject);
    const blank = termKey(quad.object);
    namedBy.set(blank, [...(namedBy.get(blank) ?? []), from]);
    names.set(from, [...(names.get(from) ?? []), blank]);
  }
  const removed = new Set(subjects);
  const pending = [...subjects];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    for (const blank of names.get(key) ?? []) {
      if (removed.has(blank) || !namedBy.get(blank)!.every((from) => removed.has(from))) continue;
      removed.add(blank);
      pending.push(blank);
    }
  }
  return removed;
}

/** A subject or object as a dataset keys it: a blank node `_:` and its label. */
function termKey(term: { termType: string; value: string }): string {
  return term.termType === "BlankNode" ? `_:${term.value}` : term.value;
}

/**
 * Add a subject's triples to a document without reading it first: one
 * insert-only PATCH, with no precondition, since inserting a subject no
 * other writer names cannot clash with any other edit. Every server the
 * app is tested on creates the document (and its container) when it is
 * missing, and keeps every one of several concurrent inserts.
 */
export function appendToDocument(
  url: string,
  thing: Subject,
  fetch: typeof globalThis.fetch,
): Promise<void> {
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
  things: readonly Subject[],
  fetch: typeof globalThis.fetch,
): Promise<void> {
  const encoder = new TextEncoder();
  const batches: (string | null)[][] = [];
  let size = 0;
  for (const thing of things) {
    const quads = [...toRdfJsDataset(setThing(createSolidDataset(), thing))];
    refuseUnwritable(quads);
    const lines = quads.map((quad) => tripleLine(quad, localNameOf, false));
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

function strong(etag: string | undefined): string | undefined {
  return etag === undefined || etag.startsWith("W/") ? undefined : etag;
}

function statusOf(error: unknown): number | undefined {
  const candidate = error as { statusCode?: number; response?: { status?: number } };
  return candidate.statusCode ?? candidate.response?.status;
}
