// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import * as oauth from "oauth4webapi";
import { isLoopbackHttp, isRefusal, refreshTokens, type Tokens } from "./oidcLogin";
import { clearSession, loadSession, replaceSession, type StoredSession } from "./oidcStore";

/**
 * A logged-in session in this tab: its tokens, the access token in
 * memory only, and the fetch that sends them, DPoP-bound, refreshing the
 * access token as it is about to expire. The tab has one current
 * session, as the app has one user (currentSession).
 */

/** How long before it expires an access token is refreshed, in ms. */
const REFRESH_MARGIN = 30_000;

/** The last write of the stored session in this tab, when the browser has no Web Locks. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `work` as the only refresh or login's save of the stored session
 * in this browser. So two tabs do not both spend the same refresh token
 * (providers rotate it, and one used twice may end the session), and a
 * refresh under way cannot write back a session that a newer login has
 * since replaced. A logout does not wait for it: a refresh stores its
 * tokens only while the session it read is still stored
 * (replaceSession). Web Locks, where the browser has them; this tab
 * alone otherwise.
 */
export function exclusively<T>(work: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (locks) return locks.request("solid-memo:oidc-session", work);
  const turn = queue.then(work, work);
  queue = turn.catch(() => {});
  return turn;
}

/**
 * Refreshes the stored session's tokens with its refresh token, read
 * afresh in case another tab rotated it, and stores the one the
 * provider gives back, unless a logout cleared the session while the
 * provider answered. "gone" when no session of `webId`'s at `as` is
 * stored any more: a logout, here or in another tab, or a login as
 * someone else or at another provider, in another tab. A session from
 * another provider is left as it is, and its tokens and client are
 * never sent to `as`. Undefined when the session has no refresh token,
 * or the provider refuses it, which ends the stored session.
 */
export async function refreshStored(
  as: oauth.AuthorizationServer,
  webId: string,
): Promise<{ stored: StoredSession; tokens: Tokens } | "gone" | undefined> {
  return exclusively(async () => {
    const stored = await loadSession();
    if (stored === undefined || stored.webId !== webId || stored.issuer !== as.issuer) {
      return "gone";
    }
    if (stored.refreshToken === undefined) return undefined;
    let tokens: Tokens;
    try {
      tokens = await refreshTokens(
        as,
        stored.client,
        stored.refreshToken,
        oauth.DPoP(stored.client, stored.keys),
      );
    } catch (error) {
      if (!isRefusal(error)) throw error;
      await clearSession();
      return undefined;
    }
    const refreshed = { ...stored, refreshToken: tokens.refreshToken ?? stored.refreshToken };
    // Logged out while the provider answered: the tokens are not kept.
    if (!(await replaceSession(stored, refreshed))) return "gone";
    return { stored: refreshed, tokens };
  });
}

/** Whether a request can be sent again: a body the first try did not use up. */
function replayable(input: RequestInfo | URL, init: RequestInit | undefined): boolean {
  return !(input instanceof Request) && !(init?.body instanceof ReadableStream);
}

/** The headers oauth4webapi builds that the session adds to a request: not its user-agent. */
const PROOF_HEADERS = new Set(["authorization", "dpop"]);

/**
 * The request as the caller made it, with the session's Authorization
 * and DPoP headers added from what oauth4webapi built.
 */
function withProof(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  built: Record<string, string>,
): RequestInit {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
  const proof = Object.entries(built).filter(([name]) => PROOF_HEADERS.has(name));
  for (const [name, value] of proof) headers.set(name, value);
  return { ...init, headers };
}

export class OidcSession {
  readonly webId: string;
  readonly #as: oauth.AuthorizationServer;
  #dpop: oauth.DPoPHandle;
  readonly #refreshable: boolean;
  #tokens: Tokens;
  #refreshing: Promise<void> | undefined;

  constructor(
    as: oauth.AuthorizationServer,
    stored: Pick<StoredSession, "client" | "keys" | "webId" | "refreshToken">,
    tokens: Tokens,
  ) {
    this.webId = stored.webId;
    this.#refreshable = stored.refreshToken !== undefined;
    this.#as = as;
    this.#dpop = oauth.DPoP(stored.client, stored.keys);
    this.#tokens = tokens;
  }

  /**
   * Fetches as the session's user: Authorization: DPoP with the access
   * token and a proof for this request (its method, and its URL without
   * query or fragment). A resource server's 401 comes back as it is,
   * once more after a DPoP nonce it asked for.
   */
  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const accessToken = await this.#accessToken();
    if (accessToken === undefined || (url.protocol !== "https:" && !isLoopbackHttp(url))) {
      // No token to send, or none to send in the clear.
      return globalThis.fetch(input, init);
    }
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const send = async (again: boolean): Promise<Response> => {
      try {
        return await oauth.protectedResourceRequest(accessToken, method, url, undefined, null, {
          DPoP: this.#dpop,
          [oauth.allowInsecureRequests]: url.protocol === "http:",
          // oauth4webapi builds the proof; the request itself is the caller's.
          [oauth.customFetch]: (_, built) =>
            globalThis.fetch(input, withProof(input, init, built.headers)),
        });
      } catch (error) {
        if (!(error instanceof oauth.WWWAuthenticateChallengeError)) throw error;
        if (again && oauth.isDPoPNonceError(error) && replayable(input, init)) return send(false);
        return error.response;
      }
    };
    return send(true);
  };

  /** The access token, refreshed first when it is about to expire; none once the provider refused to. */
  async #accessToken(): Promise<string | undefined> {
    if (Date.now() >= this.#tokens.expiresAt - REFRESH_MARGIN) {
      this.#refreshing ??= this.#refresh().finally(() => {
        this.#refreshing = undefined;
      });
      await this.#refreshing;
    }
    return currentSession() === this ? this.#tokens.accessToken : undefined;
  }

  /**
   * Swaps in fresh tokens, and the key pair they are bound to: the stored
   * session's, which a login in another tab may have replaced. Without a
   * refresh token the expired one goes on, and the pod's 401 says the
   * session expired (authFetch.ts); when there is none to refresh with
   * any more, the session ends here.
   */
  async #refresh(): Promise<void> {
    if (!this.#refreshable) return;
    const refreshed = await refreshStored(this.#as, this.webId);
    if (typeof refreshed === "object") {
      this.#dpop = oauth.DPoP(refreshed.stored.client, refreshed.stored.keys);
      this.#tokens = refreshed.tokens;
    } else if (currentSession() === this) setCurrentSession(null);
  }
}

let current: OidcSession | null = null;

/** The tab's session; none when logged out. */
export function currentSession(): OidcSession | null {
  return current;
}

export function setCurrentSession(session: OidcSession | null): void {
  current = session;
}
