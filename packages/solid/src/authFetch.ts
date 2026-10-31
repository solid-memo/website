// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { isInFolder } from "@solid-memo/domain/instanceLayout";
import type { SessionClient } from "./client/session";

/** Window event dispatched once the user's session expired (createAuthFetch says when). */
export const SESSION_EXPIRED_EVENT = "solid-memo:session-expired";

/** A challenge (WWW-Authenticate) that says the access token sent is no longer good. */
const INVALID_TOKEN = /\berror\s*=\s*"?invalid_token\b/i;

/** Methods that only read; every other one writes. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The statuses that send a request on to another address. */
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** A fetch as someone with no login: no cookie, no credentials of any kind. */
export const anonymousFetch: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input, { ...init, credentials: "omit" });

/**
 * The client's fetch, which always uses the CURRENT session (a bound
 * reference captured at wiring time would predate login), and `forget`,
 * which a logout calls.
 *
 * It announces an expired session (SESSION_EXPIRED_EVENT) on a 401 in
 * two cases alone: the sign-in client, which had a user, has none now
 * (its token expired, or the provider refused to refresh it), or a 401
 * that names the token invalid (`invalid_token`) comes from one of the
 * user's own storages (`ownStorages`) or their identity provider. A 401
 * from any other server, such as an attached instance elsewhere that
 * does not take the user's login, is the caller's to read as refused
 * access: it says nothing of the session.
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
export function createAuthFetch(
  client: SessionClient,
  {
    ownStorages = async () => [],
  }: {
    /** The user's own storages, by their WebID: where a token refused as invalid means the session expired. */
    ownStorages?: (webId: string) => Promise<readonly string[]>;
  } = {},
): { fetch: typeof globalThis.fetch; forget: () => void } {
  /** The user the client last had, until the session ends or is logged out of. */
  let user: string | undefined;

  /** Whether a 401 from `url` says the session expired. */
  async function expired(url: string, response: Response): Promise<boolean> {
    if (user === undefined) return false;
    const current = client.webId();
    if (current === undefined) {
      user = undefined;
      return true;
    }
    if (!INVALID_TOKEN.test(response.headers.get("WWW-Authenticate") ?? "")) return false;
    const issuer = await client.sessionIssuer().catch(() => null);
    const provider = issuer === null ? undefined : URL.parse(issuer)?.origin;
    if (provider !== undefined && URL.parse(url)?.origin === provider) return true;
    const storages = await ownStorages(current).catch(() => []);
    return storages.some((storage) => isInFolder(url, storage));
  }

  const fetch: typeof globalThis.fetch = async (input, init) => {
    user = client.webId() ?? user;
    const request = input instanceof Request ? input : undefined;
    const url = request?.url ?? String(input);
    let response: Response;
    try {
      response = await client.fetch(input, { ...init, redirect: "error" });
    } catch (error) {
      if ((init?.signal ?? request?.signal)?.aborted || !(await redirects(url))) throw error;
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (!READS.has(method)) throw new AppError("redirectRefused", { method, url });
      const answer = await anonymousFetch(input, init);
      if (!answer.redirected) throw error;
      return answer;
    }
    if (response.status === 401 && (await expired(url, response))) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return response;
  };
  return {
    fetch,
    forget() {
      user = undefined;
    },
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
