import type { ResourceStore, StoredResource } from "@solid-memo/application/ports";
import { triplesOf } from "./ntriples";

const LDP = "http://www.w3.org/ns/ldp#";
const PIM_STORAGE = "http://www.w3.org/ns/pim/space#Storage";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

export interface LocalPodDeps {
  /** The pod's root container, ending in "/": it serves nothing outside it. */
  root: string;
  store: ResourceStore;
  /** A new, never used ETag (a quoted string). */
  newEtag: () => string;
}

/**
 * A Solid pod kept on this device, as a fetch (docs/guest-mode.md): the
 * guest's pod, which the app's Solid adapters read and write as they do
 * any server's. It speaks the part of the Solid Protocol they use:
 *
 * - GET and HEAD of documents, files and containers (an `ldp:contains`
 *   listing), with ETags and 304 for `If-None-Match` naming the current one;
 * - PUT of Turtle or any other file, creating missing containers above it,
 *   and of a container (a URL ending in "/");
 * - PATCH with a SPARQL Update of `INSERT DATA` and `DELETE DATA` blocks,
 *   which also creates a missing document;
 * - DELETE of a document or an empty container;
 * - `If-Match` and `If-None-Match: *` on every write (412 when not met),
 *   and a container's ETag changes when what it contains does;
 * - the root is a `pim:Storage` (Link header). There is no access control:
 *   no `rel="acl"` link is given.
 *
 * Every request runs exclusively on the store, so a check and the write
 * it guards are never interleaved with another tab's.
 */
export function createLocalPod({ root, store, newEtag }: LocalPodDeps): typeof globalThis.fetch {
  return async (input, init) => {
    const url = withoutFragment(String(input instanceof Request ? input.url : input));
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    if (!url.startsWith(root)) return answer(url, 404);
    return store.exclusive(() => handle({ url, method, headers, body: init?.body ?? null }));
  };

  async function handle(request: { url: string; method: string; headers: Headers; body: BodyInit | null }) {
    const { url, method, headers } = request;
    const current = await store.get(url);
    if (method === "GET" || method === "HEAD") {
      if (current === undefined) return answer(url, 404);
      if (headers.get("If-None-Match") === current.etag) return answer(url, 304, null, { ETag: current.etag });
      const { body, contentType } = await representationOf(url, current);
      return answer(url, 200, method === "HEAD" ? null : body, {
        "Content-Type": contentType,
        ETag: current.etag,
        Link: linksOf(url, current),
      });
    }
    if (method !== "PUT" && method !== "PATCH" && method !== "DELETE") return answer(url, 405);
    const ifMatch = headers.get("If-Match");
    if (ifMatch !== null && ifMatch !== current?.etag) return answer(url, 412);
    if (headers.get("If-None-Match") === "*" && current !== undefined) return answer(url, 412);

    if (method === "DELETE") {
      if (current === undefined) return answer(url, 404);
      if (url === root) return answer(url, 405);
      if (current.kind === "container" && (await childrenOf(url)).length > 0) return answer(url, 409);
      await store.delete(url);
      await touch(parentOf(url)!);
      return answer(url, 205);
    }

    if (url.endsWith("/")) {
      if (method !== "PUT" || current !== undefined) return answer(url, 409);
      await create(url, { kind: "container", etag: newEtag() });
      return answer(url, 201);
    }

    const contentType = headers.get("Content-Type") ?? "";
    const text = typeof request.body === "string" ? request.body : null;
    let next: StoredResource;
    if (method === "PATCH") {
      if (!contentType.startsWith("application/sparql-update") || text === null) return answer(url, 415);
      if (current !== undefined && current.kind !== "rdf") return answer(url, 409);
      const triples = await patched(url, current?.triples ?? [], text);
      if (triples === null) return answer(url, 400);
      next = { kind: "rdf", etag: newEtag(), triples };
    } else if (contentType.startsWith("text/turtle")) {
      const triples = await parsed(url, text ?? "");
      if (triples === null) return answer(url, 400);
      next = { kind: "rdf", etag: newEtag(), triples: [...triples] };
    } else {
      next = { kind: "file", etag: newEtag(), contentType, bytes: await bytesOf(request.body) };
    }
    if (current === undefined) {
      await create(url, next);
      return answer(url, 201);
    }
    await store.set(url, next);
    return answer(url, 205);
  }

  /** Store a new resource, and any container missing above it; their containers change. */
  async function create(url: string, resource: StoredResource): Promise<void> {
    const parent = parentOf(url);
    if (parent !== null) {
      if ((await store.get(parent)) === undefined) await create(parent, { kind: "container", etag: newEtag() });
      else await touch(parent);
    }
    await store.set(url, resource);
  }

  /** What a container (which is there: it contains something) contains changed: it gets a new ETag. */
  async function touch(container: string): Promise<void> {
    await store.set(container, { ...(await store.get(container))!, etag: newEtag() });
  }

  async function childrenOf(container: string): Promise<string[]> {
    return (await store.urls()).filter((candidate) => parentOf(candidate) === container).sort();
  }

  async function representationOf(url: string, resource: StoredResource): Promise<{ body: BodyInit; contentType: string }> {
    if (resource.kind === "file") return { body: resource.bytes as Uint8Array<ArrayBuffer>, contentType: resource.contentType };
    if (resource.kind === "rdf") return { body: resource.triples.join("\n"), contentType: "text/turtle" };
    const lines = [
      `<${url}> <${RDF_TYPE}> <${LDP}Container> .`,
      `<${url}> <${RDF_TYPE}> <${LDP}BasicContainer> .`,
      ...(await childrenOf(url)).map((child) => `<${url}> <${LDP}contains> <${child}> .`),
    ];
    return { body: lines.join("\n"), contentType: "text/turtle" };
  }

  function linksOf(url: string, resource: StoredResource): string {
    const types = [`${LDP}Resource`];
    if (resource.kind === "container") types.push(`${LDP}Container`, `${LDP}BasicContainer`);
    if (url === root) types.push(PIM_STORAGE);
    return types.map((type) => `<${type}>; rel="type"`).join(", ");
  }
}

/** The triples of a Turtle document; null when it does not parse. */
async function parsed(url: string, turtle: string): Promise<Set<string> | null> {
  try {
    return await triplesOf(url, turtle);
  } catch {
    return null;
  }
}

/** The document's triples with the update applied, block by block; null when it is not one this pod applies. */
async function patched(url: string, triples: readonly string[], update: string): Promise<string[] | null> {
  const blocks = dataBlocks(update);
  if (blocks === null) return null;
  const result = new Set(triples);
  for (const { operation, data } of blocks) {
    const changed = await parsed(url, data);
    if (changed === null) return null;
    for (const triple of changed) {
      if (operation === "INSERT") result.add(triple);
      else result.delete(triple);
    }
  }
  return [...result];
}

/**
 * The `INSERT DATA { … }` and `DELETE DATA { … }` blocks of a SPARQL
 * Update, in order, each with its triples as written; null for any other
 * update. Braces inside IRIs, strings and comments do not end a block.
 */
export function dataBlocks(update: string): { operation: "INSERT" | "DELETE"; data: string }[] | null {
  const blocks: { operation: "INSERT" | "DELETE"; data: string }[] = [];
  let at = 0;
  for (;;) {
    while (at < update.length && /[\s;]/.test(update[at]!)) at++;
    if (at === update.length) return blocks;
    const opening = /^(INSERT|DELETE)\s+DATA\s*\{/i.exec(update.slice(at));
    if (opening === null) return null;
    at += opening[0].length;
    const start = at;
    let quote: string | null = null;
    for (; at < update.length; at++) {
      const c = update[at]!;
      if (quote !== null) {
        if (c === "\\") at++;
        else if (update.startsWith(quote, at)) {
          at += quote.length - 1;
          quote = null;
        }
      } else if (c === "<") {
        at = update.indexOf(">", at);
        if (at === -1) return null;
      } else if (c === '"' || c === "'") {
        quote = update.startsWith(c.repeat(3), at) ? c.repeat(3) : c;
        at += quote.length - 1;
      } else if (c === "#") {
        const end = update.indexOf("\n", at);
        at = end === -1 ? update.length : end;
      } else if (c === "}") break;
    }
    if (at >= update.length) return null;
    blocks.push({ operation: opening[1]!.toUpperCase() as "INSERT" | "DELETE", data: update.slice(start, at) });
    at++;
  }
}

/** The container a resource is in; null for the root of its origin. */
export function parentOf(url: string): string | null {
  const path = new URL(url).pathname;
  if (path === "/") return null;
  const trimmed = url.endsWith("/") ? url.slice(0, -1) : url;
  return trimmed.slice(0, trimmed.lastIndexOf("/") + 1);
}

function withoutFragment(url: string): string {
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}

async function bytesOf(body: BodyInit | null): Promise<Uint8Array> {
  return new Uint8Array(await new Response(body).arrayBuffer());
}

function answer(url: string, status: number, body: BodyInit | null = null, headers: Record<string, string> = {}): Response {
  const response = new Response(status === 304 || status === 204 || status === 205 ? null : body, { status, headers });
  Object.defineProperty(response, "url", { value: url });
  return response;
}
