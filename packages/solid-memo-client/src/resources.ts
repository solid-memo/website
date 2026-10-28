// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad } from "@rdfjs/types";
import { JsonLdParser } from "jsonld-streaming-parser";
import { DataFactory, Parser, Store, Writer } from "n3";
import {
  type Changes,
  type Dataset,
  type DocumentRead,
  type DocumentWrite,
  type FetchedDataset,
  HttpError,
  ReadLimitError,
  type ReadLimits,
  type RequestOptions,
  type SourcedDataset,
} from "@solid-memo/solid/client/interface";
import { limitsOf, quadTally, refusalOf } from "@solid-memo/solid/client/readLimits";
import { MAX_PATCH_BYTES, patchBody } from "@solid-memo/solid/client/sparqlUpdate";
import { refuseUnwritable } from "@solid-memo/solid/writableTerms";
import {
  allQuads,
  clientDataset,
  datasetOf,
  localName,
  NO_CHANGES,
  partsOf,
  type Resource,
  subjectOf,
  type Value,
} from "./dataset";
import {
  changesOf,
  getThing,
  getThingAll,
  getUrlAll,
  localNameOf,
  sourceOf,
  toRdfJsDataset,
} from "./rdf";

/**
 * Reading and writing a pod's resources (client/resources.ts) without a
 * Solid client library: plain `fetch` requests, Turtle parsed and written
 * by n3, JSON-LD parsed by jsonld-streaming-parser. It exports what
 * client/resources.ts exports, and makes the same requests (their
 * methods, Accept and Content-Type headers, preconditions and URLs), so
 * that it passes the same contract (src/testing/contract/resources.ts,
 * run by resources.test.ts) and the same servers take them.
 *
 * A request the server answers with a failure rejects with an HttpError
 * whose message says what was asked, of which URL, and how the server
 * answered: its status, its status text and its body.
 */

const { namedNode, quad: makeQuad } = DataFactory;

const LDP = "http://www.w3.org/ns/ldp#";
const PIM_STORAGE = "http://www.w3.org/ns/pim/space#storage";
const FOAF = "http://xmlns.com/foaf/0.1/";
const RDFS_SEE_ALSO = "http://www.w3.org/2000/01/rdf-schema#seeAlso";
const TURTLE = "text/turtle";

/** The prefixes solidDatasetAsTurtle writes when it is given none: those @inrupt/solid-client writes. */
const PREFIXES: Record<string, string> = {
  acl: "http://www.w3.org/ns/auth/acl#",
  acp: "http://www.w3.org/ns/solid/acp#",
  cc: "http://creativecommons.org/ns#",
  cert: "http://www.w3.org/ns/auth/cert#",
  csvw: "http://www.w3.org/ns/csvw#",
  current: "#",
  dc: "http://purl.org/dc/terms/",
  dcam: "http://purl.org/dc/dcam/",
  dcat: "http://www.w3.org/ns/dcat#",
  dctype: "http://purl.org/dc/dcmitype/",
  foaf: FOAF,
  ldp: LDP,
  owl: "http://www.w3.org/2002/07/owl#",
  posixstat: "http://www.w3.org/ns/posix/stat#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  schema: "https://schema.org/",
  shacl: "http://www.w3.org/ns/shacl#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  skosxl: "http://www.w3.org/2008/05/skos-xl#",
  solid: "http://www.w3.org/ns/solid/terms#",
  swapdoc: "http://www.w3.org/2000/10/swap/pim/doc#",
  ui: "http://www.w3.org/ns/ui#",
  vann: "http://purl.org/vocab/vann/",
  vcard: "http://www.w3.org/2006/vcard/ns#",
  ws: "http://www.w3.org/ns/pim/space#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

// Requests.

/** The fetch to send a request with: the one given, or the browser's own. */
function fetcher(options?: RequestOptions): typeof globalThis.fetch {
  return options?.fetch ?? globalThis.fetch;
}

/** A URL with any run of slashes in its path made one; with `trailingSlash`, its path made to end in one or not. */
function normalizeUrl(url: string, trailingSlash?: boolean): string {
  const normalized = new URL(url);
  normalized.pathname = normalized.pathname.replace(/\/\/+/g, "/");
  if (trailingSlash === false && normalized.pathname.endsWith("/")) {
    normalized.pathname = normalized.pathname.slice(0, -1);
  }
  if (trailingSlash === true && !normalized.pathname.endsWith("/")) {
    normalized.pathname = `${normalized.pathname}/`;
  }
  return normalized.href;
}

/** The response, when it is a success; an HttpError saying what failed and how otherwise. */
async function succeeded(response: Response, what: string): Promise<Response> {
  if (response.ok) return response;
  const body = await response
    .clone()
    .text()
    .catch(() => "");
  throw new HttpError(
    `${what} failed: [${response.status}] [${response.statusText}] ${body}.`,
    response,
  );
}

/** The headers of a request, with `If-Match` when a version is given. */
function headersWith(headers: Record<string, string>, ifMatch?: string): Headers {
  const all = new Headers(headers);
  if (ifMatch !== undefined) all.set("If-Match", ifMatch);
  return all;
}

// Reading documents.

/**
 * What a response says of the document it is of: its URL and its type.
 * The URL is the response's, none when it names none: datasets.ts keeps
 * nothing of a write answered from no address.
 */
function resourceOf(response: Response): Resource {
  return Object.freeze({
    url: response.url,
    contentType: response.headers.get("Content-Type") ?? undefined,
  });
}

/**
 * A collector of a text's quads, parsed as the document at `url` under
 * `limits`: `add` keeps each, until one past them (quadTally), which
 * drops what was kept and rejects once, with a ReadLimitError; the
 * parser may go on to the end of the text, but nothing more is kept.
 */
function collector(url: string, limits: ReadLimits | undefined, reject: (error: Error) => void) {
  const quads: Quad[] = [];
  const past = quadTally(limits);
  let refused = false;
  return {
    quads,
    add(quad: Quad): void {
      if (refused) return;
      if (!past(quad)) return void quads.push(quad);
      refused = true;
      quads.length = 0;
      // The tally is past limits only under some.
      reject(new ReadLimitError(url, limits!));
    },
  };
}

/** The quads of a Turtle text, its relative IRIs resolved against `baseIRI`, under `limits` (collector). */
function parseTurtle(text: string, baseIRI: string, limits?: ReadLimits): Promise<Quad[]> {
  return new Promise((resolve, reject) => {
    const { quads, add } = collector(baseIRI, limits, reject);
    new Parser({ format: TURTLE, baseIRI }).parse(text, (error, quad) => {
      if (error) reject(error);
      else if (quad) add(quad);
      else resolve(quads);
    });
  });
}

/**
 * The quads of a JSON-LD text, its relative IRIs resolved against
 * `baseIRI`, in every graph it names, under `limits` (collector). A
 * context it names by URL is not fetched: such a text fails to parse.
 * The text is read as it streams, so a node's `@context` is to come
 * before its other keys, or the text fails to parse: otherwise the
 * parser holds every node to the end, then matches each against every
 * typed one, time growing with their square.
 */
function parseJsonLd(text: string, baseIRI: string, limits?: ReadLimits): Promise<Quad[]> {
  return new Promise((resolve, reject) => {
    const parser = new JsonLdParser({
      baseIRI,
      streamingProfile: true,
      // refuseRemoteContexts refuses a type's own context; a plain one may come after the id.
      streamingProfileAllowOutOfOrderPlainType: true,
      documentLoader: {
        load: async (url: string) => {
          throw new Error(`The JSON-LD context at [${url}] is not fetched.`);
        },
      },
    });
    const { quads, add } = collector(baseIRI, limits, reject);
    parser.on("data", add);
    parser.on("error", reject);
    parser.on("end", () => resolve(quads));
    parser.write(text);
    parser.end();
  });
}

/**
 * The quads of a document's response: a Turtle document's, parsed with
 * its URL as the base, under the limits it is read under (readLimits.ts).
 * Rejects (with no HttpError) on a response of another type, or one
 * whose text does not parse, and with a ReadLimitError on one past its
 * limits.
 */
async function quadsOfResponse(response: Response, resource: Resource): Promise<Quad[]> {
  const { url, contentType } = resource;
  if (contentType === undefined) {
    throw new Error(`Could not determine the content type of the Resource at [${url}].`);
  }
  const mediaType = contentType.split(";")[0];
  if (mediaType !== TURTLE) {
    throw new Error(
      `The Resource at [${url}] has a MIME type of [${mediaType}], but the only parsers available are for the following MIME types: [${TURTLE}].`,
    );
  }
  const limits = limitsOf(response);
  const text = await response.text().catch((error: unknown) => {
    // A body past its limit fails as the browser fails a read; why is kept apart.
    throw refusalOf(response) ?? error;
  });
  try {
    return await parseTurtle(text, url, limits);
  } catch (error) {
    if (error instanceof ReadLimitError) throw error;
    throw new Error(
      `Encountered an error parsing the Resource at [${url}] with content type [${contentType}]: ${error}`,
      { cause: error },
    );
  }
}

/** A dataset of a document's quads, as read from `resource`, with no changes. */
function readDataset(quads: Iterable<Quad>, resource: Resource): FetchedDataset {
  return datasetOf({ ...partsOf(quads), resource, log: undefined }) as unknown as FetchedDataset;
}

/** The document at `url`, as asked with `init`: the response and the dataset of it. */
async function read(
  url: string,
  fetch: typeof globalThis.fetch,
  init: RequestInit = {},
): Promise<{ response: Response; quads: Quad[]; resource: Resource }> {
  const target = normalizeUrl(url);
  const headers = new Headers(init.headers);
  headers.set("Accept", TURTLE);
  const response = await succeeded(
    await fetch(target, { ...init, headers }),
    `Fetching the Resource at [${target}]`,
  );
  const resource = resourceOf(response);
  return { response, quads: await quadsOfResponse(response, resource), resource };
}

/**
 * The document at `url`, as a dataset: its subjects in the order an RDF/JS
 * store (n3's) gives its quads, as the library reads them.
 */
export async function getSolidDataset(
  url: string,
  options?: RequestOptions,
): Promise<FetchedDataset> {
  const { quads, resource } = await read(url, fetcher(options));
  return readDataset(new Store(quads), resource);
}

/** The document at `url`, as getSolidDataset reads it, its subjects in the order the text names them. */
export async function getSolidDatasetLinear(
  url: string,
  options: { fetch: typeof globalThis.fetch },
): Promise<FetchedDataset> {
  const { quads, resource } = await read(url, options.fetch);
  return readDataset(quads, resource);
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
  let notModified = false;
  try {
    const { response, quads, resource } = await read(url, async (input, init) => {
      const headers = new Headers(init?.headers);
      if (ifNoneMatch !== undefined) headers.set("If-None-Match", ifNoneMatch);
      // A browser would answer a plain read from its own cache, which a pod that gives a modification time
      // and no Cache-Control lets it keep for days; what is kept is the caller's to keep (datasets.ts).
      const answer = await fetch(input, { ...init, headers, cache: "no-store" });
      notModified = answer.status === 304 && ifNoneMatch !== undefined;
      return answer;
    });
    return {
      dataset: readDataset(quads, resource),
      etag: response.headers.get("ETag") ?? undefined,
    };
  } catch (error) {
    if (notModified) return { notModified: true };
    throw error;
  }
}

// Writing documents.

/** A quad as written to a document: a subject made by name and not saved yet as `<#name>`, no graph. */
function writtenQuad(quad: Quad): Quad {
  const relative = (term: Quad["subject"] | Quad["object"]) => {
    const name = term.termType === "NamedNode" ? localName(term.value) : undefined;
    return name === undefined ? term : namedNode(`#${name}`);
  };
  return makeQuad(
    relative(quad.subject) as Quad["subject"],
    quad.predicate,
    relative(quad.object) as Quad["object"],
  );
}

/** Quads as Turtle text, with `prefixes`. */
function turtleOf(quads: Iterable<Quad>, prefixes?: Record<string, string>): Promise<string> {
  const writer = new Writer({ format: TURTLE, prefixes });
  for (const quad of quads) writer.addQuad(quad);
  // Writing to text, n3 ends with no error.
  return new Promise((resolve) => {
    writer.end((_error, result: string) => resolve(result));
  });
}

/** The URL of a document, without the fragment of any IRI in it. */
function documentOf(url: string): string {
  const document = new URL(url);
  document.hash = "";
  return document.href;
}

/** The dataset as saved at `resource`: no changes, every subject made by name resolved against it. */
function savedDataset(dataset: Dataset, resource: Resource): FetchedDataset {
  const { subjects, named } = clientDataset(dataset);
  const resolved = (iri: string) => {
    const name = localName(iri);
    return name === undefined ? iri : `${resource.url}#${name}`;
  };
  const saved = new Map<string, ReturnType<typeof subjectOf>>();
  for (const [iri, subject] of subjects) {
    const values: Record<string, readonly Value[]> = Object.create(null);
    for (const [predicate, list] of Object.entries(subject.values)) {
      values[predicate] = list.some((one) => one.termType === "NamedNode" && localName(one.value))
        ? Object.freeze(
            list.map((one) =>
              one.termType === "NamedNode" ? namedNode(resolved(one.value)) : one,
            ),
          )
        : list;
    }
    saved.set(resolved(iri), subjectOf(resolved(iri), Object.freeze(values)));
  }
  return datasetOf({
    subjects: saved,
    named,
    resource,
    log: NO_CHANGES,
  }) as unknown as FetchedDataset;
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
 *   cuts short when a PATCH holds characters beyond ASCII;
 * - a new dataset is a PUT that only creates (If-None-Match: *).
 *
 * A term Turtle cannot write as it is (writableTerms.ts) refuses the
 * write before anything is sent. With `ifMatch`, the write is made only
 * if the document is still at that version: a 412 otherwise, as HttpError.
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
  const target = normalizeUrl(url);
  const source = sourceOf(dataset);
  const isEdit = source !== undefined && documentOf(source.url) === documentOf(target);
  const response = await succeeded(
    isEdit
      ? await sendEdit(target, dataset, fetch, ifMatch, whole)
      : await sendWhole(target, dataset, fetch, {
          headers: {
            "Content-Type": TURTLE,
            "If-None-Match": "*",
            Link: `<${LDP}Resource>; rel="type"`,
          },
          ifMatch,
        }),
    `Storing the Resource at [${target}]`,
  );
  return {
    dataset: savedDataset(dataset, resourceOf(response)),
    etag: response.headers.get("ETag") ?? undefined,
  };
}

/** Send the dataset as one PUT of its every triple, the subjects made by name relative to the document. */
async function sendWhole(
  url: string,
  dataset: Dataset,
  fetch: typeof globalThis.fetch,
  { headers, ifMatch }: { headers: Record<string, string>; ifMatch: string | undefined },
): Promise<Response> {
  const quads = allQuads(clientDataset(dataset));
  refuseUnwritable(quads);
  return fetch(url, {
    method: "PUT",
    headers: headersWith(headers, ifMatch),
    body: await turtleOf(quads.map(writtenQuad)),
  });
}

/**
 * Send an edit of the document read: one PATCH of its changes (patchBody),
 * once more with its deleted decimals spelled as numbers after a conflict
 * (409); or one PUT of the whole document when that body is too large, or
 * the edit is asked to be whole.
 */
async function sendEdit(
  url: string,
  dataset: Dataset,
  fetch: typeof globalThis.fetch,
  ifMatch: string | undefined,
  whole: boolean,
): Promise<Response> {
  const logged = changesOf(dataset);
  const changes = logged ?? { additions: [], deletions: [] };
  const body = await editBody(logged, changes);
  if (whole || new TextEncoder().encode(body).length > MAX_PATCH_BYTES) {
    return sendWhole(url, dataset, fetch, { headers: { "Content-Type": TURTLE }, ifMatch });
  }
  refuseUnwritable([...changes.additions, ...changes.deletions]);
  const patch = (text: string) =>
    fetch(url, {
      method: "PATCH",
      headers: headersWith({ "Content-Type": "application/sparql-update" }, ifMatch),
      body: text,
    });
  const response = await patch(body);
  // node-solid-server finds no decimal deleted as it served it (`1.0`, `2.50`), only as it reads it (`1`,
  // `2.5`), and applies nothing (409): sent once more, decimals so spelled. A deletion of a triple that is
  // gone fails again, as it should; one found the second time names the same number.
  if (response.status !== 409) return response;
  const respelled = patchBody(logged, localNameOf, true);
  return respelled === null || respelled === body ? response : patch(respelled);
}

/** The PATCH body of an edit: patchBody's, or turtleUpdate's where patchBody cannot write it. */
async function editBody(logged: Changes | undefined, changes: Changes): Promise<string> {
  return patchBody(logged, localNameOf) ?? turtleUpdate(changes);
}

/**
 * The SPARQL Update of changes patchBody cannot write (a blank node in
 * one, or no change log), in Turtle as the library writes it: an empty
 * update for no change.
 */
async function turtleUpdate(changes: Changes): Promise<string> {
  const block = async (operation: string, quads: readonly Quad[]) =>
    quads.length === 0 ? "" : `${operation} {${(await turtleOf(quads.map(writtenQuad))).trim()}};`;
  return `${await block("DELETE DATA", changes.deletions)} ${await block("INSERT DATA", changes.additions)}`;
}

/** Delete the document at `url`; with `ifMatch`, only if it is still at that version (a 412 otherwise). */
export async function deleteSolidDataset(
  url: string,
  { fetch, ifMatch }: { fetch: typeof globalThis.fetch; ifMatch?: string },
): Promise<void> {
  const target = normalizeUrl(url);
  await succeeded(
    await fetch(target, { method: "DELETE", headers: headersWith({}, ifMatch) }),
    `Deleting the SolidDataset at [${target}]`,
  );
}

// Containers and files.

/** Create a container at `url`, and those above it a server makes with it. */
export async function createContainerAt(url: string, options: RequestOptions): Promise<void> {
  const target = normalizeUrl(url, true);
  await succeeded(
    await fetcher(options)(target, {
      method: "PUT",
      headers: {
        Accept: TURTLE,
        "Content-Type": TURTLE,
        "If-None-Match": "*",
        Link: `<${LDP}BasicContainer>; rel="type"`,
      },
    }),
    `Creating the empty Container at [${url}]`,
  );
}

/** Delete the container at `url`, which servers do only when it is empty. */
export async function deleteContainer(url: string, options: RequestOptions): Promise<void> {
  const target = normalizeUrl(url);
  if (!target.endsWith("/")) {
    throw new Error(
      `You're trying to delete the Container at [${target}], but Container URLs should end in a \`/\`. Are you sure this is a Container?`,
    );
  }
  await succeeded(
    await fetcher(options)(target, { method: "DELETE" }),
    `Deleting the Container at [${target}]`,
  );
}

/** The file at `url`, as it is. */
export async function getFile(url: string, options: RequestOptions): Promise<Blob> {
  const target = normalizeUrl(url, false);
  const response = await succeeded(
    await fetcher(options)(target),
    `Fetching the File at [${target}]`,
  );
  return response.blob();
}

/** Write a file to `url`, as `contentType`, in place of any there. */
export async function overwriteFile(
  url: string,
  file: Blob,
  options: RequestOptions & { contentType: string },
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": options.contentType };
  // A File names itself to the server, as the library has it do.
  if ("name" in file && typeof file.name === "string") headers.Slug = file.name;
  await succeeded(
    await fetcher(options)(url, { method: "PUT", headers, body: file }),
    `Overwriting the file at [${url}]`,
  );
}

/** Delete the file at `url`. */
export async function deleteFile(url: string, options: RequestOptions): Promise<void> {
  const target = normalizeUrl(url, false);
  await succeeded(
    await fetcher(options)(target, { method: "DELETE" }),
    `Deleting the file at [${target}]`,
  );
}

// Profiles.

/**
 * The storages the profile of `webId` names (pim:storage): in its WebID
 * document, as already read (`webIdProfile`), and in the documents that
 * names as more of the profile, each read through `fetch`.
 */
export type ProfileStorages = (
  webId: string,
  options: RequestOptions & { webIdProfile: FetchedDataset },
) => Promise<string[]>;

/**
 * The documents a WebID document names as more of the profile: those its
 * subjects are the primary topic of, and those the WebID's subject points
 * to (rdfs:seeAlso, foaf:isPrimaryTopicOf), the WebID document itself left out.
 */
function moreProfilesOf(webId: string, webIdProfile: FetchedDataset): string[] {
  const me = getThing(webIdProfile, webId);
  const own = getSourceUrl(webIdProfile);
  const urls = [
    ...getThingAll(webIdProfile)
      .filter((thing) => getUrlAll(thing, `${FOAF}primaryTopic`).length > 0)
      .map((thing) => thing.url),
    ...(me === null ? [] : getUrlAll(me, RDFS_SEE_ALSO)),
    ...(me === null ? [] : getUrlAll(me, `${FOAF}isPrimaryTopicOf`)),
  ];
  return [...new Set(urls.filter((url) => url !== own))];
}

/** The profile lookup: the WebID document and those it names that can be read, each asked of the WebID's storages. */
export const getProfileStorages: ProfileStorages = async (webId, { fetch, webIdProfile }) => {
  const more = await Promise.allSettled(
    moreProfilesOf(webId, webIdProfile).map((url) => getSolidDataset(url, { fetch })),
  );
  const profiles = [
    webIdProfile,
    ...more.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
  ];
  const storages = new Set<string>();
  for (const profile of profiles) {
    const me = getThing(profile, webId);
    if (me !== null) for (const storage of getUrlAll(me, PIM_STORAGE)) storages.add(storage);
  }
  return [...storages];
};

// Text.

const MEDIA_TYPES = { turtle: TURTLE, jsonld: "application/ld+json" } as const;

/**
 * The quads of a Turtle or JSON-LD text, its relative IRIs resolved
 * against `baseUrl`, parsed as a pod's documents are: in every graph the
 * text names. Rejects with the parser's error on a text that does not
 * parse, and with a ReadLimitError at the first quad past `limits`.
 */
export async function parseQuads(
  text: string,
  format: keyof typeof MEDIA_TYPES,
  baseUrl: string,
  limits?: ReadLimits,
): Promise<Quad[]> {
  return format === "turtle"
    ? parseTurtle(text, baseUrl, limits)
    : parseJsonLd(text, baseUrl, limits);
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

/** Whether `url` is a resource directly in the container at `container`. */
function isChildOf(url: string, container: string): boolean {
  const parent = new URL(container);
  const child = new URL(url);
  const path = child.pathname.slice(parent.pathname.length).replace(/(^\/)|(\/$)/g, "");
  return child.href.startsWith(parent.href) && path.length >= 1 && !path.includes("/");
}

/** The URLs of the resources a container, read as a dataset, says it contains. */
export function getContainedResourceUrlAll(container: SourcedDataset): string[] {
  const url = getSourceUrl(container);
  const thing = getThing(container, url);
  if (thing === null) return [];
  return getUrlAll(thing, `${LDP}contains`).filter((child) => isChildOf(child, url));
}

/** A dataset as Turtle text, with `prefixes` for the IRIs it names. */
export function solidDatasetAsTurtle(
  dataset: Dataset,
  options?: { prefixes?: Record<string, string> },
): Promise<string> {
  return turtleOf(toRdfJsDataset(dataset), options?.prefixes ?? PREFIXES);
}
