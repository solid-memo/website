// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getDefaultSession } from "@inrupt/solid-client-authn-browser";

/** Window event dispatched when the pod answers 401 (expired session). */
export const SESSION_EXPIRED_EVENT = "solid-memo:session-expired";

/**
 * Lazy wrapper around the default session's fetch, so callers always use
 * the CURRENT session state (a bound reference captured at wiring time
 * would predate login). Announces expired sessions via a window event.
 */
export const authFetch: typeof globalThis.fetch = async (input, init) => {
  const response = await getDefaultSession().fetch(input, init);
  if (response.status === 401) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  return response;
};

/** The logged-in user's WebID, as the default session has it now; none when logged out. */
export function sessionWebId(): string | undefined {
  const { isLoggedIn, webId } = getDefaultSession().info;
  return isLoggedIn ? webId : undefined;
}
