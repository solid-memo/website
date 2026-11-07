// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import * as oauth from "oauth4webapi";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { type SessionHarness, sessionContract } from "@solid-memo/solid/testing/contract/session";
import type { LoginOptions } from "@solid-memo/solid/client/interface";
import { navigate } from "./oidcBrowser";
import { PENDING_LOGIN_KEY, type PendingLogin } from "./oidcLogin";
import { OidcSession, setCurrentSession } from "./oidcSession";
import { clearSession, loadSession, type StoredSession } from "./oidcStore";
import { createSessionClient } from "./session";

/** The browser's IndexedDB, as the store module holds it: a session and registrations. */
const memory = vi.hoisted(() => ({
  session: undefined as StoredSession | undefined,
  registrations: new Map<string, unknown>(),
}));

vi.mock("./oidcStore", () => ({
  loadSession: vi.fn(async () => memory.session),
  saveSession: vi.fn(async (session: StoredSession) => {
    memory.session = session;
  }),
  clearSession: vi.fn(async () => {
    memory.session = undefined;
  }),
  replaceSession: vi.fn(async (read: StoredSession, next: StoredSession) => {
    const stored = memory.session;
    const same =
      stored?.refreshToken === read.refreshToken &&
      stored?.webId === read.webId &&
      stored?.issuer === read.issuer;
    if (same) memory.session = next;
    return same;
  }),
  loadRegistration: vi.fn(async (key: string) => memory.registrations.get(key)),
  saveRegistration: vi.fn(async (key: string, client: unknown) => {
    memory.registrations.set(key, client);
  }),
}));

// The test browser cannot leave the page: navigations are recorded.
vi.mock("./oidcBrowser", () => ({ navigate: vi.fn() }));

const ISSUER = "https://idp.example/";
const REDIRECT = `${window.location.origin}/`;
const CLIENT: oauth.Client = { client_id: "registered-1", token_endpoint_auth_method: "none" };
const WEBID = "https://alice.example/profile/card#me";

/** The metadata a provider at `issuer` serves, listing `scopes`. */
function metadataFor(
  issuer: string,
  scopes = ["openid", "webid", "offline_access"],
): oauth.AuthorizationServer {
  return {
    issuer,
    authorization_endpoint: `${issuer}authorize`,
    token_endpoint: `${issuer}token`,
    registration_endpoint: `${issuer}register`,
    jwks_uri: `${issuer}jwks`,
    scopes_supported: scopes,
    id_token_signing_alg_values_supported: ["ES256"],
    token_endpoint_auth_methods_supported: ["none"],
    dpop_signing_alg_values_supported: ["ES256"],
    authorization_response_iss_parameter_supported: true,
  };
}

const METADATA = metadataFor(ISSUER);

const providerKeys = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign", "verify"],
);
const dpopKeys = await oauth.generateKeyPair("ES256");

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array | ArrayBuffer) =>
  Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString("base64url");
/** A JWT's payload, or its header (part 0). */
const decode = (jwt: string, part = 1) =>
  JSON.parse(Buffer.from(jwt.split(".")[part] ?? "", "base64url").toString()) as Record<
    string,
    unknown
  >;

async function signedJwt(payload: Record<string, unknown>): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ alg: "ES256", typ: "JWT" })));
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    providerKeys.privateKey,
    encoder.encode(`${header}.${body}`),
  );
  return `${header}.${body}.${base64url(signature)}`;
}

/** A code the provider issued, and what the token request is checked against. */
interface Grant {
  nonce: string;
  clientId: string;
  challenge?: string;
}

/** The identity provider, over fetch, and the pod behind it. */
interface Provider {
  scopes?: string[];
  /** Metadata its discovery document says otherwise, or leaves out (undefined). */
  metadata: Record<string, unknown>;
  webId: string;
  /** Extra ID token claims, or ones taken away (undefined). */
  claims: Record<string, unknown>;
  grants: Map<string, Grant>;
  refreshTokens: Set<string>;
  /** What a refresh waits on before the token endpoint answers it. */
  refreshGate?: Promise<void>;
  /** A DPoP nonce the token endpoint asks for, once. */
  dpopNonce?: string;
  /** How long an access token lasts, in s; undefined when the provider does not say. */
  accessTtl: number | undefined;
  /** Whether it gives refresh tokens, and a new one on every refresh. */
  refreshTokensIssued: boolean;
  rotates: boolean;
  /** Whether it sends an ID token with the authorization code grant's tokens, and with a refresh's. */
  idToken: boolean;
  refreshIdToken: boolean;
  /** The ID tokens it issued, last one last. */
  idTokens: string[];
  failure?: Error;
  /** What the token endpoint fails with, unreachable. */
  tokenFailure?: Error;
  tokenRequests: {
    authorization: string | null;
    parameters: URLSearchParams;
    proof: Record<string, unknown>;
    proofHeader: Record<string, unknown>;
  }[];
  registrations: Record<string, unknown>[];
  issued: number;
  pod: typeof globalThis.fetch;
}

let provider: Provider;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

async function tokenEndpoint(init: RequestInit | undefined): Promise<Response> {
  if (provider.tokenFailure) throw provider.tokenFailure;
  const headers = new Headers(init?.headers);
  const proofHeader = headers.get("dpop");
  if (proofHeader === null) return json({ error: "invalid_dpop_proof" }, 400);
  const proof = decode(proofHeader);
  const parameters = new URLSearchParams(String(init?.body));
  provider.tokenRequests.push({
    authorization: headers.get("authorization"),
    parameters,
    proof,
    proofHeader: decode(proofHeader, 0),
  });
  if (provider.dpopNonce !== undefined && proof.nonce !== provider.dpopNonce) {
    return json({ error: "use_dpop_nonce" }, 400, { "dpop-nonce": provider.dpopNonce });
  }
  provider.issued += 1;
  const refreshToken = `refresh-${provider.issued}`;
  if (provider.refreshTokensIssued) provider.refreshTokens.add(refreshToken);
  const tokens = {
    access_token: `access-${provider.issued}`,
    token_type: "DPoP",
    expires_in: provider.accessTtl,
    refresh_token: provider.refreshTokensIssued ? refreshToken : undefined,
  };
  if (parameters.get("grant_type") === "refresh_token") {
    await provider.refreshGate;
    const used = parameters.get("refresh_token") ?? "";
    if (!provider.refreshTokens.has(used)) return json({ error: "invalid_grant" }, 400);
    const refreshed = provider.refreshIdToken
      ? { ...tokens, id_token: await idToken({ aud: parameters.get("client_id") }) }
      : tokens;
    if (!provider.rotates) return json({ ...refreshed, refresh_token: undefined });
    provider.refreshTokens.delete(used);
    return json(refreshed);
  }
  const grant = provider.grants.get(parameters.get("code") ?? "");
  if (grant === undefined) return json({ error: "invalid_grant" }, 400);
  provider.grants.delete(parameters.get("code") ?? "");
  const verifier = parameters.get("code_verifier") ?? "";
  if (
    grant.challenge !== undefined &&
    (await oauth.calculatePKCECodeChallenge(verifier)) !== grant.challenge
  ) {
    return json({ error: "invalid_grant" }, 400);
  }
  return json(
    provider.idToken
      ? { ...tokens, id_token: await idToken({ aud: grant.clientId, nonce: grant.nonce }) }
      : tokens,
  );
}

/** An ID token the provider issues, valid for 300 s, with `claims` besides its own. */
async function idToken(claims: Record<string, unknown>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signedJwt(
    Object.fromEntries(
      Object.entries({
        iss: ISSUER,
        sub: provider.webId,
        webid: provider.webId,
        iat: now,
        exp: now + 300,
        ...claims,
        ...provider.claims,
      }).filter(([, value]) => value !== undefined),
    ),
  );
  provider.idTokens.push(token);
  return token;
}

/** A Linked Web Storage storage, its authorization server the identity provider's (lwsAuth.ts). */
const STORAGE = "https://pod.example/alice/";
const POD_METADATA = "https://pod.example/.well-known/oauth-protected-resource";
const LWS_TOKEN_ENDPOINT = `${ISSUER}.well-known/lws/token`;

/** The LWS authorization server on the provider's origin, as the Community Solid Server LWS fork runs one. */
interface Lws {
  configuration: Record<string, unknown>;
  exchanges: { parameters: URLSearchParams; dpop: string | null }[];
  /** The storage's tokens it still takes. */
  valid: Set<string>;
  /** Whether the storage refuses every token. */
  refusesAll: boolean;
  issued: number;
}

let lws: Lws;

function exchangeEndpoint(init: RequestInit | undefined): Response {
  const parameters = new URLSearchParams(String(init?.body));
  lws.exchanges.push({ parameters, dpop: new Headers(init?.headers).get("dpop") });
  if (!provider.idTokens.includes(parameters.get("subject_token") ?? "")) {
    return json({ error: "invalid_grant" }, 400);
  }
  lws.issued += 1;
  const token = `lws-${lws.issued}`;
  lws.valid.add(token);
  return json({
    access_token: token,
    issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
    token_type: "Bearer",
    expires_in: 300,
  });
}

/**
 * The storage as the fork serves it: its protected resource metadata
 * and description, a request with one of its tokens within it, and a
 * 401 with its challenge to anything else, a DPoP request among them,
 * which it reads as no one's.
 */
function lwsPod(asUri = ISSUER) {
  return vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers);
    if (url.startsWith(`${POD_METADATA}/`)) {
      const resource = new URL(url.slice(POD_METADATA.length), STORAGE).href;
      return json({ resource, authorization_servers: [asUri] });
    }
    if (url === STORAGE && headers.get("accept") === "application/lws+cid") {
      return json({
        "@context": ["https://www.w3.org/ns/cid/v1", "https://www.w3.org/ns/lws/v1"],
        id: STORAGE,
        type: "Storage",
        service: [{ type: "StorageRoot", serviceEndpoint: STORAGE }],
      });
    }
    const [scheme, token] = (headers.get("authorization") ?? "").split(" ");
    const bearer = scheme === "Bearer";
    if (bearer && !lws.refusesAll && lws.valid.has(token ?? "") && url.startsWith(STORAGE)) {
      return new Response("ok");
    }
    return new Response(null, {
      status: 401,
      headers: {
        "www-authenticate": `Bearer resource_metadata="${POD_METADATA}${new URL(url).pathname}", as_uri="${asUri}", realm="${STORAGE}"${bearer ? ', error="invalid_token"' : ""}`,
        link: `<${STORAGE}>; rel="https://www.w3.org/ns/lws#storage"`,
      },
    });
  });
}

const fakeFetch: typeof globalThis.fetch = async (input, init) => {
  if (provider.failure) throw provider.failure;
  const url = input instanceof Request ? input.url : String(input);
  const discovery = url.match(/^(.*\/)\.well-known\/openid-configuration$/);
  if (discovery?.[1] !== undefined) {
    return json({ ...metadataFor(discovery[1], provider.scopes), ...provider.metadata });
  }
  if (url === `${ISSUER}register`) {
    const metadata = JSON.parse(String(init?.body)) as Record<string, unknown>;
    provider.registrations.push(metadata);
    const id = `registered-${provider.registrations.length}`;
    // Asked for no method, it registers a confidential client, as RFC 7591 says.
    const secret = metadata.token_endpoint_auth_method === undefined && {
      client_secret: `secret-${provider.registrations.length}`,
      client_secret_expires_at: 0,
      token_endpoint_auth_method: "client_secret_basic",
    };
    return json({ ...metadata, client_id: id, ...secret }, 201);
  }
  if (url === `${ISSUER}token`) return tokenEndpoint(init);
  if (url === `${ISSUER}.well-known/lws-configuration`) return json(lws.configuration);
  if (url === LWS_TOKEN_ENDPOINT) return exchangeEndpoint(init);
  return provider.pod(input, init);
};

/** A request as its sender made it, without the headers the session adds. */
function asSent(init: RequestInit | undefined): RequestInit | undefined {
  if (init?.headers === undefined) return init;
  const headers = new Headers(init.headers);
  headers.delete("authorization");
  headers.delete("dpop");
  const { headers: _, ...rest } = init;
  const sent = [...headers.keys()].length > 0 ? { ...rest, headers } : rest;
  return Object.keys(sent).length > 0 ? sent : undefined;
}

/** The authorization request the provider was sent to last, as its parameters. */
function lastAuthorization(): URLSearchParams {
  const url = vi.mocked(navigate).mock.lastCall?.[0];
  if (url === undefined) throw new Error("No navigation to the provider");
  return new URL(url).searchParams;
}

/** The provider logs the user in and sends them back to the redirect URL with a code. */
function sendBack(code = "code-1"): void {
  const request = lastAuthorization();
  provider.grants.set(code, {
    nonce: request.get("nonce") ?? "",
    clientId: request.get("client_id") ?? "",
    challenge: request.get("code_challenge") ?? "",
  });
  const back = new URL(request.get("redirect_uri") ?? "");
  back.search = new URLSearchParams({
    code,
    state: request.get("state") ?? "",
    iss: ISSUER,
  }).toString();
  window.history.replaceState(null, "", back.href);
}

/** A login under way in this tab, its code already issued, as the provider sends the user back. */
function pendingReturn(extra: Partial<PendingLogin> = {}): void {
  const pending: PendingLogin = {
    issuer: ISSUER,
    client: CLIENT,
    redirectUrl: REDIRECT,
    codeVerifier: "v".repeat(43),
    state: "state-1",
    nonce: "nonce-1",
    ...extra,
  };
  window.sessionStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify(pending));
  provider.grants.set("code-1", { nonce: "nonce-1", clientId: CLIENT.client_id });
  window.history.replaceState(
    null,
    "",
    `/?code=code-1&state=state-1&iss=${encodeURIComponent(ISSUER)}`,
  );
}

function storedSession(webId: string, refreshToken?: string): void {
  memory.session = {
    issuer: ISSUER,
    client: CLIENT,
    redirectUrl: REDIRECT,
    keys: dpopKeys,
    webId,
    ...(refreshToken !== undefined && { refreshToken }),
  };
  if (refreshToken !== undefined) provider.refreshTokens.add(refreshToken);
  provider.webId = webId;
}

let logins: LoginOptions[];

/**
 * The provider faked over fetch, the browser's storage and navigation
 * faked: what the contract sets up is the state a real browser would be
 * in, and the client runs its real flow against it.
 */
const harness: SessionHarness = {
  reset() {
    vi.clearAllMocks();
    memory.session = undefined;
    memory.registrations.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    setCurrentSession(null);
    logins = [];
    provider = {
      webId: WEBID,
      metadata: {},
      claims: {},
      grants: new Map(),
      refreshTokens: new Set(),
      accessTtl: 3600,
      refreshTokensIssued: true,
      rotates: true,
      idToken: true,
      refreshIdToken: false,
      idTokens: [],
      tokenRequests: [],
      registrations: [],
      issued: 0,
      pod: async () => new Response("pod"),
    };
    lws = {
      configuration: {
        issuer: ISSUER,
        token_endpoint: LWS_TOKEN_ENDPOINT,
        grant_types_supported: ["urn:ietf:params:oauth:grant-type:token-exchange"],
        subject_token_types_supported: ["urn:ietf:params:oauth:token-type:id_token"],
      },
      exchanges: [],
      valid: new Set(),
      refusesAll: false,
      issued: 0,
    };
    vi.stubGlobal("fetch", fakeFetch);
  },
  create() {
    const client = createSessionClient();
    return {
      ...client,
      // Recorded once the browser went to the provider with what the options say.
      async login(options) {
        await client.login(options);
        const request = lastAuthorization();
        const clientId = request.get("client_id");
        if (
          vi.mocked(navigate).mock.lastCall?.[0].startsWith(options.oidcIssuer) &&
          request.get("redirect_uri") === options.redirectUrl &&
          (options.clientId === undefined || clientId === options.clientId)
        ) {
          logins.push(options);
        }
      },
    };
  },
  returnFromLogin(webId) {
    provider.webId = webId;
    pendingReturn();
  },
  sessionToRestore(webId, from) {
    if (from === undefined) {
      storedSession(webId, "refresh-0");
    } else {
      storedSession(webId);
      pendingReturn({ silentFrom: from });
    }
  },
  sessionAt(issuer) {
    storedSession(WEBID);
    memory.session = { ...memory.session!, issuer };
  },
  requestSentTo(issuer) {
    pendingReturn({ issuer, state: "state-1" });
    return "state-1";
  },
  unaskedAnswer(search, awaiting) {
    if (awaiting) pendingReturn({ silentFrom: REDIRECT });
    window.history.replaceState(null, "", `/${search}`);
  },
  failToRestore(error) {
    storedSession(WEBID, "refresh-0");
    provider.failure = error;
  },
  currentSession(fetch, webId) {
    provider.pod = (input, init) => fetch(input, asSent(init));
    setCurrentSession(
      webId === undefined
        ? null
        : new OidcSession(
            METADATA,
            { client: CLIENT, keys: dpopKeys, webId },
            { accessToken: "access-current", expiresAt: Date.now() + 3_600_000 },
          ),
    );
  },
  logins: () => logins,
  logouts: () => vi.mocked(clearSession).mock.calls.length,
};

sessionContract(harness);

const LOGIN: LoginOptions = {
  oidcIssuer: ISSUER,
  redirectUrl: REDIRECT,
  clientName: "Test App",
};

describe("createSessionClient, over oauth4webapi", () => {
  beforeEach(() => harness.reset());

  /** Logs in through the provider and back, as the user would. */
  async function logIn(options: LoginOptions = LOGIN) {
    await createSessionClient().login(options);
    sendBack();
    const client = createSessionClient();
    return { client, restored: await client.restore() };
  }

  it("asks for a code with PKCE, state, nonce and consent, as the client the provider registered", async () => {
    await createSessionClient().login(LOGIN);
    const request = lastAuthorization();
    expect(Object.fromEntries(request)).toMatchObject({
      response_type: "code",
      client_id: "registered-1",
      redirect_uri: REDIRECT,
      scope: "openid offline_access webid",
      code_challenge_method: "S256",
      prompt: "consent",
    });
    expect(request.get("state")).toBeTruthy();
    expect(request.get("nonce")).toBeTruthy();
    expect(request.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(provider.registrations).toEqual([
      expect.objectContaining({
        client_name: "Test App",
        redirect_uris: [REDIRECT],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
      }),
    ]);
  });

  it("registers once per issuer and redirect URL", async () => {
    await createSessionClient().login(LOGIN);
    await createSessionClient().login(LOGIN);
    expect(provider.registrations).toHaveLength(1);
    expect(lastAuthorization().get("client_id")).toBe("registered-1");
  });

  it("names itself by its Client ID Document where the provider supports the webid scope", async () => {
    const clientId = `${REDIRECT}clientid.jsonld`;
    await createSessionClient().login({ ...LOGIN, clientId });
    expect(lastAuthorization().get("client_id")).toBe(clientId);
    expect(provider.registrations).toEqual([]);

    provider.scopes = ["openid", "offline_access"];
    await createSessionClient().login({ ...LOGIN, clientId });
    expect(lastAuthorization().get("client_id")).toBe("registered-1");
  });

  it("completes the login: DPoP-bound tokens, the URL cleaned, the session stored", async () => {
    window.history.replaceState(null, "", "/#/studio");
    await createSessionClient().login(LOGIN);
    sendBack();
    window.history.replaceState(null, "", `${window.location.href}#/studio`);
    const client = createSessionClient();
    await expect(client.restore()).resolves.toEqual({
      webId: WEBID,
      fromLogin: true,
      restoredFrom: null,
    });
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#/studio");
    expect(window.sessionStorage.getItem(PENDING_LOGIN_KEY)).toBeNull();
    expect(client.webId()).toBe(WEBID);
    const [request] = provider.tokenRequests;
    expect(request?.parameters.get("grant_type")).toBe("authorization_code");
    expect(request?.proof).toMatchObject({ htm: "POST", htu: `${ISSUER}token` });
    expect(memory.session).toMatchObject({
      issuer: ISSUER,
      client: { client_id: "registered-1" },
      webId: WEBID,
      refreshToken: "refresh-1",
    });
    expect(memory.session?.keys.privateKey.extractable).toBe(false);
  });

  it("takes the WebID from the subject when the ID token has no webid claim", async () => {
    provider.claims = { webid: undefined };
    await expect(logIn()).resolves.toMatchObject({ restored: { webId: WEBID } });
  });

  it("refuses an ID token that names no WebID", async () => {
    provider.claims = { webid: undefined, sub: "alice" };
    await expect(logIn()).rejects.toThrow("names no WebID");
  });

  it("refuses an ID token with another nonce, or for another audience", async () => {
    provider.claims = { nonce: "other" };
    await expect(logIn()).rejects.toThrow(/nonce/);
    harness.reset();
    provider.claims = { aud: "someone-else" };
    await expect(logIn()).rejects.toThrow(/aud/);
  });

  it("drops a redirect back whose state is not the one it sent, and still completes its own", async () => {
    await createSessionClient().login(LOGIN);
    sendBack();
    const own = window.location.href;
    window.history.replaceState(null, "", own.replace(/state=[^&]+/, "state=x"));
    await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: null });
    expect(window.location.search).toBe("");
    window.history.replaceState(null, "", own);
    await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: WEBID });
  });

  it("refuses a redirect back that does not name its provider, even from one that does not say it would", async () => {
    provider.metadata = { authorization_response_iss_parameter_supported: undefined };
    await createSessionClient().login(LOGIN);
    sendBack();
    window.history.replaceState(null, "", window.location.href.replace(/&iss=[^&]+/, ""));
    await expect(createSessionClient().restore()).rejects.toThrow(/"iss" \(issuer\) missing/);
    expect(provider.tokenRequests).toEqual([]);
  });

  it("refuses a redirect back that names another provider", async () => {
    await createSessionClient().login(LOGIN);
    sendBack();
    const other = encodeURIComponent("https://other.example/");
    window.history.replaceState(
      null,
      "",
      window.location.href.replace(/iss=[^&]+/, `iss=${other}`),
    );
    await expect(createSessionClient().restore()).rejects.toThrow(/"iss"/);
    expect(provider.tokenRequests).toEqual([]);
  });

  it("finds no one when the user declined at the provider", async () => {
    await createSessionClient().login(LOGIN);
    const request = lastAuthorization();
    window.history.replaceState(
      null,
      "",
      `/?error=access_denied&state=${request.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
    );
    await expect(createSessionClient().restore()).resolves.toEqual({
      webId: null,
      fromLogin: false,
      restoredFrom: null,
    });
    expect(window.location.search).toBe("");
  });

  it("retries a token request once with the DPoP nonce the provider asks for", async () => {
    provider.dpopNonce = "n-1";
    await expect(logIn()).resolves.toMatchObject({ restored: { webId: WEBID } });
    expect(provider.tokenRequests.map(({ proof }) => proof.nonce)).toEqual([undefined, "n-1"]);
  });

  it("fetches with the access token and a proof for each request", async () => {
    const pod = vi.fn(async () => new Response("ok"));
    const { client } = await logIn();
    provider.pod = pod;
    await client.fetch("https://pod.example/a/b?x=1#y", {
      method: "put",
      headers: { "content-type": "text/turtle" },
      body: "<> a <#t>.",
    });
    const [input, init] = pod.mock.calls[0] as unknown as [string, RequestInit];
    expect(input).toBe("https://pod.example/a/b?x=1#y");
    expect(init.body).toBe("<> a <#t>.");
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("text/turtle");
    expect(headers.get("authorization")).toBe("DPoP access-1");
    const proof = decode(headers.get("dpop") ?? "");
    expect(proof).toMatchObject({ htm: "PUT", htu: "https://pod.example/a/b" });
    expect(proof.ath).toEqual(expect.any(String));
  });

  it("keeps a Request's own headers", async () => {
    const pod = vi.fn(async () => new Response("ok"));
    const { client } = await logIn();
    provider.pod = pod;
    await client.fetch(
      new Request("https://pod.example/r", { headers: { accept: "text/turtle" } }),
    );
    const init = (pod.mock.calls[0] as unknown as [Request, RequestInit])[1];
    expect(new Headers(init.headers).get("accept")).toBe("text/turtle");
    expect(new Headers(init.headers).get("authorization")).toBe("DPoP access-1");
  });

  it("sends no token over plain HTTP but to this machine", async () => {
    const pod = vi.fn(async () => new Response("ok"));
    const { client } = await logIn();
    provider.pod = pod;
    await client.fetch("http://pod.example/a");
    await client.fetch("http://127.0.0.1:3999/a");
    expect(pod.mock.calls[0]).toEqual(["http://pod.example/a", undefined]);
    const init = (pod.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).get("authorization")).toBe("DPoP access-1");
  });

  it("retries a request once with the DPoP nonce the pod asks for, and passes other 401s on", async () => {
    const { client } = await logIn();
    const challenge = (error: string) =>
      new Response(null, {
        status: 401,
        headers: { "www-authenticate": `DPoP error="${error}"`, "dpop-nonce": "pod-nonce" },
      });
    const pod = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(challenge("use_dpop_nonce"))
      .mockResolvedValueOnce(new Response("ok"));
    provider.pod = pod;
    await expect(client.fetch("https://pod.example/a").then((r) => r.text())).resolves.toBe("ok");
    const second = (pod.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect(decode(new Headers(second.headers).get("dpop") ?? "").nonce).toBe("pod-nonce");

    provider.pod = vi.fn(async () => challenge("invalid_token"));
    await expect(client.fetch("https://pod.example/a")).resolves.toMatchObject({ status: 401 });
  });

  it("sends the caller's redirect mode on, the nonce retry's too, so authFetch's redirect: error holds", async () => {
    const { client } = await logIn();
    const pod = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 401,
          headers: { "www-authenticate": 'DPoP error="use_dpop_nonce"', "dpop-nonce": "n" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok"));
    provider.pod = pod;
    await client.fetch("https://pod.example/a", { method: "PUT", redirect: "error" });
    expect(pod.mock.calls.map(([input, init]) => [input, init?.redirect])).toEqual([
      ["https://pod.example/a", "error"],
      ["https://pod.example/a", "error"],
    ]);
  });

  it("refreshes the access token before it expires, and stores the rotated refresh token", async () => {
    provider.accessTtl = 10;
    const pod = vi.fn(async () => new Response("ok"));
    const { client } = await logIn();
    provider.pod = pod;
    await Promise.all([
      client.fetch("https://pod.example/a"),
      client.fetch("https://pod.example/b"),
    ]);
    expect(provider.tokenRequests.map(({ parameters }) => parameters.get("grant_type"))).toEqual([
      "authorization_code",
      "refresh_token",
    ]);
    const init = (pod.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).get("authorization")).toBe("DPoP access-2");
    expect(memory.session?.refreshToken).toBe("refresh-2");
  });

  it("ends the session when the provider refuses the refresh token", async () => {
    provider.accessTtl = 10;
    const pod = vi.fn(async () => new Response(null, { status: 401 }));
    const { client } = await logIn();
    provider.pod = pod;
    provider.refreshTokens.clear();
    await expect(client.fetch("https://pod.example/a")).resolves.toMatchObject({ status: 401 });
    expect(pod).toHaveBeenCalledWith("https://pod.example/a", undefined);
    expect(client.webId()).toBeUndefined();
    expect(memory.session).toBeUndefined();
  });

  it("ends the session once its access token expired with no refresh token to renew it", async () => {
    provider.refreshTokensIssued = false;
    provider.accessTtl = 10;
    const pod = vi.fn(async () => new Response(null, { status: 401 }));
    const { client } = await logIn();
    provider.pod = pod;
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await client.fetch("https://pod.example/a");
      expect(client.webId()).toBe(WEBID);
      vi.setSystemTime(Date.now() + 10_000);
      await expect(client.fetch("https://pod.example/b")).resolves.toMatchObject({ status: 401 });
    } finally {
      vi.useRealTimers();
    }
    expect(
      new Headers((pod.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get(
        "authorization",
      ),
    ).toBe("DPoP access-1");
    expect(pod).toHaveBeenLastCalledWith("https://pod.example/b", undefined);
    expect(client.webId()).toBeUndefined();
  });

  it("restores with the refresh token, without leaving the page", async () => {
    storedSession(WEBID, "refresh-0");
    const client = createSessionClient();
    await expect(client.restore()).resolves.toEqual({
      webId: WEBID,
      fromLogin: false,
      restoredFrom: null,
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(memory.session?.refreshToken).toBe("refresh-1");
    expect(provider.tokenRequests[0]?.proofHeader.jwk).toEqual(
      await crypto.subtle.exportKey("jwk", dpopKeys.publicKey).then(({ kty, crv, x, y }) => ({
        kty,
        crv,
        x,
        y,
      })),
    );
  });

  it("asks the provider silently when it has no refresh token, and reports the page it left", async () => {
    storedSession(WEBID);
    window.history.replaceState(null, "", "/#/studio");
    void createSessionClient().restore();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(lastAuthorization().get("prompt")).toBe("none");
    sendBack();
    await expect(createSessionClient().restore()).resolves.toEqual({
      webId: WEBID,
      fromLogin: false,
      restoredFrom: `${REDIRECT}#/studio`,
    });
  });

  it("asks the provider silently when it refuses the refresh token, and finds no one if it has no session either", async () => {
    storedSession(WEBID, "refresh-0");
    provider.refreshTokens.clear();
    void createSessionClient().restore();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    const request = lastAuthorization();
    window.history.replaceState(
      null,
      "",
      `/?error=login_required&state=${request.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
    );
    await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: null });
    expect(memory.session).toBeUndefined();
  });

  it("ends the stored session when its provider refuses the silent login", async () => {
    storedSession(WEBID);
    void createSessionClient().restore();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    const request = lastAuthorization();
    window.history.replaceState(
      null,
      "",
      `/?error=login_required&state=${request.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
    );
    await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: null });
    expect(memory.session).toBeUndefined();
  });

  it.each([
    ["a logout", () => undefined],
    [
      "a login at another provider",
      (session: StoredSession) => ({ ...session, issuer: "https://other-idp.example/" }),
    ],
  ])(
    "leaves the stored session as %s in another tab left it, when its provider refuses the silent login",
    async (_, replace) => {
      storedSession(WEBID);
      void createSessionClient().restore();
      await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
      const request = lastAuthorization();
      const other = memory.session && replace(memory.session);
      memory.session = other;
      window.history.replaceState(
        null,
        "",
        `/?error=login_required&state=${request.get("state")}&iss=${encodeURIComponent(ISSUER)}`,
      );
      await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: null });
      expect(memory.session).toBe(other);
    },
  );

  it.each([
    ["a logout", () => undefined],
    [
      "a login as someone else",
      (session: StoredSession) => ({ ...session, webId: "https://bob.example/profile/card#me" }),
    ],
    [
      "a login at another provider",
      (session: StoredSession) => ({ ...session, issuer: "https://other-idp.example/" }),
    ],
  ])(
    "stays logged out when %s in another tab replaces the session it restores",
    async (_, replace) => {
      storedSession(WEBID, "refresh-0");
      // The other tab writes just after this one read the stored session.
      vi.mocked(loadSession).mockImplementationOnce(async () => {
        const read = memory.session;
        memory.session = read && replace(read);
        return read;
      });
      await expect(createSessionClient().restore()).resolves.toEqual({
        webId: null,
        fromLogin: false,
        restoredFrom: null,
      });
      expect(navigate).not.toHaveBeenCalled();
      expect(provider.tokenRequests).toHaveLength(0);
    },
  );

  it("logs out in this browser: no session, no token sent", async () => {
    const pod = vi.fn(async () => new Response("ok"));
    const { client } = await logIn();
    provider.pod = pod;
    await client.logout();
    expect(client.webId()).toBeUndefined();
    expect(memory.session).toBeUndefined();
    await client.fetch("https://pod.example/a");
    expect(pod).toHaveBeenCalledWith("https://pod.example/a", undefined);
    await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: null });
  });

  /** A refresh that waits at the token endpoint until the returned function is called. */
  function holdRefresh(): () => void {
    let release = () => {};
    provider.refreshGate = new Promise((resolve) => {
      release = resolve;
    });
    return release;
  }

  /** The public key of the DPoP proof the pod was sent with in `call`. */
  function proofKey(pod: ReturnType<typeof vi.fn>, call: number): unknown {
    const init = (pod.mock.calls[call] as unknown as [string, RequestInit])[1];
    return decode(new Headers(init.headers).get("dpop") ?? "", 0).jwk;
  }

  const publicJwk = (keys: CryptoKeyPair) =>
    crypto.subtle.exportKey("jwk", keys.publicKey).then(({ kty, crv, x, y }) => ({
      kty,
      crv,
      x,
      y,
    }));

  it("logs out after a refresh under way, which cannot store the session again", async () => {
    provider.accessTtl = 10;
    const { client } = await logIn();
    const release = holdRefresh();
    const fetching = client.fetch("https://pod.example/a");
    await vi.waitFor(() => expect(provider.tokenRequests).toHaveLength(2));
    const loggingOut = client.logout();
    release();
    await Promise.all([fetching, loggingOut]);
    expect(memory.session).toBeUndefined();
    await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: null });
  });

  it("logs out at once while a refresh waits at the token endpoint, which cannot store the session again", async () => {
    provider.accessTtl = 10;
    const pod = vi.fn(async () => new Response("ok"));
    const { client } = await logIn();
    provider.pod = pod;
    const release = holdRefresh();
    const fetching = client.fetch("https://pod.example/a");
    await vi.waitFor(() => expect(provider.tokenRequests).toHaveLength(2));
    // The token endpoint has not answered: the logout does not wait for it.
    await client.logout();
    expect(client.webId()).toBeUndefined();
    expect(memory.session).toBeUndefined();
    release();
    await fetching;
    expect(memory.session).toBeUndefined();
    expect(pod).toHaveBeenCalledWith("https://pod.example/a", undefined);
    await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: null });
  });

  it("stays logged out when another tab logs out while the reload's refresh waits at the token endpoint", async () => {
    storedSession(WEBID, "refresh-0");
    const release = holdRefresh();
    const restoring = createSessionClient().restore();
    await vi.waitFor(() => expect(provider.tokenRequests).toHaveLength(1));
    await createSessionClient().logout();
    release();
    await expect(restoring).resolves.toEqual({ webId: null, fromLogin: false, restoredFrom: null });
    expect(memory.session).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("gives up a request the provider does not answer in time, and keeps the session", async () => {
    storedSession(WEBID, "refresh-0");
    const timeouts: AbortController[] = [];
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const timeout = new AbortController();
      timeouts.push(timeout);
      return timeout.signal;
    });
    onTestFinished(() => timeoutSpy.mockRestore());
    const signals: (AbortSignal | null | undefined)[] = [];
    const answering = fakeFetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal);
      return answering(input, init);
    });
    // The token endpoint stalls until its request is given up.
    provider.refreshGate = new Promise((_, reject) => {
      void vi
        .waitFor(() => expect(timeouts).toHaveLength(2))
        .then(() => {
          const timeout = timeouts[1]!;
          timeout.signal.addEventListener("abort", () => reject(timeout.signal.reason));
        });
    });
    const restoring = createSessionClient().restore();
    await vi.waitFor(() => expect(provider.tokenRequests).toHaveLength(1));
    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    // Discovery and the token request, each with a time limit of its own.
    expect(signals).toEqual([timeouts[0]?.signal, timeouts[1]?.signal]);
    timeouts[1]?.abort(new DOMException("The operation timed out.", "TimeoutError"));
    await expect(restoring).rejects.toMatchObject({ name: "TimeoutError" });
    expect(memory.session?.refreshToken).toBe("refresh-0");
  });

  it("gives every request of a login, registration and the code's token request too, a time limit of its own", async () => {
    const timeouts: AbortSignal[] = [];
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const { signal } = new AbortController();
      timeouts.push(signal);
      return signal;
    });
    onTestFinished(() => timeoutSpy.mockRestore());
    const requests: { url: string; signal: AbortSignal | null | undefined }[] = [];
    const answering = fakeFetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), signal: init?.signal });
      return answering(input, init);
    });
    await expect(logIn()).resolves.toMatchObject({ restored: { webId: WEBID } });
    expect(requests.map(({ url }) => url)).toEqual(
      expect.arrayContaining([`${ISSUER}register`, `${ISSUER}token`]),
    );
    expect(provider.tokenRequests[0]?.parameters.get("grant_type")).toBe("authorization_code");
    expect(timeoutSpy).toHaveBeenCalledTimes(requests.length);
    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    expect(requests.every(({ signal }, index) => signal === timeouts[index])).toBe(true);
  });

  it("signs with the key pair the refreshed tokens are bound to, after a login in another tab", async () => {
    provider.accessTtl = 10;
    const pod = vi.fn(async () => new Response("ok"));
    const { client } = await logIn();
    provider.pod = pod;
    await client.fetch("https://pod.example/a");
    // Another tab logged the same user in again, with a key pair of its own.
    const otherKeys = await oauth.generateKeyPair("ES256");
    storedSession(WEBID, "refresh-other");
    if (memory.session) memory.session.keys = otherKeys;
    await client.fetch("https://pod.example/b");
    expect(provider.tokenRequests.at(-1)?.parameters.get("refresh_token")).toBe("refresh-other");
    expect(proofKey(pod, 1)).toEqual(await publicJwk(otherKeys));
  });

  it("sends nothing to its provider, and keeps the session, after a login at another provider in another tab", async () => {
    provider.accessTtl = 10;
    const pod = vi.fn(async () => new Response("ok"));
    const { client } = await logIn();
    provider.pod = pod;
    // Another tab logged the same WebID in at another provider, as a client of its own.
    const other: StoredSession = {
      issuer: "https://other-idp.example/",
      client: { client_id: "other-1", client_secret: "other-secret" },
      redirectUrl: REDIRECT,
      keys: await oauth.generateKeyPair("ES256"),
      webId: WEBID,
      refreshToken: "refresh-other",
    };
    memory.session = other;
    await client.fetch("https://pod.example/a");
    expect(provider.tokenRequests).toHaveLength(1);
    expect(pod).toHaveBeenCalledWith("https://pod.example/a", undefined);
    expect(client.webId()).toBeUndefined();
    expect(memory.session).toBe(other);
  });

  it("stores a login after a refresh under way, which cannot store the older session over it", async () => {
    provider.accessTtl = 10;
    const { client } = await logIn();
    const release = holdRefresh();
    const fetching = client.fetch("https://pod.example/a");
    await vi.waitFor(() => expect(provider.tokenRequests).toHaveLength(2));
    const oldKeys = memory.session?.keys;
    // A new login comes back while that refresh waits at the token endpoint.
    await createSessionClient().login(LOGIN);
    sendBack("code-2");
    const restoring = createSessionClient().restore();
    await vi.waitFor(() => expect(provider.tokenRequests).toHaveLength(3));
    release();
    await Promise.all([fetching, restoring]);
    expect(memory.session?.keys).not.toBe(oldKeys);
    expect(memory.session?.refreshToken).toBe("refresh-3");
  });

  it("stays logged out when a refresh under way at the logout is refused", async () => {
    provider.accessTtl = 10;
    const pod = vi.fn(async () => new Response("ok"));
    const { client } = await logIn();
    provider.pod = pod;
    provider.refreshTokens.clear();
    const release = holdRefresh();
    const fetching = client.fetch("https://pod.example/a");
    await vi.waitFor(() => expect(provider.tokenRequests).toHaveLength(2));
    const loggingOut = client.logout();
    release();
    await Promise.all([fetching, loggingOut]);
    expect(client.webId()).toBeUndefined();
    expect(memory.session).toBeUndefined();
    expect(pod).toHaveBeenCalledWith("https://pod.example/a", undefined);
  });

  it("registers as a confidential client where the provider takes no public ones, and sends its secret by HTTP Basic", async () => {
    provider.metadata = { token_endpoint_auth_methods_supported: undefined };
    await expect(logIn()).resolves.toMatchObject({ restored: { webId: WEBID } });
    expect(provider.registrations[0]).not.toHaveProperty("token_endpoint_auth_method");
    const [scheme, credentials] = provider.tokenRequests[0]?.authorization?.split(" ") ?? [];
    expect(scheme).toBe("Basic");
    expect(
      atob(credentials ?? "")
        .split(":")
        .map(decodeURIComponent),
    ).toEqual(["registered-1", "secret-1"]);
  });

  it("sends a public client's token requests with no client authentication", async () => {
    await logIn();
    expect(provider.tokenRequests[0]?.authorization).toBeNull();
    expect(provider.tokenRequests[0]?.parameters.get("client_id")).toBe("registered-1");
  });

  it("refuses a provider with no authorization endpoint", async () => {
    provider.metadata = { authorization_endpoint: undefined };
    await expect(createSessionClient().login(LOGIN)).rejects.toThrow(
      `${ISSUER} has no authorization endpoint`,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    ["authorization endpoint", { authorization_endpoint: "javascript:alert(1)//" }],
    ["authorization endpoint", { authorization_endpoint: "not a URL" }],
    ["authorization endpoint", { authorization_endpoint: "http://idp.example/authorize" }],
    ["token endpoint", { token_endpoint: "http://idp.example/token" }],
    ["registration endpoint", { registration_endpoint: "data:text/plain,register" }],
  ])(
    "refuses a provider whose %s is neither https: nor on this machine",
    async (name, metadata) => {
      provider.metadata = metadata;
      await expect(createSessionClient().login(LOGIN)).rejects.toThrow(
        `${ISSUER}'s ${name} is neither https: nor on this machine`,
      );
      expect(navigate).not.toHaveBeenCalled();
      expect(provider.registrations).toEqual([]);
    },
  );

  it("refuses a provider whose token endpoint is on another origin", async () => {
    provider.metadata = { token_endpoint: "https://elsewhere.example/token" };
    await expect(createSessionClient().login(LOGIN)).rejects.toThrow(
      `${ISSUER}'s token endpoint is on another origin`,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("sends the browser to an authorization endpoint over http: on this machine", async () => {
    provider.metadata = { authorization_endpoint: "http://localhost:3000/authorize" };
    await createSessionClient().login(LOGIN);
    const url = new URL(vi.mocked(navigate).mock.lastCall?.[0] ?? "");
    expect(url.origin + url.pathname).toBe("http://localhost:3000/authorize");
  });

  it("restores no session from a provider that now names an endpoint a login refuses", async () => {
    storedSession(WEBID, "refresh-0");
    provider.metadata = { token_endpoint: "https://elsewhere.example/token" };
    await expect(createSessionClient().restore()).rejects.toThrow(/another origin/);
    expect(provider.tokenRequests).toEqual([]);
  });

  it("refuses tokens that come without an ID token", async () => {
    provider.idToken = false;
    await expect(logIn()).rejects.toThrow(/id_token/);
    expect(memory.session).toBeUndefined();
  });

  it("takes an http WebID from the subject", async () => {
    const webId = "http://alice.example/profile/card#me";
    provider.claims = { webid: undefined, sub: webId };
    await expect(logIn()).resolves.toMatchObject({ restored: { webId } });
  });

  it("keeps an access token whose lifetime the provider did not say", async () => {
    provider.accessTtl = undefined;
    const pod = vi.fn(async () => new Response("ok"));
    const { client } = await logIn();
    provider.pod = pod;
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 365 * 24 * 3_600_000 });
    try {
      await client.fetch("https://pod.example/a");
    } finally {
      vi.useRealTimers();
    }
    expect(provider.tokenRequests).toHaveLength(1);
    const init = (pod.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).get("authorization")).toBe("DPoP access-1");
  });

  it("sends an expired access token on when the provider gave no refresh token", async () => {
    provider.accessTtl = 10;
    provider.refreshTokensIssued = false;
    const pod = vi.fn(async () => new Response(null, { status: 401 }));
    const { client } = await logIn();
    provider.pod = pod;
    expect(memory.session).not.toHaveProperty("refreshToken");
    await expect(client.fetch("https://pod.example/a")).resolves.toMatchObject({ status: 401 });
    expect(provider.tokenRequests).toHaveLength(1);
    const init = (pod.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).get("authorization")).toBe("DPoP access-1");
    expect(client.webId()).toBe(WEBID);
  });

  it("keeps the refresh token when the provider does not rotate it", async () => {
    provider.rotates = false;
    storedSession(WEBID, "refresh-0");
    await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: WEBID });
    expect(memory.session?.refreshToken).toBe("refresh-0");
  });

  it("fails the restore, and keeps the session, when the token endpoint cannot be reached", async () => {
    storedSession(WEBID, "refresh-0");
    provider.tokenFailure = new TypeError("Failed to fetch");
    await expect(createSessionClient().restore()).rejects.toThrow("Failed to fetch");
    expect(memory.session?.refreshToken).toBe("refresh-0");

    provider.tokenFailure = undefined;
    await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: WEBID });
  });

  it("passes on a request to the pod that fails", async () => {
    const { client } = await logIn();
    provider.pod = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(client.fetch("https://pod.example/a")).rejects.toThrow("Failed to fetch");
  });
});

describe("createSessionClient, on a Linked Web Storage storage", () => {
  beforeEach(() => harness.reset());

  async function logIn() {
    await createSessionClient().login(LOGIN);
    sendBack();
    const client = createSessionClient();
    await client.restore();
    return client;
  }

  /** The requests the pod was sent, as their URL and Authorization; not the checks', for its metadata and description. */
  const sent = (pod: ReturnType<typeof lwsPod>) =>
    pod.mock.calls
      .filter(
        ([input, init]) =>
          !String(input).startsWith(POD_METADATA) &&
          new Headers(init?.headers).get("accept") !== "application/lws+cid",
      )
      .map(([input, init]) => [
        input instanceof Request ? input.url : String(input),
        new Headers(init?.headers).get("authorization"),
      ]);

  const RESOURCE = `${STORAGE}notes/a.ttl`;

  it("exchanges the ID token for the storage's token on its challenge, and sends the request again with it", async () => {
    const pod = lwsPod();
    const client = await logIn();
    provider.pod = pod;
    const response = await client.fetch(RESOURCE, {
      method: "PUT",
      headers: { "content-type": "text/turtle" },
      body: "<> a <#t>.",
      redirect: "error",
      signal: new AbortController().signal,
    });
    expect(response.status).toBe(200);
    expect(sent(pod)).toEqual([
      [RESOURCE, "DPoP access-1"],
      [RESOURCE, "Bearer lws-1"],
    ]);
    const retry = (pod.mock.calls.at(-1) as unknown as [string, RequestInit])[1];
    expect(retry).toMatchObject({ method: "PUT", body: "<> a <#t>.", redirect: "error" });
    expect(new Headers(retry.headers).get("content-type")).toBe("text/turtle");
    expect(new Headers(retry.headers).get("dpop")).toBeNull();
    const [exchange] = lws.exchanges;
    expect(Object.fromEntries(exchange!.parameters)).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      resource: STORAGE,
      subject_token: provider.idTokens[0],
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      client_id: "registered-1",
    });
    expect(exchange?.dpop).toBeNull();
  });

  it("sends the storage's token first afterwards, within the storage only", async () => {
    const pod = lwsPod();
    const client = await logIn();
    provider.pod = pod;
    await client.fetch(RESOURCE);
    pod.mockClear();
    await client.fetch(`${STORAGE}b`);
    await client.fetch("https://pod.example/bob/x");
    await client.fetch("https://pod.example/alicex");
    expect(sent(pod)).toEqual([
      [`${STORAGE}b`, "Bearer lws-1"],
      ["https://pod.example/bob/x", "DPoP access-1"],
      ["https://pod.example/alicex", "DPoP access-1"],
    ]);
    expect(lws.exchanges).toHaveLength(1);
  });

  it("exchanges once for requests that meet the storage together", async () => {
    const pod = lwsPod();
    const client = await logIn();
    provider.pod = pod;
    const answers = await Promise.all([client.fetch(RESOURCE), client.fetch(`${STORAGE}b`)]);
    expect(answers.map(({ status }) => status)).toEqual([200, 200]);
    expect(lws.exchanges).toHaveLength(1);
  });

  it("exchanges once more when the storage refuses a kept token, and passes the second refusal on", async () => {
    const pod = lwsPod();
    const client = await logIn();
    provider.pod = pod;
    await client.fetch(RESOURCE);
    lws.valid.clear();
    pod.mockClear();
    await expect(client.fetch(RESOURCE)).resolves.toMatchObject({ status: 200 });
    expect(sent(pod)).toEqual([
      [RESOURCE, "Bearer lws-1"],
      [RESOURCE, "Bearer lws-2"],
    ]);

    lws.refusesAll = true;
    pod.mockClear();
    const refused = await client.fetch(RESOURCE);
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toContain('error="invalid_token"');
    expect(sent(pod)).toEqual([
      [RESOURCE, "Bearer lws-2"],
      [RESOURCE, "Bearer lws-3"],
    ]);
    expect(lws.exchanges).toHaveLength(3);
  });

  it("passes the storage's refusal on when the authorization server refuses a new exchange", async () => {
    const pod = lwsPod();
    const client = await logIn();
    provider.pod = pod;
    await client.fetch(RESOURCE);
    lws.valid.clear();
    // The authorization server no longer takes the ID token.
    provider.idTokens = [];
    pod.mockClear();
    await expect(client.fetch(RESOURCE)).resolves.toMatchObject({ status: 401 });
    expect(sent(pod)).toEqual([[RESOURCE, "Bearer lws-1"]]);
    expect(lws.exchanges).toHaveLength(2);
  });

  it("asks the authorization server once for an ID token it refused, however many requests come", async () => {
    const pod = lwsPod();
    const client = await logIn();
    provider.pod = pod;
    // The authorization server takes no ID token of this session's.
    provider.idTokens = [];
    await expect(client.fetch(RESOURCE)).resolves.toMatchObject({ status: 401 });
    await expect(client.fetch(RESOURCE)).resolves.toMatchObject({ status: 401 });
    await expect(client.fetch(`${STORAGE}b`)).resolves.toMatchObject({ status: 401 });
    expect(lws.exchanges).toHaveLength(1);
    expect(sent(pod).map(([, authorization]) => authorization)).toEqual([
      "DPoP access-1",
      "DPoP access-1",
      "DPoP access-1",
    ]);
  });

  it("follows no redirect with the storage's token, which never leaves the storage", async () => {
    const client = await logIn();
    const pod = lwsPod();
    provider.pod = pod;
    await client.fetch(RESOURCE);
    // The storage sends a request to an address outside it, on its own origin.
    const redirecting = vi.fn<typeof globalThis.fetch>(async (input, init) =>
      String(input) === `${STORAGE}moved`
        ? new Response(null, { status: 302, headers: { location: "/bob/y" } })
        : pod(input, init),
    );
    provider.pod = redirecting;
    await expect(client.fetch(`${STORAGE}moved`)).resolves.toMatchObject({ status: 302 });
    await client.fetch(`${STORAGE}moved`, { redirect: "follow" });
    await client.fetch(`${STORAGE}moved`, { redirect: "error" });
    await client.fetch(new Request(`${STORAGE}moved`, { redirect: "error" }));
    expect(
      redirecting.mock.calls.map(([, init]) => [
        new Headers(init?.headers).get("authorization"),
        init?.redirect,
      ]),
    ).toEqual([
      ["Bearer lws-1", "manual"],
      ["Bearer lws-1", "manual"],
      ["Bearer lws-1", "error"],
      ["Bearer lws-1", "error"],
    ]);
    expect(redirecting.mock.calls.map(([input]) => String(input))).not.toContain(
      "https://pod.example/bob/y",
    );
  });

  it("sends a body it can't send again once, and keeps what it learned for the next request", async () => {
    const pod = lwsPod();
    const client = await logIn();
    provider.pod = pod;
    await expect(client.fetch(new Request(RESOURCE))).resolves.toMatchObject({ status: 401 });
    expect(lws.exchanges).toHaveLength(0);
    await expect(client.fetch(new Request(RESOURCE))).resolves.toMatchObject({ status: 200 });
    lws.valid.clear();
    await expect(client.fetch(new Request(RESOURCE))).resolves.toMatchObject({ status: 401 });
    expect(sent(pod).map(([, authorization]) => authorization)).toEqual([
      "DPoP access-1",
      "Bearer lws-1",
      "Bearer lws-1",
    ]);
  });

  it("sends the ID token to no authorization server but on its identity provider's origin", async () => {
    const pod = lwsPod("https://as.example/");
    const client = await logIn();
    provider.pod = pod;
    await expect(client.fetch(RESOURCE)).resolves.toMatchObject({ status: 401 });
    expect(lws.exchanges).toEqual([]);
    expect(pod.mock.calls.map(([input]) => String(input))).toEqual([
      RESOURCE,
      `${POD_METADATA}/alice/notes/a.ttl`,
    ]);
  });

  it("forgets the storages' tokens at logout", async () => {
    const pod = lwsPod();
    const client = await logIn();
    provider.pod = pod;
    await client.fetch(RESOURCE);
    await client.logout();
    const again = await logIn();
    pod.mockClear();
    await again.fetch(RESOURCE);
    expect(sent(pod)).toEqual([
      [RESOURCE, "DPoP access-2"],
      [RESOURCE, "Bearer lws-2"],
    ]);
  });

  it("exchanges the ID token a restore's refresh brought", async () => {
    provider.refreshIdToken = true;
    storedSession(WEBID, "refresh-0");
    const client = createSessionClient();
    await client.restore();
    provider.pod = lwsPod();
    await expect(client.fetch(RESOURCE)).resolves.toMatchObject({ status: 200 });
    expect(lws.exchanges[0]?.parameters.get("subject_token")).toBe(provider.idTokens[0]);
  });

  it("passes the challenge on when no refresh brings an ID token, and stops asking for one", async () => {
    storedSession(WEBID, "refresh-0");
    const client = createSessionClient();
    await client.restore();
    const pod = lwsPod();
    provider.pod = pod;
    await expect(client.fetch(RESOURCE)).resolves.toMatchObject({ status: 401 });
    await expect(client.fetch(RESOURCE)).resolves.toMatchObject({ status: 401 });
    expect(provider.tokenRequests.map(({ parameters }) => parameters.get("grant_type"))).toEqual([
      "refresh_token",
      "refresh_token",
    ]);
    expect(lws.exchanges).toEqual([]);
    expect(client.webId()).toBe(WEBID);
  });

  it("refreshes an ID token about to expire, and keeps the old one when the refresh brings none", async () => {
    provider.refreshIdToken = true;
    const client = await logIn();
    provider.pod = lwsPod();
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 280_000 });
    try {
      await client.fetch(RESOURCE);
      expect(lws.exchanges[0]?.parameters.get("subject_token")).toBe(provider.idTokens[1]);
    } finally {
      vi.useRealTimers();
    }

    harness.reset();
    const other = await logIn();
    provider.pod = lwsPod();
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 280_000 });
    try {
      await other.fetch(RESOURCE);
      expect(provider.tokenRequests).toHaveLength(2);
      expect(lws.exchanges[0]?.parameters.get("subject_token")).toBe(provider.idTokens[0]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("goes as the access token's request once the storage's token and the ID token expired", async () => {
    const pod = lwsPod();
    const client = await logIn();
    provider.pod = pod;
    await client.fetch(RESOURCE);
    pod.mockClear();
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 400_000 });
    try {
      await expect(client.fetch(RESOURCE)).resolves.toMatchObject({ status: 401 });
    } finally {
      vi.useRealTimers();
    }
    // The refresh that brought no ID token renewed the access token; the request had the one it began with.
    expect(sent(pod)).toEqual([[RESOURCE, "DPoP access-1"]]);
    expect(lws.exchanges).toHaveLength(1);
  });
});
