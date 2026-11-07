// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultSession, login, Session } from "@inrupt/solid-client-authn-browser";
import { AppError } from "@solid-memo/domain/appError";
import { LOGIN_ISSUER_KEY, createSolidSessionGateway } from "../solidSessionGateway";
import { type LoginOptions, ReadLimitError } from "./interface";
import { PROVIDER_REDIRECT_KEY } from "./providerRedirect";
import {
  ACCESS_CONTROL_LIMITS,
  limitedFetch,
  PROFILE_LIMITS,
  refusalOf,
  RELEASE_LIMITS,
} from "./readLimits";
import { createSessionClient } from "./session";

/**
 * The client reads, from localStorage, what the library keeps there
 * (session.ts); the library is not mocked here, so a release that keeps
 * it under other keys fails these tests rather than every learner's
 * silent restore.
 */

const ISSUER = "https://issuer.example/";
const CARD = "https://alice.example/profile/card";
const PROFILE_WEBID = `${CARD}#me`;
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
    webId: PROFILE_WEBID,
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

  describe("after a silent restore that never came back left its URL behind", () => {
    const STALE_URL = "https://memo.example/#/study";

    it("names the issuer of the login completed, which the library keeps no session ID for", async () => {
      sendBack(await startLogin());
      window.localStorage.setItem(CURRENT_URL_KEY, STALE_URL);
      const client = createSessionClient();
      await expect(client.restore()).resolves.toEqual({
        webId: PROFILE_WEBID,
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

const SITE = `${window.location.origin}/`;
const HOME = "https://home.example/";
const OTHER = "https://other.example/";
const CLIENT = "https://memo.example/client-id.jsonld";
const WEBID = "https://pod.example/me#i";

/** How long a token lasts: the library refreshes it before this has passed. */
const TOKEN_SECONDS = 3600;

/** The real clock's timeout: the library's refresh timers run on a fake one. */
const { setTimeout: realSetTimeout } = globalThis;

/** A moment for what a refresh that came due would do: it signs a proof before it sends one. */
const settled = () => new Promise((resolve) => realSetTimeout(resolve, 100));

/** Brings every refresh that is scheduled due, at a moment the test chooses. */
const refreshesComeDue = () => vi.advanceTimersByTimeAsync(TOKEN_SECONDS * 1000);

const base64url = (bytes: ArrayBuffer | string): string =>
  Buffer.from(bytes as ArrayBuffer).toString("base64url");

/** A request with a token that the library sent. */
interface TokenRequest {
  to: string;
  refreshToken: string | null;
}

/** Two providers that answer as the library expects, token requests noted down. */
async function providers() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const key = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const idToken = async (issuer: string): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    const signed = [
      base64url(JSON.stringify({ alg: "ES256", kid: "k" })),
      base64url(
        JSON.stringify({
          iss: issuer,
          aud: CLIENT,
          azp: CLIENT,
          sub: "u",
          webid: WEBID,
          iat: now,
          exp: now + 3600,
        }),
      ),
    ].join(".");
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keys.privateKey,
      new TextEncoder().encode(signed),
    );
    return `${signed}.${base64url(signature)}`;
  };
  const world = {
    tokenRequests: [] as TokenRequest[],
    metadataReads: 0,
    /** What each issuer's metadata says besides its usual fields. */
    metadataOf: {} as Record<string, Record<string, unknown>>,
  };
  const answer = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const issuer = url.startsWith(HOME) ? HOME : OTHER;
    if (url.endsWith("/.well-known/openid-configuration")) {
      world.metadataReads += 1;
      return Response.json({
        issuer,
        authorization_endpoint: `${issuer}authorize`,
        token_endpoint: `${issuer}token`,
        registration_endpoint: `${issuer}register`,
        jwks_uri: `${issuer}jwks`,
        grant_types_supported: ["authorization_code", "refresh_token"],
        response_types_supported: ["code"],
        scopes_supported: ["openid", "offline_access", "webid"],
        ...world.metadataOf[issuer],
      });
    }
    if (url.endsWith("jwks")) {
      return Response.json({ keys: [{ ...key, kid: "k", alg: "ES256", use: "sig" }] });
    }
    world.tokenRequests.push({
      to: url,
      refreshToken: new URLSearchParams(String(init?.body)).get("refresh_token"),
    });
    return Response.json({
      access_token: "access",
      token_type: "DPoP",
      id_token: await idToken(issuer),
      refresh_token: `refresh-of-${issuer}`,
      expires_in: TOKEN_SECONDS,
    });
  };
  vi.stubGlobal("fetch", vi.fn(answer));
  return world;
}

const asked = (oidcIssuer: string, handleRedirect: (url: string) => void) =>
  ({
    oidcIssuer,
    redirectUrl: SITE,
    clientId: CLIENT,
    clientName: "Solid Memo",
    handleRedirect,
  }) as LoginOptions;

/** The address the provider sends the browser back to, once a login has left for it. */
async function answerTo(
  start: (handleRedirect: (url: string) => void) => unknown,
  issuer: string,
): Promise<string> {
  const handleRedirect = vi.fn<(url: string) => void>();
  void start(handleRedirect);
  await vi.waitFor(() => expect(handleRedirect).toHaveBeenCalledOnce());
  const state = new URL(handleRedirect.mock.calls[0]![0]).searchParams.get("state")!;
  return `${SITE}?code=c&state=${state}&iss=${encodeURIComponent(issuer)}`;
}

/** The session the library keeps for a login request's state. */
function storedSessionOfState(state: string): unknown {
  const stored = window.localStorage.getItem(`solidClientAuthenticationUser:${state}`);
  return (JSON.parse(stored ?? "{}") as { sessionId?: unknown }).sessionId;
}

/** A tab logged in at `HOME` under its own session, with its refresh timer running. */
async function tabLoggedInAtHome(): Promise<Session> {
  const tab = new Session();
  const url = await answerTo(
    (handleRedirect) => tab.login({ ...asked(HOME, handleRedirect) }),
    HOME,
  );
  await tab.handleIncomingRedirect({ url });
  expect(tab.info.isLoggedIn).toBe(true);
  return tab;
}

describe("createSessionClient, with the library's own sessions", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    // Drops the refresh timers of the sessions a test left logged in.
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("sends nothing of another tab's session to the provider of a later login", async () => {
    const world = await providers();
    const otherTab = await tabLoggedInAtHome();
    // This tab restored into the other's session and logged out, staying on the page.
    getDefaultSession().info.sessionId = otherTab.info.sessionId;
    world.tokenRequests.length = 0;

    const client = createSessionClient();
    const url = await answerTo(
      (handleRedirect) => client.login(asked(OTHER, handleRedirect)),
      OTHER,
    );
    // The other tab's refresh is due: it reads its session, which holds no
    // provider any more, and so stops at that read.
    const kept = `solidClientAuthenticationUser:${otherTab.info.sessionId}`;
    const reads = vi.spyOn(window.localStorage, "getItem");
    await refreshesComeDue();
    await vi.waitFor(() => expect(reads).toHaveBeenCalledWith(kept));
    expect(window.localStorage.getItem(kept)).toBeNull();
    expect(world.tokenRequests).toEqual([]);

    // The login itself completes, and is what a silent restore goes on from.
    const state = new URL(url).searchParams.get("state")!;
    await expect(client.requestIssuer(state)).resolves.toBe(OTHER);
    await getDefaultSession().handleIncomingRedirect({ url });
    expect(getDefaultSession().info.sessionId).not.toBe(otherTab.info.sessionId);
    await expect(client.sessionIssuer()).resolves.toBe(OTHER);

    // A new tab restores that session silently, at that session's provider.
    const leftFor = vi.spyOn(window.location, "href", "set").mockImplementation(() => undefined);
    void new Session().handleIncomingRedirect({ restorePreviousSession: true, url: SITE });
    await vi.waitFor(() => expect(leftFor).toHaveBeenCalledOnce());
    const silent = new URL(leftFor.mock.calls[0]![0]);
    expect(silent.origin).toBe(new URL(OTHER).origin);
    expect(silent.searchParams.get("prompt")).toBe("none");
    expect(storedSessionOfState(silent.searchParams.get("state")!)).toBe(
      getDefaultSession().info.sessionId,
    );
  });

  it.each([
    ["token_endpoint", "https://other.example//home.example/token"],
    ["token_endpoint", "https://other.example/.//home.example/token"],
    ["token_endpoint", "https://other.example/\\\\home.example/token"],
    ["token_endpoint", ["https://other.example//home.example/token"]],
    ["authorization_endpoint", "https://other.example//home.example/authorize"],
    ["jwks_uri", "https://other.example//home.example/jwks"],
  ])("refuses a login at a provider whose %s is %j", async (field, address) => {
    const world = await providers();
    world.metadataOf[OTHER] = { [field]: address };
    const handleRedirect = vi.fn<(url: string) => void>();
    const refused = await createSessionClient()
      .login(asked(OTHER, handleRedirect))
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(AppError);
    expect(refused).toMatchObject({ code: "loginProviderRefused" });
    expect(handleRedirect).not.toHaveBeenCalled();
  });

  it("refuses a provider's metadata at a refresh, sending it nothing", async () => {
    const world = await providers();
    await createSessionClient().restore();
    await tabLoggedInAtHome();
    world.tokenRequests.length = 0;
    world.metadataReads = 0;
    world.metadataOf[HOME] = { token_endpoint: "https://home.example//pod.example/private/" };
    await refreshesComeDue();
    await vi.waitFor(() => expect(world.metadataReads).toBeGreaterThan(0));
    await settled();
    expect(world.tokenRequests).toEqual([]);
  });

  it("keeps refreshing at a provider whose metadata is in order", async () => {
    const world = await providers();
    await createSessionClient().restore();
    await tabLoggedInAtHome();
    world.tokenRequests.length = 0;
    await refreshesComeDue();
    await vi.waitFor(() =>
      expect(world.tokenRequests.at(-1)?.refreshToken).toBe(`refresh-of-${HOME}`),
    );
    expect(world.tokenRequests.at(-1)?.to).toBe(`${HOME}token`);
  });

  it("gives every other answer as it came, one that is no metadata unread", async () => {
    const next = vi.fn(
      async (input: RequestInfo | URL) =>
        new Response(String(input).endsWith("configuration") ? "not JSON" : "body"),
    );
    vi.stubGlobal("fetch", next);
    await createSessionClient().restore();
    await createSessionClient().restore();
    const metadata = await fetch(`${OTHER}.well-known/openid-configuration`);
    await expect(metadata.text()).resolves.toBe("not JSON");
    await expect((await fetch(`${OTHER}doc`)).text()).resolves.toBe("body");
    // Guarded once, however many clients are made.
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("refuses no metadata for a field that is no endpoint, or no address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          service_documentation: "https://other.example//docs",
          token_endpoint: "not an address",
        }),
      ),
    );
    await createSessionClient().restore();
    const metadata = await fetch(`${OTHER}.well-known/openid-configuration`);
    expect(metadata.ok).toBe(true);
  });

  describe("over a document of any size at the metadata's path", () => {
    const AT_PATH = `${OTHER}.well-known/openid-configuration`;

    /** An answer with no end, noting how much of it was read and whether it was canceled. */
    function endlessAnswer(headers?: HeadersInit) {
      const source = { bytes: 0, canceled: false };
      const chunk = new Uint8Array(64 * 1024);
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          source.bytes += chunk.byteLength;
          controller.enqueue(chunk);
        },
        cancel() {
          source.canceled = true;
        },
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(body, { headers })),
      );
      return source;
    }

    it("refuses one past the limits unread, for all a read's own limits allow", async () => {
      const source = endlessAnswer();
      await createSessionClient().restore();
      await expect(limitedFetch(fetch, RELEASE_LIMITS)(AT_PATH)).rejects.toBeInstanceOf(
        ReadLimitError,
      );
      expect(source.bytes).toBeLessThan(2 * PROFILE_LIMITS.bytes);
      await vi.waitFor(() => expect(source.canceled).toBe(true));
    });

    it("refuses one past the limits by its length alone", async () => {
      const source = endlessAnswer({ "Content-Length": String(PROFILE_LIMITS.bytes + 1) });
      await createSessionClient().restore();
      await expect(fetch(AT_PATH)).rejects.toBeInstanceOf(ReadLimitError);
      await vi.waitFor(() => expect(source.canceled).toBe(true));
    });

    it("leaves a smaller one to the limits of the read that asked for it", async () => {
      const text = "x".repeat(ACCESS_CONTROL_LIMITS.bytes + 1);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(text)),
      );
      await createSessionClient().restore();
      const held = await limitedFetch(fetch, ACCESS_CONTROL_LIMITS)(AT_PATH);
      await expect(held.text()).rejects.toThrow();
      expect(refusalOf(held)).toBeInstanceOf(ReadLimitError);
      await expect((await fetch(AT_PATH)).text()).resolves.toBe(text);
    });
  });
});

// Last in the file: the library's default session stays busy with a restore that never settles.
describe("createSessionClient, over a restore that never settles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("gets past a provider whose metadata has no authorization endpoint", async () => {
    // The tests above leave the library's default session logged in.
    await getDefaultSession().logout({ logoutType: "app" });
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
