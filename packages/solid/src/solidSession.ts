// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { SessionGateway } from "@solid-memo/application/ports";
import { createAuthFetch } from "./authFetch";
import { createSessionClient } from "./client/session";
import { createSolidSessionGateway, type SessionGatewayOptions } from "./solidSessionGateway";

/** The user's session: the gateway the app logs in by, and the fetch it reads and writes pods with. */
export interface SolidSession {
  sessionGateway: SessionGateway;
  /** Fetches as the logged-in user, and announces a session that expired (authFetch.ts). */
  fetch: typeof globalThis.fetch;
  /** The logged-in user's WebID, asked at each call; none when logged out. */
  webId: () => string | undefined;
}

/** The session, both of its halves on one sign-in client (client/session.ts). */
export function createSolidSession(options: SessionGatewayOptions): SolidSession {
  const client = createSessionClient();
  return {
    sessionGateway: createSolidSessionGateway({ ...options, client }),
    fetch: createAuthFetch(client),
    webId: () => client.webId(),
  };
}
