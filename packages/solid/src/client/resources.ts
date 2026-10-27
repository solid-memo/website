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
  getJsonLdParser as libraryGetJsonLdParser,
  getPodUrlAllFrom as libraryGetPodUrlAllFrom,
  getProfileAll as libraryGetProfileAll,
  getSolidDataset as libraryGetSolidDataset,
  getTurtleParser as libraryGetTurtleParser,
  overwriteFile as libraryOverwriteFile,
  saveSolidDatasetAt as librarySaveSolidDatasetAt,
  solidDatasetAsTurtle as librarySolidDatasetAsTurtle,
} from "@inrupt/solid-client";
import type { Quad } from "@rdfjs/types";
import { fetchedDataset, serverDataset, solidDataset, sourcedDataset } from "./inrupt";
import {
  type Dataset,
  type DocumentRead,
  type DocumentWrite,
  type FetchedDataset,
  HttpError,
  type RequestOptions,
  type SourcedDataset,
} from "./interface";
import { getSolidDatasetLinear as libraryGetSolidDatasetLinear } from "./linearDataset";
import { changesOf, datasetAt, localNameOf, sourceOf, toRdfJsDataset } from "./rdf";
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
  const saved = await answered(async () =>
    fetchedDataset(
      await librarySaveSolidDatasetAt(url, solidDataset(dataset), {
        fetch: ownPatches(withIfMatch(noting, ifMatch), dataset, whole),
      }),
    ),
  );
  return { dataset: saved, etag };
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
 * text names. Rejects with the parser's error on a text that does not parse.
 */
export function parseQuads(
  text: string,
  format: keyof typeof MEDIA_TYPES,
  baseUrl: string,
): Promise<Quad[]> {
  const parser = format === "turtle" ? libraryGetTurtleParser() : libraryGetJsonLdParser();
  return new Promise((resolve, reject) => {
    const quads: Quad[] = [];
    parser.onQuad((quad) => quads.push(quad));
    parser.onError(reject);
    parser.onComplete(() => resolve(quads));
    parser.parse(text, serverDataset(datasetAt(baseUrl, MEDIA_TYPES[format])));
  });
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
