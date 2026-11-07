// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { getDefaultSession, login } from "@inrupt/solid-client-authn-browser";
import { LOGIN_ISSUER_KEY, createSolidSessionGateway } from "../solidSessionGateway";
import { PROVIDER_REDIRECT_KEY } from "./providerRedirect";
import { createSessionClient } from "./session";

/**
 * The client reads, from localStorage, what the library keeps there
 * (session.ts); the library is not mocked here, so a release that keeps
 * it under other keys fails these tests rather than every learner's
 * silent restore.
 */

const ISSUER = "https://issuer.example/";
const CARD = "https://alice.example/profile/card";
const WEBID = `${CARD}#me`;
const CURRENT_SESSION_KEY = "solidClientAuthn:currentSession";
const CURRENT_URL_KEY = "solidClientAuthn:currentUrl";

/** The provider: its metadata, and a dynamic registration. */
function provider(input: RequestInfo | URL): Response {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.pathname === "/.well-known/openid-configuration") {
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
  return Response.json({ client_id: "registered", redirect_uris: ["https://memo.example/"] });
}

/** Starts a login with the library itself, and gives the address it sends the browser to. */
async function startLogin(): Promise<URL> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => provider(input)),
  );
  const handleRedirect = vi.fn<(url: string) => void>();
  void login({
    oidcIssuer: ISSUER,
    redirectUrl: "https://memo.example/",
    clientName: "Solid Memo",
    handleRedirect,
  });
  await vi.waitFor(() => expect(handleRedirect).toHaveBeenCalledOnce());
  return new URL(handleRedirect.mock.calls[0]![0]);
}

/**
 * The provider sends the user back to this tab with a code, and the
 * library's own session handles it. Only the token exchange is stood in
 * for, as it takes a provider that signs tokens.
 */
function sendBack(request: URL): void {
  const { clientAuthentication } = getDefaultSession() as unknown as {
    clientAuthentication: { handleIncomingRedirect: () => Promise<unknown> };
  };
  vi.spyOn(clientAuthentication, "handleIncomingRedirect").mockResolvedValue({
    isLoggedIn: true,
    webId: WEBID,
    sessionId: getDefaultSession().info.sessionId,
  });
  const state = request.searchParams.get("state")!;
  window.sessionStorage.setItem(PROVIDER_REDIRECT_KEY, "login");
  window.sessionStorage.setItem(LOGIN_ISSUER_KEY, ISSUER);
  window.history.replaceState(
    null,
    "",
    `/?code=c&state=${state}&iss=${encodeURIComponent(ISSUER)}`,
  );
}

describe("createSessionClient, over what the library keeps", () => {
  afterEach(async () => {
    await getDefaultSession().logout();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("names the issuer a login request the library sent went to, by its state", async () => {
    const request = await startLogin();
    expect(request.origin + request.pathname).toBe(`${ISSUER}authorize`);
    const state = request.searchParams.get("state")!;
    await expect(createSessionClient().requestIssuer(state)).resolves.toBe(ISSUER);
    await expect(createSessionClient().requestIssuer(`${state}-other`)).resolves.toBeNull();
  });

  it("names the issuer of the session the library would restore silently", async () => {
    await startLogin();
    // What the library keeps once the login completes, with the session's ID.
    window.localStorage.setItem(
      "solidClientAuthn:currentSession",
      getDefaultSession().info.sessionId,
    );
    await expect(createSessionClient().sessionIssuer()).resolves.toBe(ISSUER);
  });

  describe("after a silent restore that never came back left its URL behind", () => {
    const STALE_URL = "https://memo.example/#/study";

    it("names the issuer of the login completed, which the library keeps no session ID for", async () => {
      sendBack(await startLogin());
      window.localStorage.setItem(CURRENT_URL_KEY, STALE_URL);
      const client = createSessionClient();
      await expect(client.restore()).resolves.toEqual({
        webId: WEBID,
        fromLogin: false,
        restoredFrom: STALE_URL,
      });
      expect(window.localStorage.getItem(CURRENT_SESSION_KEY)).toBeNull();
      await expect(client.sessionIssuer()).resolves.toBe(ISSUER);
    });

    it("refuses that login when the WebID's profile lists another issuer", async () => {
      sendBack(await startLogin());
      window.localStorage.setItem(CURRENT_URL_KEY, STALE_URL);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          const profile = new Response(
            "<#me> <http://www.w3.org/ns/solid/terms#oidcIssuer> <https://other.example/> .\n",
            { headers: { "Content-Type": "text/turtle" } },
          );
          Object.defineProperty(profile, "url", { value: CARD });
          return profile;
        }),
      );
      const gateway = createSolidSessionGateway({
        clientName: "Solid Memo",
        site: "https://memo.example/",
        client: createSessionClient(),
      });
      await expect(gateway.restore()).rejects.toMatchObject({ code: "webIdIssuerNotListed" });
      expect(getDefaultSession().info.isLoggedIn).toBe(false);
    });
  });
});
