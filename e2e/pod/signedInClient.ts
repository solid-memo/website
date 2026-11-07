// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createPublicKey } from "node:crypto";
import { OidcSession, setCurrentSession } from "@solid-memo/solid-memo-client/oidcSession";
import type { SessionClient } from "@solid-memo/solid/client/session";
import { sessionClient, type Session } from "./signedIn.ts";

const ECDSA = { name: "ECDSA", namedCurve: "P-256" };

/**
 * The sign-in client over a session. Where it has an ID token, that of
 * the app's own Solid client, whose session makes a Linked Web Storage
 * server's token exchange (docs/lws.md). It is apart from signedIn.ts because
 * servers.ts, which node runs as it is, imports that.
 */
export function clientOf(session: Session): SessionClient {
  const plain = sessionClient(session);
  if (session.openId === undefined) return plain;
  const { accessToken, webId, issuer, key, openId } = session;
  // It reads each request's URL against the page's.
  const page = globalThis as { window?: unknown };
  page.window ??= Object.assign(new EventTarget(), { location: { href: issuer } });
  const oidc = new OidcSession(
    { issuer },
    {
      webId,
      client: { client_id: openId.clientId, token_endpoint_auth_method: "none" },
      keys: {
        privateKey: key.privateKey.toCryptoKey(ECDSA, false, ["sign"]),
        publicKey: createPublicKey(key.privateKey).toCryptoKey(ECDSA, true, ["verify"]),
      } as CryptoKeyPair,
    },
    {
      accessToken,
      expiresAt: Number.POSITIVE_INFINITY,
      idToken: openId.idToken,
      idTokenExpiresAt: openId.expiresAt,
    },
  );
  return {
    ...plain,
    fetch: (input, init) => {
      // The app has one user at a time; these tests have two, one request at a time.
      setCurrentSession(oidc);
      return oidc.fetch(input, init);
    },
  };
}
