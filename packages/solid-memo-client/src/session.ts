// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import * as oauth from "oauth4webapi";
import type { RestoredSession, SessionClient } from "@solid-memo/solid/client/interface";
import {
  completeLogin,
  discover,
  isRefusal,
  startLogin,
  startSilentLogin,
  takeRedirect,
} from "./oidcLogin";
import {
  currentSession,
  exclusively,
  OidcSession,
  refreshStored,
  setCurrentSession,
} from "./oidcSession";
import { clearSession, loadSession, saveSession } from "./oidcStore";

/**
 * The sign-in client (SessionClient, interface.ts) on oauth4webapi and
 * WebCrypto, with no Inrupt library: Solid-OIDC's code flow with PKCE,
 * DPoP-bound tokens (oidcLogin.ts), the session kept in IndexedDB
 * (oidcStore.ts) and its fetch (oidcSession.ts). It passes the same
 * contract as client/session.ts (src/testing/contract/session.ts).
 *
 * A reload restores the session with its refresh token, without leaving
 * the page, so restoredFrom is null then: the page keeps its hash. Only
 * without a refresh token, or when the provider refuses it, does it ask
 * the provider again (prompt=none), as the Inrupt library always does,
 * and report the page it left once the provider sends the user back.
 * Logout ends the session in this browser only, as the Inrupt one's
 * does (docs/authentication.md#logout): the provider's own session, and
 * its end_session_endpoint, are left alone.
 */

export type { SessionClient } from "@solid-memo/solid/client/interface";

const LOGGED_OUT: RestoredSession = { webId: null, fromLogin: false, restoredFrom: null };

/** Completes the redirect back from the provider this page is: a login, or a silent restore. */
async function completeRedirect(
  redirect: NonNullable<ReturnType<typeof takeRedirect>>,
): Promise<RestoredSession> {
  const { pending } = redirect;
  const silent = pending.silentFrom !== undefined;
  const as = await discover(pending.issuer);
  // A new key pair per login; the private key cannot leave the browser.
  const keys = await oauth.generateKeyPair("ES256");
  let completed: Awaited<ReturnType<typeof completeLogin>>;
  try {
    completed = await completeLogin(redirect, as, oauth.DPoP(pending.client, keys));
  } catch (error) {
    // The provider said no: the user declined, or (prompt=none) has no session there.
    if (!isRefusal(error)) throw error;
    if (silent) await exclusively(clearSession);
    return LOGGED_OUT;
  }
  const { tokens, webId } = completed;
  const stored = {
    issuer: as.issuer,
    client: pending.client,
    redirectUrl: pending.redirectUrl,
    keys,
    webId,
    ...(tokens.refreshToken !== undefined && { refreshToken: tokens.refreshToken }),
  };
  // After any refresh under way, which would otherwise store the older session over this one.
  await exclusively(() => saveSession(stored));
  setCurrentSession(new OidcSession(as, stored, tokens));
  return { webId, fromLogin: !silent, restoredFrom: pending.silentFrom ?? null };
}

/** The sign-in client on the tab's session (oidcSession.ts). */
export function createSessionClient(): SessionClient {
  return {
    async restore() {
      const redirect = takeRedirect();
      if (redirect !== undefined) return completeRedirect(redirect);
      const stored = await loadSession();
      if (stored === undefined) return LOGGED_OUT;
      const as = await discover(stored.issuer);
      const refreshed = await refreshStored(as, stored.webId);
      // Logged out, or in as someone else, in another tab since: no silent login brings it back.
      if (refreshed === "gone") return LOGGED_OUT;
      if (refreshed !== undefined) {
        setCurrentSession(new OidcSession(as, refreshed.stored, refreshed.tokens));
        return { webId: stored.webId, fromLogin: false, restoredFrom: null };
      }
      await startSilentLogin(as, stored.client, stored.redirectUrl, window.location.href);
      // The page is leaving for the provider, which sends the user back.
      return new Promise<never>(() => {});
    },

    async login(options) {
      await startLogin(options);
    },

    async logout() {
      setCurrentSession(null);
      // After any refresh under way, so that it cannot store the session again.
      await exclusively(clearSession);
    },

    // Looked up on every call: a fetch bound at wiring time would predate login.
    fetch: (input, init) => {
      const session = currentSession();
      return session ? session.fetch(input, init) : globalThis.fetch(input, init);
    },

    webId() {
      return currentSession()?.webId;
    },
  };
}
