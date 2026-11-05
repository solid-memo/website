// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { universalAccess } from "@inrupt/solid-client";
import type { GrantPublicRead } from "./interface";
import { TURTLE_FIRST, withBoundedHeaders } from "./linkHeader";

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
 *
 * An ACR then says it governs the document (`acp:resource`), which the
 * library leaves as it finds it: the Community Solid Server applies no
 * ACR that doesn't, so its policies would change nothing. Saying so of
 * one that does already changes nothing.
 */
export const grantPublicRead: GrantPublicRead = async (url, { fetch }) => {
  let acr: string | undefined;
  const access = await universalAccess.setPublicAccess(
    url,
    { read: true },
    {
      fetch: accessFetch(fetch, (found) => {
        acr = found;
      }),
    },
  );
  if (access?.read !== true) return false;
  if (acr === undefined) return true;
  const said = await fetch(acr, {
    method: "PATCH",
    headers: { "Content-Type": "application/sparql-update" },
    body: `INSERT DATA { <${acr}> <${ACP_RESOURCE}> <${url}> . }`,
  });
  return said.ok;
};

const ACP = "http://www.w3.org/ns/solid/acp#";
const ACCESS_CONTROL_RESOURCE = `${ACP}AccessControlResource`;
const ACP_RESOURCE = `${ACP}resource`;

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
 * - a read that names no media type asks for Turtle: a Linked Web
 *   Storage server that is a storage's root too answers it otherwise
 *   with the storage's description, which links no ACL;
 * - for the Community Solid Server, an Access Control Resource not
 *   written yet, which it answers 404 (its Link saying what it is), is
 *   read as one that says only that it is one, which the write then
 *   makes. The library would otherwise take the server for one without
 *   ACP, and change nothing.
 *
 * Every response it gives has the headers that describe a resource
 * bounded (linkHeader.ts), as the library reads them. `onAcr` is told the
 * address of each read that answers as an Access Control Resource.
 */
export function accessFetch(
  fetch: typeof globalThis.fetch,
  onAcr: (url: string) => void = () => {},
): typeof globalThis.fetch {
  return async (input, init) => {
    if (init?.method === "PATCH") {
      // The library sends a PATCH's body as text.
      return withBoundedHeaders(
        await fetch(input, {
          ...init,
          body: (init.body as string).replace(/(>|(?<!\\)")\.(?=\s|\})/g, "$1 ."),
        }),
      );
    }
    const method = init?.method ?? "GET";
    const read = method === "GET" || method === "HEAD";
    // A read that asks for nothing asks for Turtle, as the app reads a folder: a Linked Web Storage server answers a storage's root otherwise, without the link to its ACL (docs/lws.md).
    const asked =
      read && !new Headers(init?.headers).has("Accept")
        ? {
            ...init,
            headers: { ...Object.fromEntries(new Headers(init?.headers)), accept: TURTLE_FIRST },
          }
        : init;
    const response = withBoundedHeaders(await fetch(input, asked));
    const link = response.headers.get("Link") ?? "";
    const isAcr = link.includes(`<${ACCESS_CONTROL_RESOURCE}>`);
    if (read && isAcr) onAcr(String(input));
    if (!read || response.status !== 404 || !isAcr) return response;
    const body = method === "HEAD" ? null : `<> a <${ACCESS_CONTROL_RESOURCE}> .`;
    const empty = new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/turtle", Link: link },
    });
    Object.defineProperty(empty, "url", { value: response.url });
    return empty;
  };
}
