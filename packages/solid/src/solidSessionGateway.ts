// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getSolidDataset } from "./client/resources";
import { getThing, getUrlAll } from "./client/rdf";
import type { SessionClient } from "./client/session";
import type { SessionGateway } from "@solid-memo/application/ports";
import type { SessionOrigin } from "@solid-memo/domain/session";
import { isSecureUrl } from "@solid-memo/domain/webId";
import { SESSION_EXPIRED_EVENT } from "./authFetch";
import { AppError } from "@solid-memo/domain/appError";

const SOLID_OIDC_ISSUER = "http://www.w3.org/ns/solid/terms#oidcIssuer";

/**
 * Dereference a WebID (unauthenticated) and read the solid:oidcIssuer
 * triple from the profile so the user only needs to type their WebID.
 * The issuer is never guessed from the WebID's origin, and only an
 * https issuer is accepted: the browser is about to be sent there.
 */
async function discoverOidcIssuer(webId: string): Promise<string> {
  const dataset = await getSolidDataset(webId);
  const profile = getThing(dataset, webId);
  if (!profile) {
    throw new AppError("webIdNoSubject", { webId });
  }
  const issuers = getUrlAll(profile, SOLID_OIDC_ISSUER);
  if (issuers.length === 0) {
    throw new AppError("webIdNoIssuer", { webId });
  }
  const issuer = issuers.find(isSecureUrl);
  if (issuer === undefined) {
    throw new AppError("webIdIssuerNotHttps", { webId });
  }
  return issuer;
}

/**
 * The hash the page had when a login set off. The identity provider
 * sends the user back to the page without it (a redirect URL may have
 * no hash), so it is kept here, in this tab, until the login completes.
 */
export const LOGIN_HASH_KEY = "solid-memo:login-hash";

/**
 * Takes the page back to a route the redirect dropped: the Studio's, say,
 * not the default one. The hashchange tells the routers, as a link would.
 */
function returnTo(hash: string): void {
  if (hash === "") return;
  window.history.replaceState(null, "", hash);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/** Who the app says it is when the user logs in, and where it is served. */
export interface SessionGatewayOptions {
  /** The name it registers under when the provider registers it dynamically. */
  clientName: string;
  /** The folder the page is served from, ending in a slash: where the provider sends the user back to. */
  site: string;
  /**
   * The address of the site's Client ID Document, if the build wrote
   * one (docs/authentication.md#the-client-id-document). It is the
   * client ID only on the site it was written for, the folder it is in,
   * as it lists that site's redirect URL alone.
   */
  clientId?: string | null;
}

/** The session gateway over a sign-in client (client/session.ts). */
export function createSolidSessionGateway({
  clientName,
  site,
  clientId,
  client,
}: SessionGatewayOptions & { client: SessionClient }): SessionGateway {
  const ownClientId = clientId != null && new URL(".", clientId).href === site;

  /** Redirects the browser to the identity provider; does not return. */
  async function startLogin(oidcIssuer: string): Promise<void> {
    window.sessionStorage.setItem(LOGIN_HASH_KEY, window.location.hash);
    await client.login({
      oidcIssuer,
      // The site's folder, not the page's path, so /index.html sends the user back to / too.
      redirectUrl: site,
      clientName,
      // With a provider that does not list the webid scope, the client registers the app by its name instead.
      ...(ownClientId && { clientId }),
    });
  }

  return {
    async restore() {
      const { webId, fromLogin, restoredFrom } = await client.restore();
      const loginHash = window.sessionStorage.getItem(LOGIN_HASH_KEY) ?? "";
      window.sessionStorage.removeItem(LOGIN_HASH_KEY);
      if (webId === null) return null;
      // A silent restore leaves the page for the identity provider and
      // comes back without its hash; the client reports the page it left.
      const restoredHash = restoredFrom === null ? "" : new URL(restoredFrom).hash;
      returnTo(fromLogin ? loginHash : restoredHash);
      const origin: SessionOrigin = fromLogin ? "login" : "restored";
      return { session: { webId }, origin };
    },

    discoverOidcIssuer,

    async login(webId) {
      await startLogin(await discoverOidcIssuer(webId));
    },

    loginWithIssuer: startLogin,

    async logout() {
      await client.logout();
    },

    onSessionExpired(listener) {
      window.addEventListener(SESSION_EXPIRED_EVENT, listener);
      return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
    },
  };
}
