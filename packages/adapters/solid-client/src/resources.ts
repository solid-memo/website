// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * What a Solid client gives for resources: declarations alone, with no
 * body, which solid and the app are typechecked against. An import of
 * this module resolves to the module of the same name in the client
 * SOLID_CLIENT names (scripts/solidClient.ts): inrupt-client, the
 * default, or solid-memo-client. Both pass the contract in
 * packages/adapters/solid/src/testing/contract/resources.ts, and are checked to
 * give every declaration here with its type (clientTypes.test.ts in
 * each). Where a description names "the library", it is the one the
 * default client is built on, whose behavior the app relies on.
 */

import type { Quad } from "@rdfjs/types";
import type {
  Dataset,
  DocumentRead,
  DocumentWrite,
  FetchedDataset,
  ReadLimits,
  RequestOptions,
  SourcedDataset,
} from "./interface";
/**
 * The document at `url`, as a dataset, read as getSolidDatasetLinear
 * reads it: under the limits of a response limitedFetch gave, and always
 * under the bound on a Turtle text's declarations and IRIs
 * (writeTurtle), so that a container's listing, a profile or any other
 * document is parsed as the documents of a deck are. With no fetch, the
 * global one.
 */
export declare function getSolidDataset(
  url: string,
  options?: RequestOptions,
): Promise<FetchedDataset>;
/** The document at `url`, as getSolidDataset reads it, but built in time linear in its size (linearDataset.ts). */
export declare function getSolidDatasetLinear(
  url: string,
  options: {
    fetch: typeof globalThis.fetch;
  },
): Promise<FetchedDataset>;
/**
 * Read the document at `url` as getSolidDatasetLinear does, always from
 * the pod, never from the browser's cache (`no-store`), with the version
 * (ETag) the pod gives it. With `ifNoneMatch`, only if the document is no
 * longer at that version: `notModified` when it still is (304), with
 * nothing downloaded.
 */
export declare function readDocument(
  url: string,
  {
    fetch,
    ifNoneMatch,
  }: {
    fetch: typeof globalThis.fetch;
    ifNoneMatch?: string;
  },
): Promise<DocumentRead>;
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
 * A PUT's body is the whole dataset as solidDatasetAsTurtle writes it,
 * every IRI in full, never the library's. The library's save gives what
 * it saved with the subjects made by name resolved, copying the whole
 * dataset at each subject, in time in the square of its subjects. So it
 * saves one with no subject in its default graph, and the subjects are
 * given back to what it saved, resolved in one pass (withSubjectsOf).
 */
export declare function writeDocument(
  url: string,
  dataset: Dataset,
  {
    fetch,
    ifMatch,
    whole,
  }: {
    fetch: typeof globalThis.fetch;
    ifMatch?: string;
    whole?: boolean;
  },
): Promise<DocumentWrite>;
/** Delete the document at `url`; with `ifMatch`, only if it is still at that version (a 412 otherwise). */
export declare function deleteSolidDataset(
  url: string,
  {
    fetch,
    ifMatch,
  }: {
    fetch: typeof globalThis.fetch;
    ifMatch?: string;
  },
): Promise<void>;
/** Create a container at `url`, and those above it a server makes with it. */
export declare function createContainerAt(url: string, options: RequestOptions): Promise<void>;
/** Delete the container at `url`, which servers do only when it is empty. */
export declare function deleteContainer(url: string, options: RequestOptions): Promise<void>;
/** The file at `url`, as it is. */
export declare function getFile(url: string, options: RequestOptions): Promise<Blob>;
/** Write a file to `url`, as `contentType`, in place of any there. */
export declare function overwriteFile(
  url: string,
  file: Blob,
  options: RequestOptions & {
    contentType: string;
  },
): Promise<void>;
/** Delete the file at `url`. */
export declare function deleteFile(url: string, options: RequestOptions): Promise<void>;
/**
 * The storages the profile of `webId` names (pim:storage): in its WebID
 * document, as already read (`webIdProfile`), and in the documents that
 * names as more of the profile, each read through `fetch`.
 */
export type ProfileStorages = (
  webId: string,
  options: RequestOptions & {
    webIdProfile: FetchedDataset;
  },
) => Promise<string[]>;
/**
 * The profile lookup: the WebID document and those it names as more of
 * the profile that can be read, each asked of the WebID's storages. Each
 * is read as every pod document is (getSolidDatasetLinear), under the
 * limits of a response `fetch` gives (solidStorageGateway.ts), not with
 * the library's getProfileAll, whose reads have neither; one that fails
 * is left out.
 */
export declare const getProfileStorages: ProfileStorages;
declare const MEDIA_TYPES: {
  readonly turtle: "text/turtle";
  readonly jsonld: "application/ld+json";
};
/**
 * The quads of a Turtle or JSON-LD text, its relative IRIs resolved
 * against `baseUrl`, parsed as a pod's documents are: in every graph the
 * text names. Rejects with the parser's error on a text that does not
 * parse, as a Turtle text with a triple term does not (turtleParser) nor
 * JSON-LD with RDF-star, and with a ReadLimitError at the first quad past `limits`
 * (quadTally; the text's own size is its caller's to check: it holds the
 * text already), or on a Turtle text at its first base, prefix, IRI or
 * level of nesting past what a read takes in, with limits or with none (writeTurtle); the
 * parser reads no further. A quad that names an IRI the library keeps
 * for subjects not saved yet is left out (LOCAL_NODE). JSON-LD is read
 * with no fetch at all: a context named by its address is refused
 * (parseJsonLd).
 */
export declare function parseQuads(
  text: string,
  format: keyof typeof MEDIA_TYPES,
  baseUrl: string,
  limits?: ReadLimits,
): Promise<Quad[]>;
/** The URL of the document a dataset was read from or saved to; null for one built here. */
export declare function getSourceUrl(dataset: SourcedDataset): string;
export declare function getSourceUrl(dataset: Dataset): string | null;
/** Whether a dataset knows the document it was read from or saved to. */
export declare function hasResourceInfo<T extends Dataset>(
  dataset: T,
): dataset is T & SourcedDataset;
/** The URLs of the resources a container, read as a dataset, says it contains. */
export declare function getContainedResourceUrlAll(container: SourcedDataset): string[];
/**
 * A dataset as Turtle text, written by turtleOf, as a PUT sends it:
 * every IRI in full, with no prefix, a subject made by name and not
 * saved yet as `<#name>`, of the document it goes to. With `prefixes`,
 * the IRIs they stand for are written with them, as a deck file is
 * written for people to read. A term Turtle cannot write as it is is
 * refused (writableTerms.ts).
 */
export declare function solidDatasetAsTurtle(
  dataset: Dataset,
  options?: {
    prefixes?: Readonly<Record<string, string>>;
  },
): string;
