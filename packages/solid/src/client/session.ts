// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  EVENTS,
  events,
  getDefaultSession,
  handleIncomingRedirect,
  login,
  logout,
} from "@inrupt/solid-client-authn-browser";
import type { SessionClient } from "./interface";
import { PROVIDER_REDIRECT_KEY } from "./providerRedirect";

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
 */
const CURRENT_SESSION_KEY = "solidClientAuthn:currentSession";
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

/** The sign-in client on @inrupt/solid-client-authn-browser's default session. */
export function createSessionClient(): SessionClient {
  return {
    async restore() {
      dropUnaskedAnswer();
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

    async login(options) {
      window.sessionStorage.setItem(PROVIDER_REDIRECT_KEY, "login");
      try {
        await login(options);
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
