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
 * The identity provider this tab last sent the browser to, for a login
 * or a silent restore, kept until the next page load: the provider's
 * answer is checked against it.
 */
export const LOGIN_ISSUER_KEY = "solid-memo:login-issuer";

/** The parameters an identity provider sends back on the redirect URL. */
const RESPONSE_PARAMETERS = ["code", "state", "iss", "error", "error_description", "session_state"];

/** An issuer as written with or without its trailing slash, for comparing two of them. */
function withoutTrailingSlash(issuer: string): string {
  return issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;
}

/** Whether an address's parameters are an identity provider's answer. */
function isAuthorizationResponse(searchParams: URLSearchParams): boolean {
  return searchParams.has("code") || searchParams.has("error");
}

/** Takes the provider's answer off the address, so a reload does not try it again, and refuses it. */
function refuseAuthorizationResponse(url: URL, error: AppError): never {
  for (const name of RESPONSE_PARAMETERS) url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url.href);
  throw error;
}

/**
 * Refuses an answer from an identity provider, before a sign-in client
 * redeems its code, unless this tab sent the browser to a provider and
 * the answer names that provider in its `iss` parameter (RFC 9207).
 * Every provider is sent the same redirect URL and client, so `iss` is
 * all that ties an answer to the provider it came from, and only this
 * tab knows which provider it sent the browser to. An answer with a
 * code must also answer a request, by its `state`, that went to that
 * same provider: the client redeems the code where the request went,
 * and may hold requests from other tabs, or ones left unanswered.
 * A refused answer is taken off the address.
 */
async function checkAuthorizationResponse(
  expectedIssuer: string | null,
  client: SessionClient,
): Promise<void> {
  const url = new URL(window.location.href);
  const { searchParams } = url;
  if (!isAuthorizationResponse(searchParams)) return;
  const iss = searchParams.get("iss");
  if (iss === null) {
    refuseAuthorizationResponse(
      url,
      new AppError("loginIssuerMissing", expectedIssuer === null ? {} : { issuer: expectedIssuer }),
    );
  }
  if (expectedIssuer === null)
    refuseAuthorizationResponse(url, new AppError("loginNotStarted", { iss }));
  if (withoutTrailingSlash(iss) !== withoutTrailingSlash(expectedIssuer)) {
    refuseAuthorizationResponse(
      url,
      new AppError("loginIssuerMismatch", { issuer: expectedIssuer, iss }),
    );
  }
  if (!searchParams.has("code")) return;
  const state = searchParams.get("state");
  const requestIssuer = state === null ? null : await client.requestIssuer(state);
  if (requestIssuer === null) {
    refuseAuthorizationResponse(url, new AppError("loginNotStarted", { iss, state: state ?? "" }));
  }
  if (withoutTrailingSlash(requestIssuer) !== withoutTrailingSlash(expectedIssuer)) {
    refuseAuthorizationResponse(
      url,
      new AppError("loginIssuerMismatch", { issuer: expectedIssuer, request: requestIssuer }),
    );
  }
}

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
    window.sessionStorage.setItem(LOGIN_ISSUER_KEY, oidcIssuer);
    await client.login({
      oidcIssuer,
      // The site's folder, not the page's path, so /index.html sends the user back to / too.
      redirectUrl: site,
      clientName,
      // With a provider that does not list the webid scope, the client registers the app by its name instead.
      ...(ownClientId && { clientId }),
    });
  }

  /**
   * Completes the provider's answer or restores the previous session.
   * A silent restore may send the browser to the session's provider,
   * so that provider is kept first, for its answer to be checked
   * against; if the page does not leave, it is not needed.
   */
  async function restoreSession() {
    if (isAuthorizationResponse(new URL(window.location.href).searchParams)) {
      return client.restore();
    }
    const sessionIssuer = await client.sessionIssuer();
    if (sessionIssuer !== null) window.sessionStorage.setItem(LOGIN_ISSUER_KEY, sessionIssuer);
    try {
      return await client.restore();
    } finally {
      window.sessionStorage.removeItem(LOGIN_ISSUER_KEY);
    }
  }

  return {
    async restore() {
      const loginHash = window.sessionStorage.getItem(LOGIN_HASH_KEY) ?? "";
      const loginIssuer = window.sessionStorage.getItem(LOGIN_ISSUER_KEY);
      window.sessionStorage.removeItem(LOGIN_HASH_KEY);
      window.sessionStorage.removeItem(LOGIN_ISSUER_KEY);
      await checkAuthorizationResponse(loginIssuer, client);
      const { webId, fromLogin, restoredFrom } = await restoreSession();
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
