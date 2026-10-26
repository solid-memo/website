// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { universalAccess } from "@inrupt/solid-client";
import type { GrantPublicRead } from "./interface";

export type { GrantPublicRead } from "./interface";

/**
 * The public-read grant (GrantPublicRead, interface.ts) over
 * @inrupt/solid-client's universal access (`setPublicAccess`, read
 * only), the only implementation so far; another implementation passes
 * the same contract (src/testing/contract/access.ts). It writes the
 * document's own ACL on a server with Web Access Control and its ACR on
 * one with Access Control Policies, for that document alone.
 * Its requests go through accessFetch, which makes them as the servers
 * tested take them. It asks by URL, never with a Request, so a fence
 * around `fetch` (solidReleasePublisher.ts) can read where each goes.
 */
export const grantPublicRead: GrantPublicRead = async (url, { fetch }) => {
  const access = await universalAccess.setPublicAccess(
    url,
    { read: true },
    { fetch: accessFetch(fetch) },
  );
  return access?.read === true;
};

const ACCESS_CONTROL_RESOURCE = "http://www.w3.org/ns/solid/acp#AccessControlResource";

/**
 * The fetch the library's access write is made with, so that it is made
 * as the Solid servers tested take it:
 *
 * - for node-solid-server, a space is put before each "." that ends a
 *   statement in a PATCH body, right after an IRI or a string. The
 *   library writes an ACL's PATCH with that "." touching the term before
 *   it (`<…#Agent>.}`), which node-solid-server's parser takes for a
 *   path and refuses (400), as it does every PATCH of the library's
 *   (sparqlUpdate.ts); an ACL holds no other kind of term;
 * - for the Community Solid Server, an Access Control Resource not
 *   written yet, which it answers 404 (its Link saying what it is), is
 *   read as one that says only that it is one, which the write then
 *   makes. The library would otherwise take the server for one without
 *   ACP, and change nothing.
 */
export function accessFetch(fetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    if (init?.method === "PATCH") {
      // The library sends a PATCH's body as text.
      return fetch(input, {
        ...init,
        body: (init.body as string).replace(/(>|(?<!\\)")\.(?=\s|\})/g, "$1 ."),
      });
    }
    const response = await fetch(input, init);
    const link = response.headers.get("Link") ?? "";
    const method = init?.method ?? "GET";
    if (
      (method !== "GET" && method !== "HEAD") ||
      response.status !== 404 ||
      !link.includes(`<${ACCESS_CONTROL_RESOURCE}>`)
    )
      return response;
    const body = method === "HEAD" ? null : `<> a <${ACCESS_CONTROL_RESOURCE}> .`;
    const empty = new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/turtle", Link: link },
    });
    Object.defineProperty(empty, "url", { value: response.url });
    return empty;
  };
}
