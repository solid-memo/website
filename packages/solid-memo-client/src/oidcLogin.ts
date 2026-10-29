// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import * as oauth from "oauth4webapi";
import type { LoginOptions } from "@solid-memo/solid/client/interface";
import { navigate } from "./oidcBrowser";
import { loadRegistration, saveRegistration } from "./oidcStore";

/**
 * The Solid-OIDC exchanges with the identity provider, on oauth4webapi:
 * discovery, the client the app logs in as, the authorization request
 * (code flow, PKCE S256, state, nonce) and the token requests, DPoP-bound
 * and retried once when the provider asks for a DPoP nonce. What is kept
 * of a session, and its requests, is oidcSession.ts's.
 */

/** What the app asks for: a WebID, and a refresh token to restore the session with. */
const SCOPE = "openid offline_access webid";

/** sessionStorage: the authorization request under way, until the provider sends the user back. */
export const PENDING_LOGIN_KEY = "solid-memo:oidc-login";

/** The authorization request under way, as the redirect back is matched against it. */
export interface PendingLogin {
  issuer: string;
  client: oauth.Client;
  redirectUrl: string;
  codeVerifier: string;
  state: string;
  nonce: string;
  /** For a silent restore (prompt=none), the page it left. */
  silentFrom?: string;
}

/** The tokens of a session: the access token, in memory only. */
export interface Tokens {
  accessToken: string;
  /** When the access token expires, in ms since the epoch; Infinity when the provider did not say. */
  expiresAt: number;
  refreshToken?: string;
}

/** The parameters a provider sends back on the redirect URL, removed once read. */
const RESPONSE_PARAMETERS = ["code", "state", "iss", "error", "error_description", "session_state"];

/**
 * Whether requests to `url` may go over plain HTTP: to a server on this
 * machine only (a local pod in development); oauth4webapi refuses them
 * otherwise.
 */
export function isLoopbackHttp(url: URL): boolean {
  return (
    url.protocol === "http:" &&
    (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.hostname.endsWith(".localhost"))
  );
}

function requestOptions(url: string) {
  return { [oauth.allowInsecureRequests]: isLoopbackHttp(new URL(url)) };
}

/**
 * Refuses an endpoint the provider's metadata names that is not
 * `https:`, or `http:` to this machine: the browser is sent to the
 * authorization endpoint, and the app's requests go to the others.
 */
function checkEndpoint(issuer: string, name: string, endpoint: string | undefined): void {
  if (endpoint === undefined) return;
  const url = URL.parse(endpoint);
  if (url === null || !(url.protocol === "https:" || isLoopbackHttp(url))) {
    throw new Error(`${issuer}'s ${name} is neither https: nor on this machine`);
  }
}

/**
 * The provider's metadata, from its /.well-known/openid-configuration,
 * once its authorization, token and registration endpoints are checked,
 * and the token endpoint is on the issuer's origin.
 */
export async function discover(issuer: string): Promise<oauth.AuthorizationServer> {
  const url = new URL(issuer);
  const response = await oauth.discoveryRequest(url, {
    algorithm: "oidc",
    ...requestOptions(issuer),
  });
  const as = await oauth.processDiscoveryResponse(url, response);
  checkEndpoint(as.issuer, "authorization endpoint", as.authorization_endpoint);
  checkEndpoint(as.issuer, "token endpoint", as.token_endpoint);
  checkEndpoint(as.issuer, "registration endpoint", as.registration_endpoint);
  if (as.token_endpoint !== undefined && new URL(as.token_endpoint).origin !== url.origin) {
    throw new Error(`${as.issuer}'s token endpoint is on another origin`);
  }
  return as;
}

/**
 * How the client authenticates at the token endpoint: by no secret, as
 * the public client it registers as, unless a provider that takes no
 * public clients gave it one. The app does not ask for a method then, so
 * it gets RFC 7591's default, client_secret_basic.
 */
function clientAuth(client: oauth.Client): oauth.ClientAuth {
  return typeof client.client_secret === "string"
    ? oauth.ClientSecretBasic(client.client_secret)
    : oauth.None();
}

/**
 * The client the app logs in as: its Client ID Document when it has one
 * and the provider supports Solid-OIDC's webid scope, else the one the
 * provider registers dynamically, once per issuer and redirect URL.
 */
async function clientFor(
  as: oauth.AuthorizationServer,
  { redirectUrl, clientName, clientId }: LoginOptions,
): Promise<oauth.Client> {
  if (clientId !== undefined && as.scopes_supported?.includes("webid")) {
    return { client_id: clientId, token_endpoint_auth_method: "none" };
  }
  const key = `${as.issuer} ${redirectUrl}`;
  const registered = await loadRegistration(key);
  if (registered) return registered;
  const noSecret = as.token_endpoint_auth_methods_supported?.includes("none") ?? false;
  const response = await oauth.dynamicClientRegistrationRequest(
    as,
    {
      client_name: clientName,
      redirect_uris: [redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      application_type: "web",
      scope: SCOPE,
      ...(noSecret && { token_endpoint_auth_method: "none" }),
    },
    requestOptions(as.issuer),
  );
  const client = await oauth.processDynamicClientRegistrationResponse(response);
  await saveRegistration(key, client);
  return client;
}

/**
 * Sends the browser to the provider's authorization endpoint, keeping
 * what the redirect back is checked against in this tab. `prompt`
 * "consent" is what makes oidc-provider (Community Solid Server) grant
 * offline_access; "none" asks for a session without showing anything.
 */
async function authorize(
  as: oauth.AuthorizationServer,
  client: oauth.Client,
  redirectUrl: string,
  prompt: "consent" | "none",
  silentFrom?: string,
): Promise<void> {
  if (as.authorization_endpoint === undefined) {
    throw new Error(`${as.issuer} has no authorization endpoint`);
  }
  const pending: PendingLogin = {
    issuer: as.issuer,
    client,
    redirectUrl,
    codeVerifier: oauth.generateRandomCodeVerifier(),
    state: oauth.generateRandomState(),
    nonce: oauth.generateRandomNonce(),
    ...(silentFrom !== undefined && { silentFrom }),
  };
  const url = new URL(as.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", redirectUrl);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set(
    "code_challenge",
    await oauth.calculatePKCECodeChallenge(pending.codeVerifier),
  );
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", pending.state);
  url.searchParams.set("nonce", pending.nonce);
  url.searchParams.set("prompt", prompt);
  window.sessionStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify(pending));
  navigate(url.href);
}

/** Starts a login the user sees: the provider's login and consent pages. */
export async function startLogin(options: LoginOptions): Promise<void> {
  const as = await discover(options.oidcIssuer);
  const client = await clientFor(as, options);
  await authorize(as, client, options.redirectUrl, "consent");
}

/** Asks the provider for the session again without showing anything, leaving the page `from`. */
export async function startSilentLogin(
  as: oauth.AuthorizationServer,
  client: oauth.Client,
  redirectUrl: string,
  from: string,
): Promise<void> {
  await authorize(as, client, redirectUrl, "none", from);
}

/** The authorization request under way in this tab, if any. */
export function pendingLogin(): PendingLogin | undefined {
  const saved = window.sessionStorage.getItem(PENDING_LOGIN_KEY);
  return saved === null ? undefined : (JSON.parse(saved) as PendingLogin);
}

/**
 * The redirect back from the provider, if this page is one: a pending
 * request in this tab and its `state` on the URL. The provider's
 * parameters are removed from the URL whenever it has them, so a reload
 * does not try the code again; an answer to no request of this tab's is
 * dropped, and a pending request kept for its own answer.
 */
export function takeRedirect(): { pending: PendingLogin; parameters: URLSearchParams } | undefined {
  const url = new URL(window.location.href);
  if (!RESPONSE_PARAMETERS.some((name) => url.searchParams.has(name))) return undefined;
  const parameters = new URLSearchParams(url.searchParams);
  for (const name of RESPONSE_PARAMETERS) url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url.href);
  const pending = pendingLogin();
  if (pending === undefined || parameters.get("state") !== pending.state) return undefined;
  window.sessionStorage.removeItem(PENDING_LOGIN_KEY);
  return { pending, parameters };
}

/** Whether `error` is the provider refusing the request (an OAuth error), not a failure to reach it. */
export function isRefusal(error: unknown): boolean {
  return (
    error instanceof oauth.ResponseBodyError || error instanceof oauth.AuthorizationResponseError
  );
}

/** Makes a token request, once more when the provider answers with a DPoP nonce to use. */
async function withDpopNonce<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!oauth.isDPoPNonceError(error)) throw error;
    return request();
  }
}

function tokensOf(response: oauth.TokenEndpointResponse): Tokens {
  return {
    accessToken: response.access_token,
    expiresAt:
      response.expires_in === undefined
        ? Number.POSITIVE_INFINITY
        : Date.now() + response.expires_in * 1000,
    ...(response.refresh_token !== undefined && { refreshToken: response.refresh_token }),
  };
}

/** The WebID the ID token names: its webid claim, else its subject when that is a URL (Solid-OIDC, 5.1). */
function webIdOf(claims: oauth.IDToken): string {
  if (typeof claims.webid === "string") return claims.webid;
  const sub = URL.parse(claims.sub);
  if (sub !== null && (sub.protocol === "https:" || sub.protocol === "http:")) return claims.sub;
  throw new Error("The ID token names no WebID");
}

/**
 * Completes the redirect back: checks it against the pending request
 * (state, and the issuer, which it must name), trades the code for
 * DPoP-bound tokens with `dpop`, and checks the ID token (issuer,
 * audience, nonce). Rejects with the provider's error when it sent one
 * (isRefusal).
 */
export async function completeLogin(
  { pending, parameters }: { pending: PendingLogin; parameters: URLSearchParams },
  as: oauth.AuthorizationServer,
  dpop: oauth.DPoPHandle,
): Promise<{ tokens: Tokens; webId: string }> {
  // The iss parameter is required whatever the provider's metadata says:
  // every provider is sent the same redirect URL, and only iss ties the
  // answer to the provider the request went to (RFC 9207).
  const callback = oauth.validateAuthResponse(
    { ...as, authorization_response_iss_parameter_supported: true },
    pending.client,
    parameters,
    pending.state,
  );
  const response = await withDpopNonce(async () =>
    oauth.processAuthorizationCodeResponse(
      as,
      pending.client,
      await oauth.authorizationCodeGrantRequest(
        as,
        pending.client,
        clientAuth(pending.client),
        callback,
        pending.redirectUrl,
        pending.codeVerifier,
        { DPoP: dpop, ...requestOptions(as.issuer) },
      ),
      { expectedNonce: pending.nonce, requireIdToken: true },
    ),
  );
  // requireIdToken: oauth4webapi refused a response without one.
  const claims = oauth.getValidatedIdTokenClaims(response)!;
  return { tokens: tokensOf(response), webId: webIdOf(claims) };
}

/** New tokens for `refreshToken`, bound to `dpop`'s key as the old ones were. */
export async function refreshTokens(
  as: oauth.AuthorizationServer,
  client: oauth.Client,
  refreshToken: string,
  dpop: oauth.DPoPHandle,
): Promise<Tokens> {
  const response = await withDpopNonce(async () =>
    oauth.processRefreshTokenResponse(
      as,
      client,
      await oauth.refreshTokenGrantRequest(as, client, clientAuth(client), refreshToken, {
        DPoP: dpop,
        ...requestOptions(as.issuer),
      }),
    ),
  );
  return tokensOf(response);
}
