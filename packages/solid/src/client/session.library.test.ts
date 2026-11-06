// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { getDefaultSession, login } from "@inrupt/solid-client-authn-browser";
import { createSolidSessionGateway } from "../solidSessionGateway";
import { createSessionClient } from "./session";

/**
 * The client reads, from localStorage, what the library keeps there
 * (session.ts); the library is not mocked here, so a release that keeps
 * it under other keys fails these tests rather than every learner's
 * silent restore.
 */

const ISSUER = "https://issuer.example/";

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

describe("createSessionClient, over what the library keeps", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
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

  describe("a silent restore's answer", () => {
    const ATTEMPT = JSON.stringify({ issuer: ISSUER, at: 0 });

    /** The tab has left for the provider, which sends it back to `address`. */
    async function answered(address: (state: string) => string) {
      const request = await startLogin();
      window.localStorage.setItem(
        "solidClientAuthn:currentSession",
        getDefaultSession().info.sessionId,
      );
      window.sessionStorage.setItem("solid-memo:restore-attempt", ATTEMPT);
      window.sessionStorage.setItem("solid-memo:login-issuer", ISSUER);
      window.sessionStorage.setItem("solid-memo:provider-redirect", "restore");
      window.history.replaceState(null, "", address(request.searchParams.get("state")!));
      return createSolidSessionGateway({
        clientName: "Solid Memo",
        site: "https://memo.example/",
        client: createSessionClient(),
      });
    }

    const iss = encodeURIComponent(ISSUER);

    afterEach(() => {
      vi.restoreAllMocks();
      window.sessionStorage.clear();
      window.history.replaceState(null, "", "/");
    });

    it("does not lead to another silent request when it answers no request", async () => {
      const gateway = await answered(() => `/?error=login_required&iss=${iss}`);
      const fetched = vi.mocked(globalThis.fetch);
      fetched.mockClear();
      await expect(gateway.restore()).rejects.toMatchObject({ code: "loginNotStarted" });
      // The library set off nothing: no metadata fetched, on the app's address still.
      expect(fetched).not.toHaveBeenCalled();
      expect(window.location.search).toBe("");
      expect(window.sessionStorage.getItem("solid-memo:provider-redirect")).toBe("restore");
      // Another page could have sent it: the session stays.
      expect(window.localStorage.getItem("solidClientAuthn:currentSession")).not.toBeNull();
    });

    it("ends the session, with no other silent request, when the provider refuses the request", async () => {
      const gateway = await answered((state) => `/?error=login_required&state=${state}&iss=${iss}`);
      await expect(gateway.restore()).resolves.toBeNull();
      expect(window.location.origin).not.toBe(new URL(ISSUER).origin);
      expect(window.location.search).toBe("");
      expect(window.localStorage.getItem("solidClientAuthn:currentSession")).toBeNull();
    });
  });

  // Last: the library's session stays busy with a restore that never settles.
  it("gets past a provider whose metadata has no authorization endpoint", async () => {
    await startLogin();
    const sessionId = getDefaultSession().info.sessionId;
    window.localStorage.setItem("solidClientAuthn:currentSession", sessionId);
    // On a later visit the provider answers with metadata the library can't use.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const { authorization_endpoint: _, ...metadata } = await provider(
          `${ISSUER}.well-known/openid-configuration`,
        ).json();
        return Response.json(metadata);
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const gateway = createSolidSessionGateway({
        clientName: "Solid Memo",
        site: "https://memo.example/",
        client: createSessionClient(),
      });
      const given = expect(gateway.restore()).rejects.toMatchObject({ code: "restoreTimedOut" });
      await vi.advanceTimersByTimeAsync(60_000);
      await given;
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
    // The next visit has nothing to restore silently, so it does not repeat this.
    expect(window.localStorage.getItem("solidClientAuthn:currentSession")).toBeNull();
    await expect(createSessionClient().sessionIssuer()).resolves.toBeNull();
  });
});
