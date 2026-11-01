// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { SessionGateway } from "@solid-memo/application/ports";
import { createAuthFetch } from "./authFetch";
import type { SessionClient } from "./client/session";
import { createSolidSessionGateway, type SessionGatewayOptions } from "./solidSessionGateway";

/** The user's session: the gateway the app logs in by, and the fetch it reads and writes pods with. */
export interface SolidSession {
  sessionGateway: SessionGateway;
  /** Fetches as the logged-in user, and announces a session that expired (authFetch.ts). */
  fetch: typeof globalThis.fetch;
  /** The logged-in user's WebID, asked at each call; none when logged out. */
  webId: () => string | undefined;
}

/**
 * The session, both of its halves on one sign-in client, which the
 * composition root chooses (client/session.ts is the only one so far).
 * `ownStorages` names the user's own storages, where a token refused as
 * invalid means the session expired (authFetch.ts); a logout is not one.
 */
export function createSolidSession(
  client: SessionClient,
  {
    ownStorages,
    ...options
  }: SessionGatewayOptions & {
    ownStorages?: (webId: string) => Promise<readonly string[]>;
  },
): SolidSession {
  const auth = createAuthFetch(client, { ownStorages });
  const loggingOut: SessionClient = {
    ...client,
    async logout() {
      auth.forget();
      await client.logout();
      // A request sent while the logout was under way had the user too.
      auth.forget();
    },
  };
  return {
    sessionGateway: createSolidSessionGateway({ ...options, client: loggingOut }),
    fetch: auth.fetch,
    webId: () => client.webId(),
  };
}
