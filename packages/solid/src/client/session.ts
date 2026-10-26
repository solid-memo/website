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

/**
 * The sign-in client (SessionClient, interface.ts) over
 * @inrupt/solid-client-authn-browser, the only implementation so far, so
 * that the rest of the package names no library.
 */

export type { SessionClient } from "./interface";

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
