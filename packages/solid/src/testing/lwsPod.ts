// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A Linked Web Storage server, in memory, that takes only what LWS
 * Protocol 1.0 asks of a server (docs/lws.md), for the tests of the
 * bridge (lwsBridge.ts): a container is listed only as
 * `application/lws+json` (Turtle refused with 406, or given in the LWS
 * profile), page by page; a resource is made only by a POST to its
 * container, which names it from the `Slug` it is given (or, when told
 * so, by a name of its own); PUT replaces a resource that is there and
 * answers 404 for one that is not; PATCH is refused (415), as this one
 * takes no JSON Patch; every answer to a GET or HEAD links the storage.
 */
export interface LwsPodOptions {
  /** The storage's URI, its root container's too: a URL ending in a slash. */
  root: string;
  /** The most items on a page of a listing. */
  pageSize?: number;
  /** Turtle in the LWS profile for a container's Turtle, not 406. */
  profileTurtle?: boolean;
  /** Names a resource made by POST itself, the Slug left aside. */
  ownNames?: boolean;
}

export interface LwsPod {
  fetch: typeof globalThis.fetch;
  /** The documents, by URL, and the containers (their URL ends in a slash, their body ""). */
  resources: Map<string, { body: string; type: string; etag: string }>;
  /** Every request, as "METHOD url". */
  requests: string[];
}

const STORAGE_REL = "https://www.w3.org/ns/lws#storage";

export function lwsPod({
  root,
  pageSize = 1000,
  profileTurtle = false,
  ownNames = false,
}: LwsPodOptions): LwsPod {
  const resources = new Map<string, { body: string; type: string; etag: string }>();
  const requests: string[] = [];
  let version = 0;
  let named = 0;
  const etag = () => `"${++version}"`;
  /** A container's ETag changes with its members, as a listing's does. */
  const touch = (container: string) => {
    const there = resources.get(container);
    if (there !== undefined) resources.set(container, { ...there, etag: etag() });
  };
  resources.set(root, { body: "", type: "", etag: etag() });

  const parentOf = (url: string) => {
    const trimmed = url.endsWith("/") ? url.slice(0, -1) : url;
    return trimmed.slice(0, trimmed.lastIndexOf("/") + 1);
  };
  const members = (container: string) =>
    [...resources.keys()].filter((url) => url !== container && parentOf(url) === container).sort();
  const answer = (
    status: number,
    body: string | null,
    headers: Record<string, string>,
    url: string,
  ) => {
    const response = new Response(status === 204 || status === 304 ? null : body, {
      status,
      headers: { Link: `<${root}>; rel="${STORAGE_REL}"`, ...headers },
    });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };

  /** What a request names: the resource (without a page's query), the address asked, its headers and body. */
  interface Asked {
    url: string;
    href: string;
    method: string;
    headers: Headers;
    body: string;
  }

  /** A container's listing, as LWS has it: a page of its members, linked to the next. */
  const listing = ({ url, href, method }: Asked, etagOf: string) => {
    const all = members(url);
    const page = Number(new URL(href).searchParams.get("page") ?? "0");
    const items = all.slice(page * pageSize, (page + 1) * pageSize).map((id) => {
      const member = resources.get(id)!;
      return id.endsWith("/")
        ? { id, type: "Container" }
        : { id, type: "DataResource", format: member.type, size: member.body.length };
    });
    const links = [`<${root}>; rel="${STORAGE_REL}"`];
    if (all.length > pageSize) links.push(`<${url}?page=0>; rel="first"`);
    if ((page + 1) * pageSize < all.length) links.push(`<${url}?page=${page + 1}>; rel="next"`);
    const body = JSON.stringify({
      "@context": "https://www.w3.org/ns/lws/v1",
      id: url,
      type: "Container",
      totalItems: all.length,
      items,
    });
    return answer(
      200,
      method === "HEAD" ? null : body,
      { "Content-Type": "application/lws+json", ETag: etagOf, Link: links.join(", ") },
      href,
    );
  };

  const read = (asked: Asked) => {
    const { url, href, method, headers } = asked;
    const resource = resources.get(url);
    if (resource === undefined) return answer(404, null, {}, href);
    if (headers.get("If-None-Match") === resource.etag)
      return answer(304, null, { ETag: resource.etag }, href);
    const body = method === "HEAD" ? null : resource.body;
    if (!url.endsWith("/"))
      return answer(200, body, { "Content-Type": resource.type, ETag: resource.etag }, href);
    const accept = headers.get("Accept") ?? "*/*";
    if (accept.includes("application/lws+json") || accept.includes("*/*"))
      return listing(asked, resource.etag);
    if (!profileTurtle) return answer(406, null, {}, href);
    const profiled = method === "HEAD" ? null : `<> a <https://www.w3.org/ns/lws#Container>.`;
    return answer(
      200,
      profiled,
      {
        "Content-Type": 'text/turtle; profile="https://www.w3.org/ns/lws/v1"',
        ETag: resource.etag,
      },
      href,
    );
  };

  const replace = ({ url, href, headers, body }: Asked) => {
    const resource = resources.get(url);
    if (resource === undefined) return answer(404, null, {}, href);
    const ifMatch = headers.get("If-Match");
    if (headers.get("If-None-Match") === "*" || (ifMatch !== null && ifMatch !== resource.etag))
      return answer(412, null, {}, href);
    resources.set(url, { body, type: headers.get("Content-Type") ?? "", etag: etag() });
    return answer(204, null, { ETag: resources.get(url)!.etag }, href);
  };

  const create = ({ url, href, headers, body }: Asked) => {
    if (!resources.has(url) || !url.endsWith("/")) return answer(404, null, {}, href);
    const container = (headers.get("Link") ?? "").includes("https://www.w3.org/ns/lws#Container");
    const slug = headers.get("Slug");
    const name =
      ownNames || slug === null ? `r${++named}` : encodeURIComponent(decodeURIComponent(slug));
    const end = container ? "/" : "";
    const made = resources.has(`${url}${name}${end}`)
      ? `${url}${name}-${++named}${end}`
      : `${url}${name}${end}`;
    resources.set(made, {
      body: container ? "" : body,
      type: container ? "" : (headers.get("Content-Type") ?? ""),
      etag: etag(),
    });
    touch(url);
    return answer(201, null, { Location: made, ETag: resources.get(made)!.etag }, href);
  };

  const remove = ({ url, href }: Asked) => {
    if (!resources.has(url)) return answer(404, null, {}, href);
    if (url.endsWith("/") && members(url).length > 0) return answer(409, null, {}, href);
    resources.delete(url);
    touch(parentOf(url));
    return answer(204, null, {}, href);
  };

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const href = String(input);
    const method = init?.method ?? "GET";
    requests.push(`${method} ${href}`);
    const asked: Asked = {
      url: href.split("?")[0]!,
      href,
      method,
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
    };
    if (method === "GET" || method === "HEAD") return read(asked);
    if (method === "PUT") return replace(asked);
    if (method === "POST") return create(asked);
    if (method === "DELETE") return remove(asked);
    return answer(method === "PATCH" ? 415 : 405, null, {}, href);
  };
  return { fetch, resources, requests };
}
