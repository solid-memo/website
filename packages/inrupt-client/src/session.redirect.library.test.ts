// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { Session } from "@inrupt/solid-client-authn-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionClient } from "./session";

/**
 * The client's redirects with the library's own code against a provider
 * over fetch: what makes the library read a redirect as a login or a
 * restore is its own, so a mock of it would prove nothing.
 */

/** The library's default session, new on each page load, as a browser's would be. */
const page = vi.hoisted(() => ({ session: undefined as unknown as Session }));

vi.mock("@inrupt/solid-client-authn-browser", async (actual) => ({
  ...(await actual<typeof import("@inrupt/solid-client-authn-browser")>()),
  getDefaultSession: () => page.session,
  events: () => page.session.events,
  handleIncomingRedirect: (options: never) => page.session.handleIncomingRedirect(options),
  login: (options: never) => page.session.login(options),
}));

const ISSUER = "https://issuer.example/";
const SITE = `${window.location.origin}/`;
const CLIENT = `${SITE}clientid.jsonld`;
const WEBID = "https://alice.example/profile/card#me";
const STALE = `${SITE}#/stale-route`;

const signingKeys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const publicKey = {
  ...(await crypto.subtle.exportKey("jwk", signingKeys.publicKey)),
  kid: "k",
  alg: "ES256",
  use: "sig",
};

const base64url = (bytes: Uint8Array | ArrayBuffer) =>
  Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString("base64url");

async function idToken(): Promise<string> {
  const encoder = new TextEncoder();
  const part = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));
  const now = Math.floor(Date.now() / 1000);
  const signed = `${part({ alg: "ES256", kid: "k" })}.${part({
    iss: ISSUER,
    aud: CLIENT,
    azp: CLIENT,
    sub: "alice",
    webid: WEBID,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKeys.privateKey,
    encoder.encode(signed),
  );
  return `${signed}.${base64url(signature)}`;
}

/** The provider, over fetch. */
async function provider(input: RequestInfo | URL): Promise<Response> {
  const { pathname } = new URL(input instanceof Request ? input.url : input);
  if (pathname === "/.well-known/openid-configuration") {
    return Response.json({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}authorize`,
      token_endpoint: `${ISSUER}token`,
      registration_endpoint: `${ISSUER}register`,
      jwks_uri: `${ISSUER}jwks`,
      grant_types_supported: ["authorization_code", "refresh_token"],
      response_types_supported: ["code"],
      scopes_supported: ["openid", "offline_access", "webid"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      code_challenge_methods_supported: ["S256"],
    });
  }
  if (pathname === "/jwks") return Response.json({ keys: [publicKey] });
  return Response.json({
    access_token: "access",
    token_type: "DPoP",
    refresh_token: "refresh",
    expires_in: 3600,
    id_token: await idToken(),
  });
}

/** The page loads anew at `url`, with the library's default session new. */
function load(url: string): void {
  page.session = new Session();
  window.history.replaceState(null, "", url);
}

/** Told the address, when the library sends the browser away. */
let leftFor: (url: string) => void;

/** Waits for the page to leave, with `start` running, and gives the address it left for. */
async function leaves(start: () => void): Promise<URL> {
  const left = new Promise<string>((resolve) => {
    leftFor = resolve;
  });
  start();
  return new URL(await left);
}

/** A login with the client, completed by the provider's sending the user back with a code. */
async function completedLogin() {
  load(SITE);
  const request = await leaves(() => {
    void createSessionClient().login({
      oidcIssuer: ISSUER,
      redirectUrl: SITE,
      clientName: "Solid Memo",
      clientId: CLIENT,
    });
  });
  load(`${SITE}?code=c&state=${request.searchParams.get("state")}&iss=${ISSUER}`);
  return createSessionClient().restore();
}

describe("createSessionClient, over the library's redirects", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn(provider));
    vi.spyOn(window.location, "href", "set").mockImplementation((url) => leftFor(url));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** A session from a login, whose silent restore then leaves the page at `from`; gives its request. */
  async function silentRestoreLeaves(from: string): Promise<URL> {
    await completedLogin();
    load(from);
    return leaves(() => {
      void createSessionClient().restore();
    });
  }

  it("reports a silent restore as one, keeping the page it left from", async () => {
    const request = await silentRestoreLeaves(STALE);
    expect(request.searchParams.get("prompt")).toBe("none");
    load(`${SITE}?code=c&state=${request.searchParams.get("state")}&iss=${ISSUER}`);
    await expect(createSessionClient().restore()).resolves.toEqual({
      webId: WEBID,
      fromLogin: false,
      restoredFrom: STALE,
    });
  });

  it("keeps a login after a silent restore the provider refused", async () => {
    const request = await silentRestoreLeaves(STALE);
    load(`${SITE}?error=login_required&state=${request.searchParams.get("state")}&iss=${ISSUER}`);
    await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: null });
    expect(window.localStorage.getItem("solidClientAuthn:currentUrl")).toBeNull();
    await expect(completedLogin()).resolves.toEqual({
      webId: WEBID,
      fromLogin: true,
      restoredFrom: null,
    });
    await expect(createSessionClient().sessionIssuer()).resolves.toBe(ISSUER);
  });

  it("keeps a login after a silent restore whose answer never came", async () => {
    await silentRestoreLeaves(STALE);
    await expect(completedLogin()).resolves.toEqual({
      webId: WEBID,
      fromLogin: true,
      restoredFrom: null,
    });
    await expect(createSessionClient().sessionIssuer()).resolves.toBe(ISSUER);
  });
});
