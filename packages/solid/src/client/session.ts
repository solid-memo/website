// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  EVENTS,
  events,
  getDefaultSession,
  handleIncomingRedirect,
  type ILoginInputOptions,
  login,
  logout,
} from "@inrupt/solid-client-authn-browser";
import { AppError } from "@solid-memo/domain/appError";
import type { SessionClient } from "./interface";
import { PROVIDER_REDIRECT_KEY } from "./providerRedirect";
import { limitedFetch, PROFILE_LIMITS, refusalOf } from "./readLimits";

/**
 * The sign-in client (SessionClient, interface.ts) over
 * @inrupt/solid-client-authn-browser, the only implementation so far, so
 * that the rest of the package names no library; another implementation
 * passes the same contract (src/testing/contract/session.ts).
 */

export type { SessionClient } from "./interface";

/**
 * Where the library (5.x) keeps, in localStorage, the session it
 * restores silently: its ID, and under that its fields, the issuer
 * among them. A silent restore logs in again at that issuer. A login
 * request's state is kept under the same prefix, naming its session.
 *
 * The page a silent restore left from is kept too, and that key alone
 * tells the library a completed redirect is a restore, not a login: it
 * reports SESSION_RESTORED, and does not keep the session, while the key
 * is there. Only a completed redirect takes it off, so the client does
 * when a silent restore did not complete.
 */
const CURRENT_SESSION_KEY = "solidClientAuthn:currentSession";
const CURRENT_URL_KEY = "solidClientAuthn:currentUrl";
const USER_PREFIX = "solidClientAuthenticationUser:";

/** One of the library's entries, by user (a session or a state); none unless an object. */
function storedFields(user: string): Record<string, unknown> | null {
  try {
    const fields: unknown = JSON.parse(
      window.localStorage.getItem(`${USER_PREFIX}${user}`) ?? "null",
    );
    return typeof fields === "object" && fields !== null
      ? (fields as Record<string, unknown>)
      : null;
  } catch {
    // Not JSON: the library does not read it either.
    return null;
  }
}

/** The issuer of the session with this ID, as the library reads it. */
function storedSessionIssuer(sessionId: string | null): string | null {
  if (sessionId === null) return null;
  const issuer = storedFields(sessionId)?.issuer;
  return typeof issuer === "string" ? issuer : null;
}

/** The session the library keeps for a login request's state. */
function sessionOfState(state: string): string | null {
  const sessionId = storedFields(state)?.sessionId;
  return typeof sessionId === "string" ? sessionId : null;
}

/** The parameters a provider sends back on the redirect URL. */
const RESPONSE_PARAMETERS = ["code", "state", "iss", "error", "error_description", "session_state"];

/**
 * Takes off the page's URL a provider's answer this tab did not ask for,
 * keeping its route. An answer is this tab's when the tab is marked and
 * the library stored the `state` it echoes (in localStorage, under its
 * own key, on sending the request), an error's too.
 */
function dropUnaskedAnswer(): void {
  const url = new URL(window.location.href);
  const { searchParams } = url;
  if (
    !RESPONSE_PARAMETERS.some((name) => searchParams.has(name)) ||
    (window.sessionStorage.getItem(PROVIDER_REDIRECT_KEY) &&
      window.localStorage.getItem(`${USER_PREFIX}${searchParams.get("state")}`))
  ) {
    return;
  }
  for (const name of RESPONSE_PARAMETERS) searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url.href);
}

/** Where the library reads a provider's metadata, at a login and again at each refresh. */
const METADATA_PATH = "/.well-known/openid-configuration";

/**
 * Whether metadata names an endpoint whose parsed path starts with `//`.
 * The library signs a request's DPoP proof for the path read against
 * the origin, and such a path reads as another host. A value that is no
 * string is read as the library reads it, which turns it into one.
 */
function namesAnotherHost(metadata: unknown): boolean {
  return Object.entries(metadata ?? {}).some(([field, value]) => {
    if (!field.endsWith("_endpoint") && field !== "jwks_uri") return false;
    const url = String(value);
    return URL.canParse(url) && new URL(url).pathname.startsWith("//");
  });
}

const guardedFetches = new WeakSet<typeof globalThis.fetch>();

/**
 * Refuses such metadata wherever the library reads it. That has to be
 * at the global fetch: a refresh reads the metadata anew and calls that
 * fetch itself, so nothing else of the app sees it, and the library has
 * no option for its own. Every request passes through; only an answer
 * from an address ending in the metadata's path is looked at, under
 * PROFILE_LIMITS. Any document can sit at this path, and the limits of
 * the read that asked for it wrap this fetch, so they apply only once it
 * has answered; these allow as much as a profile read's own limits do,
 * and past them the read fails as too large. A login and a restore put
 * it in place: a session comes from one of them.
 */
function guardProviderMetadata(): void {
  const { fetch: next } = globalThis;
  if (guardedFetches.has(next)) return;
  const limited = limitedFetch((input, init) => next.call(globalThis, input, init), PROFILE_LIMITS);
  const guarded: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.endsWith(METADATA_PATH)) return next.call(globalThis, input, init);
    const response = await limited(input, init);
    const metadata: unknown = await response
      .clone()
      .json()
      .catch(() => null);
    const tooLarge = refusalOf(response);
    if (tooLarge !== undefined) throw tooLarge;
    if (namesAnotherHost(metadata)) throw new AppError("loginProviderRefused", { url });
    return response;
  };
  guardedFetches.add(guarded);
  globalThis.fetch = guarded;
}

/** Forgets the page a silent restore left from, once the provider's answer to this tab is an error. */
function forgetRefusedRestore(): void {
  if (new URL(window.location.href).searchParams.has("error")) {
    window.localStorage.removeItem(CURRENT_URL_KEY);
  }
}

/** The sign-in client on @inrupt/solid-client-authn-browser's default session. */
export function createSessionClient(): SessionClient {
  return {
    async restore() {
      guardProviderMetadata();
      dropUnaskedAnswer();
      forgetRefusedRestore();
      let fromLogin = false;
      const onLogin = () => {
        fromLogin = true;
      };
      let restoredFrom: string | null = null;
      const onRestored = (url: string) => {
        restoredFrom = url;
      };
      // The library reports which happened only by these events.
      events().on(EVENTS.LOGIN, onLogin);
      events().on(EVENTS.SESSION_RESTORED, onRestored);
      // Marked anew, and taken off once restored; a silent restore leaves
      // the page with the library's promise never settling, so the
      // finally below does not run and the mark stays for the provider's
      // answer.
      window.sessionStorage.setItem(PROVIDER_REDIRECT_KEY, "restore");
      try {
        const info = await handleIncomingRedirect({ restorePreviousSession: true });
        const webId = info?.isLoggedIn && info.webId ? info.webId : null;
        return { webId, fromLogin, restoredFrom };
      } finally {
        window.sessionStorage.removeItem(PROVIDER_REDIRECT_KEY);
        events().off(EVENTS.LOGIN, onLogin);
        events().off(EVENTS.SESSION_RESTORED, onRestored);
      }
    },

    async sessionIssuer() {
      return storedSessionIssuer(window.localStorage.getItem(CURRENT_SESSION_KEY));
    },

    // The library looks the request up by its state, in localStorage, which every tab shares.
    async requestIssuer(state) {
      return storedSessionIssuer(sessionOfState(state));
    },

    // A silent restore goes through the library's own login, not this one, and keeps its page.
    async login(options) {
      guardProviderMetadata();
      window.localStorage.removeItem(CURRENT_URL_KEY);
      window.sessionStorage.setItem(PROVIDER_REDIRECT_KEY, "login");
      try {
        // A new ID each time, never the one this page restored: the
        // library reads a session's provider from localStorage by its ID
        // alone, so under that ID every other tab's refresh would go to
        // this login's provider. A silent restore does not come here: it
        // stays under the session's ID, at the session's provider.
        await login({ ...options, sessionId: crypto.randomUUID() } as ILoginInputOptions);
      } catch (error) {
        window.sessionStorage.removeItem(PROVIDER_REDIRECT_KEY);
        throw error;
      }
    },

    async logout() {
      await logout();
    },

    // Looked up on every call: a fetch bound at wiring time would predate login.
    fetch: (input, init) => getDefaultSession().fetch(input, init),

    webId() {
      const { isLoggedIn, webId } = getDefaultSession().info;
      return isLoggedIn ? webId : undefined;
    },
  };
}
