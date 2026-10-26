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
  type FetchedDataset,
  HttpError,
  type RequestOptions,
  type SourcedDataset,
} from "./interface";
import { getSolidDatasetLinear as libraryGetSolidDatasetLinear } from "./linearDataset";
import { datasetAt, sourceOf } from "./rdf";

/**
 * Reading and writing a pod's resources: documents as datasets (rdf.ts),
 * containers and files, of the types in interface.ts. A thin layer over
 * @inrupt/solid-client, the only implementation so far, so that the rest
 * of the package names no library. The operations keep the names the
 * library gives them, and its requests: their Accept and Content-Type
 * headers, the URLs they ask for, and the PATCH a saved edit sends
 * (datasets.ts writes its own body and leaves the library's where it
 * writes none).
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
 * Write a dataset to `url`: a PATCH of its changes when it was read from
 * there, else a PUT of the whole that only creates (If-None-Match: *).
 * Resolves to the dataset as now saved there, with no changes.
 */
export function saveSolidDatasetAt(
  url: string,
  dataset: Dataset,
  options: RequestOptions,
): Promise<FetchedDataset> {
  return answered(async () =>
    fetchedDataset(await librarySaveSolidDatasetAt(url, solidDataset(dataset), options)),
  );
}

/** Delete the document at `url`. */
export function deleteSolidDataset(url: string, options: RequestOptions): Promise<void> {
  return answered(() => libraryDeleteSolidDataset(url, options));
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
