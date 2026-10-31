// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  createContainerAt as libraryCreateContainerAt,
  deleteContainer as libraryDeleteContainer,
  deleteFile as libraryDeleteFile,
  deleteSolidDataset as libraryDeleteSolidDataset,
  FetchError,
  getContainedResourceUrlAll as libraryGetContainedResourceUrlAll,
  getFile as libraryGetFile,
  getPodUrlAllFrom as libraryGetPodUrlAllFrom,
  getProfileAll as libraryGetProfileAll,
  getSolidDataset as libraryGetSolidDataset,
  getTurtleParser as libraryGetTurtleParser,
  overwriteFile as libraryOverwriteFile,
  saveSolidDatasetAt as librarySaveSolidDatasetAt,
  solidDatasetAsTurtle as librarySolidDatasetAsTurtle,
  type SolidDataset,
  type Thing,
  type WithServerResourceInfo,
} from "@inrupt/solid-client";
import type { Quad } from "@rdfjs/types";
import { JsonLdParser } from "jsonld-streaming-parser";
import { fetchedDataset, serverDataset, solidDataset, sourcedDataset } from "./inrupt";
import {
  type Dataset,
  type DocumentRead,
  type DocumentWrite,
  type FetchedDataset,
  HttpError,
  ReadLimitError,
  type ReadLimits,
  type RequestOptions,
  type SourcedDataset,
} from "./interface";
import { getSolidDatasetLinear as libraryGetSolidDatasetLinear } from "./linearDataset";
import { changesOf, datasetAt, localNameOf, sourceOf, toRdfJsDataset } from "./rdf";
import { quadTally, type TextStream, textChunks, writeTurtle } from "./readLimits";
import { MAX_PATCH_BYTES, patchBody } from "./sparqlUpdate";
import { refuseUnwritable } from "../writableTerms";

/**
 * Reading and writing a pod's resources: documents as datasets (rdf.ts),
 * containers and files, of the types in interface.ts. A thin layer over
 * @inrupt/solid-client, the only implementation so far, so that the rest
 * of the package names no library; another implementation passes the
 * same contract (src/testing/contract/resources.ts). The operations
 * keep the names the library gives them, and its requests: their Accept and Content-Type
 * headers and the URLs they ask for. readDocument and writeDocument are
 * the app's own: the conditional reads and writes datasets.ts builds its
 * cache and its preconditions on, with the PATCH bodies the app writes
 * itself (sparqlUpdate.ts).
 *
 * A request the server answers with a failure rejects with an HttpError,
 * whose message is the library's: what the server was asked, and how it
 * answered. Its cause is the library's own error, with its stack.
 */

/** The request's result, its failure an HttpError where the server answered with one. */
async function answered<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof FetchError)
      throw new HttpError(error.message, error.response, { cause: error });
    throw error;
  }
}

/** The document at `url`, as a dataset. */
export function getSolidDataset(url: string, options?: RequestOptions): Promise<FetchedDataset> {
  return answered(async () => fetchedDataset(await libraryGetSolidDataset(url, options)));
}

/** The document at `url`, as getSolidDataset reads it, but built in time linear in its size (linearDataset.ts). */
export function getSolidDatasetLinear(
  url: string,
  options: { fetch: typeof globalThis.fetch },
): Promise<FetchedDataset> {
  return answered(async () => fetchedDataset(await libraryGetSolidDatasetLinear(url, options)));
}

/**
 * Read the document at `url` as getSolidDatasetLinear does, always from
 * the pod, never from the browser's cache (`no-store`), with the version
 * (ETag) the pod gives it. With `ifNoneMatch`, only if the document is no
 * longer at that version: `notModified` when it still is (304), with
 * nothing downloaded.
 */
export async function readDocument(
  url: string,
  { fetch, ifNoneMatch }: { fetch: typeof globalThis.fetch; ifNoneMatch?: string },
): Promise<DocumentRead> {
  let status: number | undefined;
  let etag: string | undefined;
  try {
    const dataset = await getSolidDatasetLinear(url, {
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        if (ifNoneMatch !== undefined) headers.set("If-None-Match", ifNoneMatch);
        // A browser would answer a plain read from its own cache, which a pod that gives a modification time
        // and no Cache-Control lets it keep for days; what is kept is the caller's to keep (datasets.ts).
        const response = await fetch(input, { ...init, headers, cache: "no-store" });
        status = response.status;
        etag = response.headers.get("ETag") ?? undefined;
        return response;
      },
    });
    return { dataset, etag };
  } catch (error) {
    // The library fails on a 304 without saying its status.
    if (status === 304 && ifNoneMatch !== undefined) return { notModified: true };
    throw error;
  }
}

/**
 * Write a dataset to `url`, and give it as now saved there, with the
 * version (ETag) the pod answered the write with:
 *
 * - an edit of the document it was read from is one PATCH of its
 *   changes, in the app's own SPARQL Update (patchBody); one the server
 *   refuses as a conflict (409) is sent once more with its deleted
 *   decimals spelled as numbers, as node-solid-server reads them. Where
 *   that body is larger than MAX_PATCH_BYTES, or always (`whole`), the
 *   edit is one PUT of the whole document instead, the edit applied: for
 *   a bulk edit of text, which Community Solid Server's in-memory store
 *   cuts short when a PATCH holds characters beyond ASCII. A change with a
 *   blank node, which patchBody cannot write, goes as the library writes it;
 * - a new dataset is a PUT that only creates (If-None-Match: *).
 *
 * With `ifMatch`, the write is made only if the document is still at that
 * version: a 412 otherwise, as HttpError.
 *
 * The library's save gives what it saved with the subjects made by name
 * resolved, copying the whole dataset at each subject, in time in the
 * square of its subjects. So it makes its request of the dataset as it
 * is (libraryRequestOf), but saves one with no subject in its default
 * graph, and the subjects are given back to what it saved, resolved in
 * one pass (withSubjectsOf).
 */
export async function writeDocument(
  url: string,
  dataset: Dataset,
  {
    fetch,
    ifMatch,
    whole = false,
  }: { fetch: typeof globalThis.fetch; ifMatch?: string; whole?: boolean },
): Promise<DocumentWrite> {
  let etag: string | undefined;
  const noting: typeof globalThis.fetch = async (input, init) => {
    const response = await fetch(input, init);
    etag = response.headers.get("ETag") ?? undefined;
    return response;
  };
  const data = solidDataset(dataset);
  const request = await libraryRequestOf(url, data);
  const written = ownPatches(withIfMatch(noting, ifMatch), dataset, whole);
  const saved = await answered(() =>
    librarySaveSolidDatasetAt(url, Object.freeze({ ...data, graphs: { default: {} } }), {
      // The library's only PUT creates the document: of the whole dataset, as it would send it.
      fetch: (input, init) =>
        written(input, init?.method === "PUT" ? { ...init, body: request.body } : init),
    }),
  );
  return { dataset: fetchedDataset(withSubjectsOf(saved, data)), etag };
}

/** What stops a save once the library has made its request (libraryRequestOf). */
const MADE = new Error("The request is made.");

/** The request the library's save of `data` to `url` makes, not sent. */
async function libraryRequestOf(url: string, data: SolidDataset): Promise<RequestInit> {
  let request: RequestInit | undefined;
  await librarySaveSolidDatasetAt(url, data, {
    fetch: async (_input, init) => {
      request = init;
      throw MADE;
    },
  }).catch((error: unknown) => {
    if (error !== MADE) throw error;
  });
  // The library's request always has its method, headers and body.
  return request!;
}

/**
 * `saved`, as the library saved a dataset with no subject in its default
 * graph, with the subjects of `data`'s default graph and its other
 * graphs, as the library resolves them once saved: a subject made by
 * name, and an IRI value of one, is `#name` in the document saved.
 */
function withSubjectsOf<T extends SolidDataset & WithServerResourceInfo>(
  saved: T,
  data: SolidDataset,
): T {
  const base = saved.internal_resourceInfo.sourceIri;
  const resolve = (iri: string) => {
    const name = localNameOf(iri);
    return name === undefined ? iri : `${base}#${name}`;
  };
  const isLocal = (objects: Thing["predicates"][string]) =>
    (objects.namedNodes ?? []).some((node) => localNameOf(node) !== undefined);
  const graph: Record<string, Thing> = Object.create(null);
  for (const [iri, thing] of Object.entries(data.graphs.default)) {
    const entries = Object.entries(thing.predicates);
    const predicates = !entries.some(([, objects]) => isLocal(objects))
      ? thing.predicates
      : Object.freeze(
          Object.fromEntries(
            entries.map(([predicate, objects]) => [
              predicate,
              isLocal(objects)
                ? Object.freeze({
                    ...objects,
                    namedNodes: Object.freeze(objects.namedNodes!.map(resolve)),
                  })
                : objects,
            ]),
          ),
        );
    graph[resolve(iri)] = Object.freeze({ ...thing, url: resolve(thing.url), predicates });
  }
  return Object.freeze({
    ...saved,
    graphs: Object.freeze({ ...data.graphs, default: Object.freeze(graph) }),
  });
}

/**
 * The fetch, refusing a write of a term Turtle cannot write as it is
 * (writableTerms.ts), with the PATCH the library sends given our body
 * (patchBody, sent again with its deleted decimals spelled as numbers
 * where a conflict (409) may come of their spelling), or sent as a PUT
 * of the whole dataset (its every triple, the edit applied) when that
 * body is larger than MAX_PATCH_BYTES, or always (`whole`); other
 * headers kept. The library takes the answer as its PATCH's.
 */
function ownPatches(
  fetch: typeof globalThis.fetch,
  dataset: Dataset,
  whole: boolean,
): typeof globalThis.fetch {
  return async (input, init) => {
    if (init?.method === "PUT") refuseUnwritable(toRdfJsDataset(dataset));
    if (init?.method !== "PATCH") return fetch(input, init);
    const changes = changesOf(dataset);
    const body = patchBody(changes, localNameOf) ?? init.body;
    if (
      !whole &&
      (typeof body !== "string" || new TextEncoder().encode(body).length <= MAX_PATCH_BYTES)
    ) {
      refuseUnwritable([...(changes?.additions ?? []), ...(changes?.deletions ?? [])]);
      const response = await fetch(input, { ...init, body });
      // node-solid-server finds no decimal deleted as it served it (`1.0`, `2.50`), only as it reads it (`1`,
      // `2.5`), and applies nothing (409): sent once more, decimals so spelled. A deletion of a triple that is
      // gone fails again, as it should; one found the second time names the same number.
      if (response.status !== 409) return response;
      const respelled = patchBody(changes, localNameOf, true);
      return respelled === null || respelled === body
        ? response
        : fetch(input, { ...init, body: respelled });
    }
    refuseUnwritable(toRdfJsDataset(dataset));
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "text/turtle");
    return fetch(input, {
      ...init,
      method: "PUT",
      headers,
      body: await solidDatasetAsTurtle(dataset),
    });
  };
}

/** The fetch, with `If-Match` added to the request that writes (the only one the library makes for it). */
function withIfMatch(
  fetch: typeof globalThis.fetch,
  etag: string | undefined,
): typeof globalThis.fetch {
  if (etag === undefined) return fetch;
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("If-Match", etag);
    return fetch(input, { ...init, headers });
  };
}

/** Delete the document at `url`; with `ifMatch`, only if it is still at that version (a 412 otherwise). */
export function deleteSolidDataset(
  url: string,
  { fetch, ifMatch }: { fetch: typeof globalThis.fetch; ifMatch?: string },
): Promise<void> {
  return answered(() => libraryDeleteSolidDataset(url, { fetch: withIfMatch(fetch, ifMatch) }));
}

/** Create a container at `url`, and those above it a server makes with it. */
export async function createContainerAt(url: string, options: RequestOptions): Promise<void> {
  await answered(() => libraryCreateContainerAt(url, options));
}

/** Delete the container at `url`, which servers do only when it is empty. */
export function deleteContainer(url: string, options: RequestOptions): Promise<void> {
  return answered(() => libraryDeleteContainer(url, options));
}

/** The file at `url`, as it is. */
export function getFile(url: string, options: RequestOptions): Promise<Blob> {
  return answered(() => libraryGetFile(url, options));
}

/** Write a file to `url`, as `contentType`, in place of any there. */
export async function overwriteFile(
  url: string,
  file: Blob,
  options: RequestOptions & { contentType: string },
): Promise<void> {
  await answered(() => libraryOverwriteFile(url, file, options));
}

/** Delete the file at `url`. */
export function deleteFile(url: string, options: RequestOptions): Promise<void> {
  return answered(() => libraryDeleteFile(url, options));
}

/**
 * The storages the profile of `webId` names (pim:storage): in its WebID
 * document, as already read (`webIdProfile`), and in the documents that
 * names as more of the profile, each read through `fetch`.
 */
export type ProfileStorages = (
  webId: string,
  options: RequestOptions & { webIdProfile: FetchedDataset },
) => Promise<string[]>;

/** The profile lookup over the library's `getProfileAll` and `getPodUrlAllFrom`. */
export const getProfileStorages: ProfileStorages = async (webId, { fetch, webIdProfile }) =>
  libraryGetPodUrlAllFrom(
    await answered(() =>
      libraryGetProfileAll(webId, {
        fetch,
        webIdProfile: serverDataset(webIdProfile),
      }),
    ),
    webId,
  );

const MEDIA_TYPES = { turtle: "text/turtle", jsonld: "application/ld+json" } as const;

/**
 * The quads of a Turtle or JSON-LD text, its relative IRIs resolved
 * against `baseUrl`, parsed as a pod's documents are: in every graph the
 * text names. Rejects with the parser's error on a text that does not
 * parse, and with a ReadLimitError at the first quad past `limits`
 * (quadTally; the text's own size is its caller's to check: it holds the
 * text already), or on a Turtle text at its first base past them
 * (writeTurtle); the parser reads no further. JSON-LD is read with no
 * fetch at all: a context named by its address is refused (parseJsonLd).
 */
export function parseQuads(
  text: string,
  format: keyof typeof MEDIA_TYPES,
  baseUrl: string,
  limits?: ReadLimits,
): Promise<Quad[]> {
  return new Promise((resolve, reject) => {
    const quads: Quad[] = [];
    const past = quadTally(limits);
    let refused = false;
    const refuse = () => {
      refused = true;
      quads.length = 0;
      // The tally, and the bases, are past limits only under some.
      reject(new ReadLimitError(baseUrl, limits!));
    };
    // Whether to go on: false once past limits, for the parser to stop (parseJsonLd, writeTurtle).
    const onQuad = (quad: Quad): boolean => {
      if (refused) return false;
      if (!past(quad)) {
        quads.push(quad);
        return true;
      }
      refuse();
      return false;
    };
    const done = () => resolve(quads);
    if (format === "jsonld") {
      parseJsonLd(text, baseUrl, { onQuad, onError: reject, done });
      return;
    }
    const parser = libraryGetTurtleParser();
    parser.onQuad(onQuad);
    parser.onError(reject);
    parser.onComplete(done);
    const resourceInfo = serverDataset(datasetAt(baseUrl, MEDIA_TYPES[format]));
    // solid-client hands the text to n3's parser as it is, which reads a stream as well.
    const parse = (stream: TextStream) => parser.parse(stream as unknown as string, resourceInfo);
    if (!writeTurtle(text, baseUrl, limits, parse, () => !refused)) refuse();
  });
}

/**
 * Parse a JSON-LD text by the parser @inrupt/solid-client reads JSON-LD
 * with, but given a document loader that loads nothing. The library's
 * loader fetches every context the text names by its address (or
 * `@import`s), from the user's browser; here such a text is refused
 * instead, as one that does not parse, whatever check came before. It
 * reads the text as it streams, so a node's `@context` is to come before
 * its other keys (refuseRemoteContexts writes it so), or the text does
 * not parse: otherwise the parser holds every node to the end, then
 * matches each against every typed one, time growing with their square.
 * The text is written in parts (textChunks), and the parser destroyed
 * once `onQuad` says not to go on, so that it reads no further than the
 * part it is in.
 */
function parseJsonLd(
  text: string,
  baseUrl: string,
  {
    onQuad,
    onError,
    done,
  }: { onQuad: (quad: Quad) => boolean; onError: (error: Error) => void; done: () => void },
): void {
  const parser = new JsonLdParser({
    baseIRI: baseUrl,
    streamingProfile: true,
    // refuseRemoteContexts refuses a type's own context; a plain one may come after the id.
    streamingProfileAllowOutOfOrderPlainType: true,
    documentLoader: {
      load: (url) => Promise.reject(new Error(`A JSON-LD context elsewhere is not read: ${url}`)),
    },
  });
  parser.on("data", (quad: Quad) => {
    if (!onQuad(quad)) parser.destroy();
  });
  parser.on("error", onError);
  parser.on("end", done);
  for (const chunk of textChunks(text)) parser.write(chunk);
  parser.end();
}

/** The URL of the document a dataset was read from or saved to; null for one built here. */
export function getSourceUrl(dataset: SourcedDataset): string;
export function getSourceUrl(dataset: Dataset): string | null;
export function getSourceUrl(dataset: Dataset): string | null {
  return sourceOf(dataset)?.url ?? null;
}

/** Whether a dataset knows the document it was read from or saved to. */
export function hasResourceInfo<T extends Dataset>(dataset: T): dataset is T & SourcedDataset {
  return sourceOf(dataset) !== undefined;
}

/** The URLs of the resources a container, read as a dataset, says it contains. */
export function getContainedResourceUrlAll(container: SourcedDataset): string[] {
  return libraryGetContainedResourceUrlAll(sourcedDataset(container));
}

/** A dataset as Turtle text, with `prefixes` for the IRIs it names. */
export function solidDatasetAsTurtle(
  dataset: Dataset,
  options?: { prefixes?: Record<string, string> },
): Promise<string> {
  return librarySolidDatasetAsTurtle(solidDataset(dataset), options);
}
