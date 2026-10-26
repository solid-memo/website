// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { SessionClient } from "./client/session";

/** Window event dispatched when the pod answers 401 (expired session). */
export const SESSION_EXPIRED_EVENT = "solid-memo:session-expired";

/**
 * The client's fetch, which always uses the CURRENT session (a bound
 * reference captured at wiring time would predate login). Announces
 * expired sessions via a window event.
 */
export function createAuthFetch(client: SessionClient): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await client.fetch(input, init);
    if (response.status === 401) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return response;
  };
}
