// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The bound on the headers that describe a resource, `Link` and
 * `WAC-Allow`, before any parser reads them. @inrupt/solid-client reads
 * a `Link` header with http-link-header, and the alternative client
 * (solid-memo-client) with a pattern of its own: either takes time in
 * the square of the length of some headers. A header comes in before a
 * body, so the read limits (readLimits.ts) never see it. A Solid
 * server's headers describe a resource in a few hundred characters; one
 * past the bound is dropped, as if the server had sent none, and the
 * response is read as one that says nothing of its links or access. It
 * imports no library.
 */
export const MAX_DESCRIBING_HEADER_LENGTH = 8 * 1024;

const DESCRIBING_HEADERS = ["Link", "WAC-Allow"];

/** The response's header `name`, or null when it has none or one past the bound. */
export function boundedHeader(response: Response, name: string): string | null {
  const value = response.headers.get(name);
  return value !== null && value.length > MAX_DESCRIBING_HEADER_LENGTH ? null : value;
}

/**
 * The response, without a `Link` or `WAC-Allow` header past the bound;
 * the same response when it has none. A response made here keeps the
 * status, headers, body and URL, but not `redirected` or `type`, which
 * no caller reads.
 */
export function withBoundedHeaders(response: Response): Response {
  const over = DESCRIBING_HEADERS.filter(
    (name) => boundedHeader(response, name) !== response.headers.get(name),
  );
  if (over.length === 0) return response;
  const headers = new Headers(response.headers);
  for (const name of over) headers.delete(name);
  const bounded = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  // A response made here has no URL of its own; the library names the resource by it.
  Object.defineProperty(bounded, "url", { value: response.url });
  return bounded;
}

/** The fetch, its responses given as withBoundedHeaders gives them. */
export function boundedHeadersFetch(fetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => withBoundedHeaders(await fetch(input, init));
}
