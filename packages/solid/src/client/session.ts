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

/**
 * The sign-in client: the Solid-OIDC session the browser keeps for this
 * tab. A thin layer over @inrupt/solid-client-authn-browser, the only
 * implementation so far, so that the rest of the package names no
 * library. What the app does around a login, the route it returns to
 * and the issuer it asks a WebID for, is solidSessionGateway.ts's.
 */
export interface SessionClient {
  /**
   * Completes a login the identity provider sent the user back from or,
   * failing that, restores the previous session, silently.
   */
  restore(): Promise<RestoredSession>;
  /** Sends the browser to the identity provider; does not return. */
  login(options: LoginOptions): Promise<void>;
  /** Ends the session. */
  logout(): Promise<void>;
  /** Fetches as the session's user: the current session's, never one from before a login. */
  fetch: typeof globalThis.fetch;
  /** The logged-in user's WebID, as the session has it now; none when logged out. */
  webId(): string | undefined;
}

/** What restore found. */
export interface RestoredSession {
  /** The user's WebID; null when no one is logged in. */
  webId: string | null;
  /** Whether a login just completed, not a silent restore. */
  fromLogin: boolean;
  /** The page a silent restore left for the identity provider, if it left one. */
  restoredFrom: string | null;
}

/** Where a login goes, and who the app says it is. */
export interface LoginOptions {
  /** The identity provider. */
  oidcIssuer: string;
  /** Where the provider sends the user back to. */
  redirectUrl: string;
  /** The name the app registers under when the provider registers it dynamically. */
  clientName: string;
  /** The app's Client ID Document, when it is the client ID. */
  clientId?: string;
}

/** The sign-in client on @inrupt/solid-client-authn-browser's default session. */
export function createSessionClient(): SessionClient {
  return {
    async restore() {
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
      try {
        const info = await handleIncomingRedirect({ restorePreviousSession: true });
        const webId = info?.isLoggedIn && info.webId ? info.webId : null;
        return { webId, fromLogin, restoredFrom };
      } finally {
        events().off(EVENTS.LOGIN, onLogin);
        events().off(EVENTS.SESSION_RESTORED, onRestored);
      }
    },

    async login(options) {
      await login(options);
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
