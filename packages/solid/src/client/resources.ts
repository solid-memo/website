// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  createContainerAt as libraryCreateContainerAt,
  deleteContainer as libraryDeleteContainer,
  deleteFile as libraryDeleteFile,
  deleteSolidDataset as libraryDeleteSolidDataset,
  FetchError,
  getFile as libraryGetFile,
  getJsonLdParser,
  getPodUrlAllFrom,
  getProfileAll,
  getSolidDataset as libraryGetSolidDataset,
  getTurtleParser,
  overwriteFile as libraryOverwriteFile,
  saveSolidDatasetAt as librarySaveSolidDatasetAt,
  type WithServerResourceInfo,
} from "@inrupt/solid-client";
import type { Quad } from "@rdfjs/types";
import { getSolidDatasetLinear as libraryGetSolidDatasetLinear } from "./linearDataset";
import { type Dataset, datasetAt, type FetchedDataset } from "./rdf";

/**
 * Reading and writing a pod's resources: documents as datasets (rdf.ts),
 * containers and files. A thin layer over @inrupt/solid-client, the only
 * implementation so far, so that the rest of the package names no
 * library. The operations keep the names the library gives them, and its
 * requests: their Accept and Content-Type headers, the URLs they ask
 * for, and the PATCH a saved edit sends (datasets.ts writes its own body
 * and leaves the library's where it writes none).
 *
 * A request the server answers with a failure rejects with an HttpError,
 * whose message is the library's: what the server was asked, and how it
 * answered. Its cause is the library's own error, with its stack.
 */

/** The server answered a request with a failure: `statusCode` says which. */
export class HttpError extends Error {
  /** The response's status. */
  readonly statusCode: number;

  constructor(
    message: string,
    /** The server's response. */
    readonly response: Response,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HttpError";
    this.statusCode = response.status;
  }
}

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

/** How a request is sent: through `fetch`, the browser's own when none is given. */
export interface RequestOptions {
  fetch?: typeof globalThis.fetch;
}

/** The document at `url`, as a dataset. */
export function getSolidDataset(url: string, options?: RequestOptions): Promise<FetchedDataset> {
  return answered(() => libraryGetSolidDataset(url, options));
}

/** The document at `url`, as getSolidDataset reads it, but built in time linear in its size (linearDataset.ts). */
export function getSolidDatasetLinear(
  url: string,
  options: { fetch: typeof globalThis.fetch },
): Promise<FetchedDataset> {
  return answered(() => libraryGetSolidDatasetLinear(url, options));
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
  return answered(() => librarySaveSolidDatasetAt(url, dataset, options));
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

/** A file's contents, with what the server said of it. */
export type FetchedFile = Blob & WithServerResourceInfo;

/** The file at `url`, as it is. */
export function getFile(url: string, options: RequestOptions): Promise<FetchedFile> {
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
export const getProfileStorages: ProfileStorages = async (webId, options) =>
  getPodUrlAllFrom(await answered(() => getProfileAll(webId, options)), webId);

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
  const parser = format === "turtle" ? getTurtleParser() : getJsonLdParser();
  return new Promise((resolve, reject) => {
    const quads: Quad[] = [];
    parser.onQuad((quad) => quads.push(quad));
    parser.onError(reject);
    parser.onComplete(() => resolve(quads));
    parser.parse(text, datasetAt(baseUrl, MEDIA_TYPES[format]));
  });
}

export {
  getContainedResourceUrlAll,
  getSourceUrl,
  hasResourceInfo,
  solidDatasetAsTurtle,
} from "@inrupt/solid-client";
