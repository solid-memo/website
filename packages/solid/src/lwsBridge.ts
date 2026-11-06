// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { isInFolder, isSameUrl } from "@solid-memo/domain/instanceLayout";
import type { ReadLimits } from "./client/interface";
import { linkTargets, TURTLE_FIRST } from "./client/linkHeader";
import { limitedFetch } from "./client/readLimits";
import { dataBlocks, parentOf, patched } from "./localPod";
import { LWS_STORAGE_REL } from "./lwsStorage";
import { triplesOf } from "./ntriples";

/**
 * The bridge between the Solid Protocol requests the app makes and a
 * Linked Web Storage (LWS) server that takes only what LWS asks of it
 * (docs/lws.md). Three requests of the app have no LWS equivalent; each
 * is first sent as it is, and only when the server refuses it, and
 * says it is an LWS server, made as LWS has it:
 *
 * - a container's listing in Turtle (`ldp:contains`): LWS lists a
 *   container as `application/lws+json`, page by page; the pages are
 *   read and given as the Turtle listing the app reads;
 * - a document or container made with PUT and `If-None-Match: *`: LWS
 *   makes a resource with a POST to its container, which names it, and
 *   each container above it first; the name asked for is sent as a
 *   hint (`Slug`), and a resource the server names otherwise is deleted
 *   and the creation refused (CREATION_REFUSED);
 * - a SPARQL Update PATCH (`INSERT DATA`, `DELETE DATA`): LWS requires
 *   only JSON Patch; the document is read, changed here, and written
 *   whole with `If-Match`, its ETag as read when the PATCH had none,
 *   tried again when another write came first; a document not there
 *   yet is made as above.
 *
 * Every other request, and every request to a Solid server, is sent as
 * it is. It sits below the fences (podFence.ts, ownPodGate.ts), which
 * check each request as the app makes it; what it sends besides is to
 * the same resource, the containers above it, or the pages the server
 * links. It imports no library.
 */
export function lwsBridge(fetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    // The app asks by URL; a Request is sent as it is.
    if (typeof input !== "string" && !(input instanceof URL)) return fetch(input, init);
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    if (method === "GET" && url.endsWith("/")) return listing(fetch, url, init);
    if (method === "PUT" && headers.get("If-None-Match") === "*")
      return creation(fetch, url, init!);
    if (method === "PATCH" && mediaTypeOf(headers.get("Content-Type")) === SPARQL_UPDATE)
      return update(fetch, url, init!);
    return fetch(input, init);
  };
}

/** The status of a creation the server refused to make by the name asked for: it names its resources itself. */
export const CREATION_REFUSED = 501;

/** The status of a creation the server made by another name, which the bridge could not delete again: never tried again. */
const CREATION_LEFT = 502;

const LWS_JSON = "application/lws+json";
const LWS_PROFILE = "https://www.w3.org/ns/lws/v1";
const LWS_CONTAINER = "https://www.w3.org/ns/lws#Container";
const LDP = "http://www.w3.org/ns/ldp#";
const SPARQL_UPDATE = "application/sparql-update";
/** What a server answers a request whose method or media type it does not take. */
const NOT_TAKEN = new Set([405, 415, 501]);
/** The most pages of a listing, and items, read: a listing past them is refused, as a container past the tree budget is (containers.ts). */
const MAX_PAGES = 200;
const MAX_ITEMS = 20_000;
/** Each page of a listing is read under these limits. */
const PAGE_LIMITS: ReadLimits = { bytes: 4 * 1024 * 1024, quads: 0, characters: 4 * 1024 * 1024 };
/** The most containers above a resource made, or asked whether the server is an LWS one. */
const MAX_DEPTH = 32;
/** The most times a PATCH without `If-Match` is tried again after another write came first. */
const MAX_TRIES = 5;

/** A media type without its parameters, in lower case; "" for none. */
function mediaTypeOf(contentType: string | null): string {
  return (contentType ?? "").split(";")[0]!.trim().toLowerCase();
}

/** Whether a Content-Type names `profile` in its `profile` parameter, a space-separated list, quoted or not. */
function hasProfile(contentType: string | null, profile: string): boolean {
  const parameter = /;\s*profile\s*=\s*(?:"([^"]*)"|([^\s;]+))/i.exec(contentType ?? "");
  const profiles = parameter?.[1] ?? parameter?.[2] ?? "";
  return profiles.split(/\s+/).some((named) => named === profile);
}

/** A response for `url`, as a server's answer is: its URL set. */
function named(response: Response, url: string): Response {
  Object.defineProperty(response, "url", { value: url });
  return response;
}

/**
 * Whether the server of `url` is an LWS server: the first of `url` and
 * the containers above it that is there links its storage
 * (lwsStorage.ts), as every answer of an LWS server to a GET or HEAD
 * does.
 */
async function isLws(
  fetch: typeof globalThis.fetch,
  url: string,
  signal: AbortSignal | null | undefined,
): Promise<boolean> {
  let at: string | null = url;
  for (let depth = 0; at !== null && depth < MAX_DEPTH; depth++) {
    const response = await fetch(at, {
      method: "HEAD",
      headers: { Accept: TURTLE_FIRST },
      signal,
    });
    if (response.status !== 404) return linkTargets(response, LWS_STORAGE_REL, at).length > 0;
    at = parentOf(at);
  }
  return false;
}

// The listing.

async function listing(
  fetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit | undefined,
): Promise<Response> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("Content-Type");
  if (response.ok && mediaTypeOf(contentType) === LWS_JSON)
    return listingOf(fetch, url, init, response);
  // An LWS server that gives Turtle in the LWS profile (lws:items, no ldp:contains), or none, is asked for its own listing.
  const lwsProfile = response.ok && hasProfile(contentType, LWS_PROFILE);
  if (response.status !== 406 && !lwsProfile) return response;
  if (!(await isLws(fetch, url, init?.signal))) return response;
  await response.body?.cancel();
  const asked = await fetch(url, { ...init, headers: withAccept(init, LWS_JSON) });
  if (!asked.ok || mediaTypeOf(asked.headers.get("Content-Type")) !== LWS_JSON) return asked;
  return listingOf(fetch, url, init, asked);
}

function withAccept(init: RequestInit | undefined, accept: string): Headers {
  const headers = new Headers(init?.headers);
  headers.set("Accept", accept);
  return headers;
}

/**
 * The listing of the container at `url` whose first page is `first`
 * (`application/lws+json`), every page read, as the Turtle the app
 * reads: the container, typed as one, and `ldp:contains` each resource
 * in it. The first page's status and headers (its ETag, its links)
 * are kept. A page that is not a container's listing, or past the
 * limits, fails the read.
 */
async function listingOf(
  fetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit | undefined,
  first: Response,
): Promise<Response> {
  const pageFetch = limitedFetch(fetch, PAGE_LIMITS);
  const items = new Set<string>();
  const seen = new Set<string>();
  let page = await limitedFetch(async () => first, PAGE_LIMITS)(url);
  let at = first.url || url;
  for (let pages = 1; ; pages++) {
    const body: unknown = JSON.parse(await page.text());
    const listed = (body as { items?: unknown } | null)?.items;
    if (!Array.isArray(listed)) throw new Error(`${at} is not the listing of a container.`);
    for (const item of listed) {
      const id = (item as { id?: unknown } | null)?.id;
      if (typeof id !== "string") continue;
      const member = new URL(id, at).href;
      if (isInFolder(member, url) && !isSameUrl(member, url)) items.add(member);
    }
    if (items.size > MAX_ITEMS) throw new Error(`${url} lists more than ${MAX_ITEMS} resources.`);
    seen.add(at);
    const [next] = linkTargets(page, "next", at);
    if (next === undefined) break;
    if (new URL(next).origin !== new URL(url).origin || seen.has(next) || pages === MAX_PAGES)
      throw new Error(`${url}'s listing goes on past what the app reads.`);
    page = await pageFetch(next, { headers: { Accept: LWS_JSON }, signal: init?.signal });
    if (!page.ok) throw new Error(`${next} answered ${page.status}.`);
    at = next;
  }
  const contains = [...items].map((member) => `<${iriOf(member)}>`).join(", ");
  const turtle = `<${url}> a <${LDP}Container>, <${LDP}BasicContainer>${
    contains === "" ? "" : `;\n  <${LDP}contains> ${contains}`
  } .\n`;
  const headers = new Headers(first.headers);
  headers.set("Content-Type", "text/turtle");
  headers.delete("Content-Length");
  return named(new Response(turtle, { status: first.status, headers }), first.url || url);
}

/** An address as a Turtle IRI: the characters an IRI may not hold, which a URL's path keeps (`|`, `^`), percent-encoded. */
function iriOf(url: string): string {
  return url.replace(
    /[\u0000-\u0020<>"{}|^`\\]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

// Creation.

async function creation(
  fetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status !== 404 && !NOT_TAKEN.has(response.status)) return response;
  const parent = parentOf(url);
  if (parent === null || !(await isLws(fetch, parent, init.signal))) return response;
  return post(fetch, url, init);
}

/**
 * The resource at `url` made as LWS makes one: each container above it
 * that is not there made first, then a POST to its container, its name
 * asked for. The answer is the POST's, its URL `url`; CREATION_REFUSED
 * when the server named it otherwise (and it is deleted again).
 */
async function post(
  fetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  depth = 0,
): Promise<Response> {
  const parent = parentOf(url)!;
  const above = await containerThere(fetch, parent, init, depth);
  if (above !== null) return above;
  const container = url.endsWith("/");
  const headers = new Headers(init.headers);
  // A creation's conditions mean nothing to a POST, and a type it links is the server's to set (LWS: server-managed).
  headers.delete("If-None-Match");
  headers.delete("If-Match");
  headers.delete("Link");
  // The name as the address spells it, its escapes kept: a header's value is bytes (RFC 5023 has the server undo them).
  headers.set(
    "Slug",
    new URL(url).pathname
      .split("/")
      .filter((segment) => segment !== "")
      .at(-1)!,
  );
  if (container) {
    // A container: made with no body, its type linked, as LWS asks of the client.
    headers.delete("Content-Type");
    headers.set("Link", `<${LWS_CONTAINER}>; rel="type"`);
  }
  const posted = await fetch(parent, {
    method: "POST",
    headers,
    body: container ? undefined : init.body,
    redirect: init.redirect,
    signal: init.signal,
  });
  if (!posted.ok) return posted;
  const location = posted.headers.get("Location");
  const made = location === null ? null : new URL(location, parent).href;
  if (made !== null && isSameUrl(made, url)) return named(posted, url);
  // Only a resource the POST made in the container is deleted again: another address the answer names is no one's to delete here.
  const madeHere =
    made !== null && new URL(made).origin === new URL(parent).origin && parentOf(made) === parent;
  const deleted = madeHere && (await fetch(made, { method: "DELETE", signal: init.signal })).ok;
  return named(
    deleted
      ? new Response(null, {
          status: CREATION_REFUSED,
          statusText: "The server names its resources itself",
        })
      : new Response(null, {
          status: CREATION_LEFT,
          statusText: "The server made the resource where it would not say, or could not delete it",
        }),
    url,
  );
}

/** Null when the container at `url` is there, or once it is made (post); else the answer that says why it is not. */
async function containerThere(
  fetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  depth: number,
): Promise<Response | null> {
  const response = await fetch(url, {
    method: "HEAD",
    headers: { Accept: TURTLE_FIRST },
    signal: init.signal,
  });
  if (response.ok) return null;
  if (response.status !== 404 || depth >= MAX_DEPTH || parentOf(url) === null) return response;
  const made = await post(
    fetch,
    url,
    { method: "PUT", signal: init.signal, redirect: init.redirect },
    depth + 1,
  );
  return made.ok ? null : made;
}

// The update.

async function update(
  fetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const refused = await fetch(url, init);
  if (refused.ok || (refused.status !== 404 && !NOT_TAKEN.has(refused.status))) return refused;
  if (!(await isLws(fetch, url, init.signal))) return refused;
  const edit: Edit = {
    url,
    init,
    sparql: String(init.body),
    condition: new Headers(init.headers).get("If-Match"),
    refused,
  };
  let last: Try = { answer: refused, again: false };
  for (let tries = 0; tries < MAX_TRIES && (tries === 0 || last.again); tries++)
    last = await updateOnce(fetch, edit);
  return last.answer;
}

/** A SPARQL Update the server refused: the document, the request, the update, its If-Match, and the refusal. */
interface Edit {
  url: string;
  init: RequestInit;
  sparql: string;
  condition: string | null;
  refused: Response;
}

/** The answer to one try of an update, and whether to try again: another write came first to an update with no If-Match. */
interface Try {
  answer: Response;
  again: boolean;
}

const conflict = (url: string) => named(new Response(null, { status: 409 }), url);

/** The edit made once: the document read, changed here, and written whole with If-Match. */
async function updateOnce(fetch: typeof globalThis.fetch, edit: Edit): Promise<Try> {
  const { url, init, sparql, condition } = edit;
  const current = await fetch(url, {
    headers: { Accept: "text/turtle" },
    cache: "no-store",
    signal: init.signal,
  });
  if (current.status === 404) return madeBy(fetch, edit);
  if (!current.ok) return { answer: current, again: false };
  // A weak ETag never matches If-Match (RFC 9110): a document with none strong has no version to write against.
  const etag = current.headers.get("ETag");
  // An edit of the document as read, which has changed since: another write came first, as the PUT would say.
  if (condition !== null && etag !== null && etag !== condition)
    return { answer: named(new Response(null, { status: 412 }), url), again: false };
  const version = condition ?? (etag === null || etag.startsWith("W/") ? null : etag);
  const read = new Set(await triplesOf(url, await current.text()));
  const triples = await patched(url, [...read], sparql);
  // An update the app does not make, or a document with no version to write it against, is not written.
  if (triples === null || version === null) return { answer: edit.refused, again: false };
  // A triple to delete that is not there fails the update, as a Solid server's PATCH does (409).
  if ([...(await deletionsOf(url, sparql))].some((triple) => !read.has(triple)))
    return { answer: conflict(url), again: false };
  const written = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle", "If-Match": version },
    body: `${triples.join("\n")}\n`,
    redirect: init.redirect,
    signal: init.signal,
  });
  return { answer: written, again: written.status === 412 && condition === null };
}

/** The edit of a document not there yet: the document made with what it inserts, unless it was an edit of one as read. */
async function madeBy(fetch: typeof globalThis.fetch, edit: Edit): Promise<Try> {
  const { url, init, sparql } = edit;
  // An edit of a document as read finds none: another write came first.
  if (edit.condition !== null)
    return { answer: named(new Response(null, { status: 412 }), url), again: false };
  const triples = await patched(url, [], sparql);
  if (triples === null) return { answer: edit.refused, again: false };
  if ((await deletionsOf(url, sparql)).size > 0) return { answer: conflict(url), again: false };
  const made = await post(fetch, url, {
    ...init,
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: `${triples.join("\n")}\n`,
  });
  // Another tab made it first, by the same name: its document is changed instead.
  return { answer: made, again: made.status === CREATION_REFUSED };
}

/** The triples an update's `DELETE DATA` blocks name, as N-Triples; an update `patched` applies only. */
async function deletionsOf(url: string, sparql: string): Promise<Set<string>> {
  const deletions = new Set<string>();
  for (const { operation, data } of dataBlocks(sparql)!)
    if (operation === "DELETE")
      for (const triple of await triplesOf(url, data)) deletions.add(triple);
  return deletions;
}
