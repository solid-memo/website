// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import * as oauth from "oauth4webapi";
import { LwsTokens, type LwsStorage } from "./lwsAuth";
import { isLoopbackHttp, isRefusal, refreshTokens, type Tokens } from "./oidcLogin";
import { clearSession, loadSession, replaceSession, type StoredSession } from "./oidcStore";

/**
 * A logged-in session in this tab: its tokens, the access and ID tokens
 * in memory only, and the fetch that sends them, DPoP-bound, refreshing
 * the access token as it is about to expire. On a Linked Web Storage
 * storage it sends the Bearer token it exchanges the ID token for
 * (lwsAuth.ts). The tab has one current session, as the app has one user
 * (currentSession).
 */

/** How long before it expires an access or ID token is refreshed, in ms. */
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

/** A request of the caller's, as the session sends it, once or again. */
interface Sent {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
  url: URL;
  method: string;
}

/**
 * The redirect mode of a request with an LWS storage's Bearer token: no
 * redirect followed, as the browser would send the token on to any
 * address on the same origin, outside the storage too. "error" when the
 * caller asked for it (authFetch.ts), so a redirect fails as it expects;
 * "manual" otherwise, the redirect coming back as it is.
 */
function bearerRedirect({ input, init }: Sent): RequestRedirect {
  const asked = init?.redirect ?? (input instanceof Request ? input.redirect : undefined);
  return asked === "error" ? "error" : "manual";
}

/**
 * Sends the request with `token`, Bearer, or DPoP with `dpop`'s proof.
 * A Bearer request follows no redirect (bearerRedirect). A challenge
 * comes back as the response it came with, its parsed challenges beside
 * it.
 */
async function send(
  request: Sent,
  token: string,
  dpop?: oauth.DPoPHandle,
): Promise<{ response: Response; challenge?: oauth.WWWAuthenticateChallengeError }> {
  const { input, init, url, method } = request;
  const redirect = dpop === undefined ? { redirect: bearerRedirect(request) } : {};
  try {
    const response = await oauth.protectedResourceRequest(token, method, url, undefined, null, {
      ...(dpop !== undefined && { DPoP: dpop }),
      [oauth.allowInsecureRequests]: url.protocol === "http:",
      // oauth4webapi builds the Authorization header and proof; the request itself is the caller's.
      [oauth.customFetch]: (_, built) =>
        globalThis.fetch(input, { ...withProof(input, init, built.headers), ...redirect }),
    });
    return { response };
  } catch (error) {
    if (!(error instanceof oauth.WWWAuthenticateChallengeError)) throw error;
    return { response: error.response, challenge: error };
  }
}

export class OidcSession {
  readonly webId: string;
  readonly #as: oauth.AuthorizationServer;
  #client: oauth.Client;
  #dpop: oauth.DPoPHandle;
  readonly #refreshable: boolean;
  #tokens: Tokens;
  #refreshing: Promise<void> | undefined;
  /** Whether a refresh may bring an ID token: until one brought none. */
  #refreshGivesIdToken = true;
  /** The LWS storages met, and their tokens: this session's alone, gone with it. */
  readonly #lws: LwsTokens;

  constructor(
    as: oauth.AuthorizationServer,
    stored: Pick<StoredSession, "client" | "keys" | "webId" | "refreshToken">,
    tokens: Tokens,
  ) {
    this.webId = stored.webId;
    this.#refreshable = stored.refreshToken !== undefined;
    this.#as = as;
    this.#client = stored.client;
    this.#dpop = oauth.DPoP(stored.client, stored.keys);
    this.#tokens = tokens;
    this.#lws = new LwsTokens({
      issuer: as.issuer,
      client: () => this.#client,
      idToken: () => this.#idToken(),
    });
  }

  /**
   * Fetches as the session's user. Within a Linked Web Storage storage
   * met before: Authorization: Bearer with its token (lwsAuth.ts).
   * Elsewhere: Authorization: DPoP with the access token and a proof for
   * this request (its method, and its URL without query or fragment),
   * once more after a DPoP nonce the server asked for. A 401 with an
   * LWS challenge is sent once more with the storage's token, when its
   * checks pass and its body can be sent again. A 401 to a storage's
   * token that was not new is sent once more with a new one. Any other
   * 401 comes back as it is.
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
    const request: Sent = { input, init, url, method };
    const storage = this.#lws.storageOf(url);
    const asLws = storage && (await this.#withLws(storage, request));
    return asLws ?? this.#withDpop(accessToken, request, storage);
  };

  /**
   * The request with the access token, DPoP-bound, and what an LWS
   * challenge to it leads to; not for `tried`, the storage this request
   * already found no token for.
   */
  async #withDpop(accessToken: string, request: Sent, tried?: LwsStorage): Promise<Response> {
    let { response, challenge } = await send(request, accessToken, this.#dpop);
    const again = replayable(request.input, request.init);
    if (challenge !== undefined && again && oauth.isDPoPNonceError(challenge)) {
      ({ response, challenge } = await send(request, accessToken, this.#dpop));
    }
    if (challenge === undefined) return response;
    const storage = await this.#lws.discover(
      request.url,
      response,
      challenge.cause,
      signalOf(request),
    );
    if (storage === undefined || storage === tried || !again) return response;
    return (await this.#withLws(storage, request)) ?? response;
  }

  /**
   * The request with the LWS storage's token, and once more with a new
   * one when the storage refuses one that was not new; none when the
   * session has no token for the storage.
   */
  async #withLws(storage: LwsStorage, request: Sent): Promise<Response | undefined> {
    const signal = signalOf(request);
    const token = await this.#lws.token(storage, signal);
    if (token === undefined) return undefined;
    const { response } = await send(request, token.value);
    if (response.status !== 401 || token.exchanged || !replayable(request.input, request.init)) {
      return response;
    }
    this.#lws.forget(storage, token.value);
    const renewed = await this.#lws.token(storage, signal);
    return renewed === undefined ? response : (await send(request, renewed.value)).response;
  }

  /**
   * The access token, refreshed first when it is about to expire; none
   * once the provider refused to, or once it expired with no refresh
   * token to renew it, the session ended then (authFetch.ts reads a 401
   * with no session as one that expired).
   */
  async #accessToken(): Promise<string | undefined> {
    if (Date.now() >= this.#tokens.expiresAt - REFRESH_MARGIN) await this.#refreshOnce();
    if (currentSession() === this && Date.now() >= this.#tokens.expiresAt) setCurrentSession(null);
    return currentSession() === this ? this.#tokens.accessToken : undefined;
  }

  /**
   * The ID token, for an LWS token exchange: refreshed first when it is
   * about to expire and a refresh may bring a new one; none once it
   * expired, or the session ended.
   */
  async #idToken(): Promise<string | undefined> {
    const expiresAt = this.#tokens.idTokenExpiresAt ?? 0;
    if (Date.now() >= expiresAt - REFRESH_MARGIN && this.#refreshGivesIdToken) {
      await this.#refreshOnce();
    }
    const { idToken, idTokenExpiresAt = 0 } = this.#tokens;
    return currentSession() === this && Date.now() < idTokenExpiresAt ? idToken : undefined;
  }

  /** Refreshes the tokens, one refresh at a time however many requests wait for it. */
  async #refreshOnce(): Promise<void> {
    this.#refreshing ??= this.#refresh().finally(() => {
      this.#refreshing = undefined;
    });
    await this.#refreshing;
  }

  /**
   * Swaps in fresh tokens, and the key pair they are bound to: the stored
   * session's, which a login in another tab may have replaced. The ID
   * token is kept when the provider sent no new one. Without a refresh
   * token the one it has goes on until it expires; when there is none to
   * refresh with any more, the session ends here.
   */
  async #refresh(): Promise<void> {
    if (!this.#refreshable) return;
    const refreshed = await refreshStored(this.#as, this.webId);
    if (typeof refreshed === "object") {
      const { idToken, idTokenExpiresAt } = this.#tokens;
      this.#client = refreshed.stored.client;
      this.#dpop = oauth.DPoP(refreshed.stored.client, refreshed.stored.keys);
      this.#refreshGivesIdToken = refreshed.tokens.idToken !== undefined;
      this.#tokens = { idToken, idTokenExpiresAt, ...refreshed.tokens };
    } else if (currentSession() === this) setCurrentSession(null);
  }
}

/** The caller's signal, from its init or its Request. */
function signalOf({ input, init }: Sent): AbortSignal | null | undefined {
  return init?.signal ?? (input instanceof Request ? input.signal : undefined);
}

let current: OidcSession | null = null;

/** The tab's session; none when logged out. */
export function currentSession(): OidcSession | null {
  return current;
}

export function setCurrentSession(session: OidcSession | null): void {
  current = session;
}
