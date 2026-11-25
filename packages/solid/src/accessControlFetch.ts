// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ReadLimits } from "@solid-memo/solid-client/interface";
import { ACCESS_CONTROL_LIMITS, limitedFetch } from "@solid-memo/solid-client/readLimits";
import { parseDeckFile } from "./solidDeckArchive";

/**
 * The fetch that makes the document at `target` public (a release, or a
 * public type index the app made; docs/boundaries.md "Access control"),
 * kept to what that may touch, whatever the servers' answers name
 * (`rel="acl"`, a redirect): a request to another origin than the
 * document's is refused, and so is any but a read (GET, HEAD) of another
 * resource than the document's own access control, beside it
 * (`<document>.acl`, its ACL; or `<document>.acr`, its ACR), which every
 * Solid server tested names. A write is not followed to another address
 * (`redirect: "error"`, as the user's fetch already asks of every
 * request, authFetch.ts), and a read answered from another origin is
 * refused. Each check is of the request itself, so an answer that names
 * one access control first and another after leads to no other write.
 * A release's server may be anyone's, and the grant's library parses
 * what it reads with no limits, so every answer is read under limits:
 * its body on its bytes, and the body of a read that succeeds is parsed
 * first under them, on its triples, their characters, its base and
 * prefix declarations and how deep it nests, then handed on as it was. A
 * read of the document itself, or of a folder above it, which a grant
 * may make when its server answers no HEAD, is held to `documentLimits`
 * (RELEASE_LIMITS for a release, as any release is); every other read,
 * of an access control, to ACCESS_CONTROL_LIMITS, far smaller, and to
 * MAX_ACCESS_CONTROL_SUBJECTS subjects, as the library's work on it
 * grows with the square of their number. The library takes a failed
 * read of the document's access control for one not written yet, and
 * writes another from its folder's, so once a request throws (refused
 * here, past a limit, or not answered), every one after is refused, and
 * the grant fails. An answer that is not ok, such as a 404, is handed
 * on, and locks nothing.
 */
export function accessControlFetch(
  fetch: typeof globalThis.fetch,
  target: string,
  documentLimits: ReadLimits,
): typeof globalThis.fetch {
  const { origin } = new URL(target);
  const own = new Set([`${target}.acl`, `${target}.acr`]);
  const accessControl = limitedFetch(fetch, ACCESS_CONTROL_LIMITS);
  const documentRead = limitedFetch(fetch, documentLimits);
  /** Whether `href` is the document or a folder above it, not an access control. */
  const isDocument = (href: string) =>
    href === target || (href.endsWith("/") && target.startsWith(href));
  let failed = false;
  return async (input, init) => {
    // The grant asks by URL (client/access.ts): a Request, whose text is no URL, is refused.
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const read = method === "GET" || method === "HEAD";
    if (failed || url.origin !== origin || (!read && !own.has(url.href)))
      throw new TypeError(`Not the document's to change: ${method} ${url.href}`);
    try {
      const ofDocument = read && isDocument(url.href);
      const [limited, limits] = ofDocument
        ? [documentRead, documentLimits]
        : [accessControl, ACCESS_CONTROL_LIMITS];
      const response = await limited(input, read ? init : { ...init, redirect: "error" });
      if (response.url !== "" && new URL(response.url).origin !== origin)
        throw new TypeError(`Answered from another origin: ${response.url}`);
      if (method !== "GET" || !response.ok) return response;
      const text = await response.text();
      await parseDeckFile(text, "turtle", response.url || url.href, limits);
      const checked = new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      Object.defineProperty(checked, "url", { value: response.url });
      return checked;
    } catch (error) {
      failed = true;
      throw error;
    }
  };
}
