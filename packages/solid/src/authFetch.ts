// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import type { SessionClient } from "./client/session";

/** Window event dispatched when the pod answers 401 (expired session). */
export const SESSION_EXPIRED_EVENT = "solid-memo:session-expired";

/** Methods that only read; every other one writes. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The statuses that send a request on to another address. */
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** A fetch as someone with no login: no cookie, no credentials of any kind. */
export const anonymousFetch: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input, { ...init, credentials: "omit" });

/**
 * The client's fetch, which always uses the CURRENT session (a bound
 * reference captured at wiring time would predate login). Announces
 * expired sessions via a window event.
 *
 * It follows no redirect (`redirect: "error"`), whatever the caller
 * asks: the fences in front of it (docs/boundaries.md) check the address
 * asked for, so neither the browser nor the sign-in client, which asks
 * again with fresh credentials where a redirected request ends 401 or
 * 403, may take the user's credentials to another. When a request
 * fails, and wasn't aborted, a HEAD as no one asks whether the address
 * redirects; if it does, a read is asked again as no one, the redirect
 * followed (a public profile behind one, say), and its answer kept only
 * when it did follow one; a write is refused (`redirectRefused`). Any
 * other failure is passed on. The HEAD asks as no one, so a server that
 * sends only visitors with no login elsewhere (to a login page, say)
 * shows a failed write there as a refused redirect.
 */
export function createAuthFetch(client: SessionClient): typeof globalThis.fetch {
  return async (input, init) => {
    let response: Response;
    try {
      response = await client.fetch(input, { ...init, redirect: "error" });
    } catch (error) {
      const request = input instanceof Request ? input : undefined;
      const url = request?.url ?? String(input);
      if ((init?.signal ?? request?.signal)?.aborted || !(await redirects(url))) throw error;
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (!READS.has(method)) throw new AppError("redirectRefused", { method, url });
      const answer = await anonymousFetch(input, init);
      if (!answer.redirected) throw error;
      return answer;
    }
    if (response.status === 401) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return response;
  };
}

/**
 * Whether `url` answers with a redirect, asked as no one and not
 * followed: a browser shows such an answer as an opaque one, other
 * runtimes by its status. False when it can't be asked.
 */
async function redirects(url: string): Promise<boolean> {
  try {
    const answer = await anonymousFetch(url, { method: "HEAD", redirect: "manual" });
    return answer.type === "opaqueredirect" || REDIRECTS.has(answer.status);
  } catch {
    return false;
  }
}
