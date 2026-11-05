// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import * as oauth from "oauth4webapi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LwsTokens, type LwsSession } from "./lwsAuth";

// What the Community Solid Server LWS fork (8.0.0-alpha.3) answers, as seen on it.
const ISSUER = "http://127.0.0.1:3989/";
const STORAGE = `${ISSUER}alice/`;
const RESOURCE = new URL(`${STORAGE}notes/a.ttl`);
const TOKEN_ENDPOINT = `${ISSUER}.well-known/lws/token`;
const CONFIGURATION = `${ISSUER}.well-known/lws-configuration`;
const CHALLENGE = `Bearer as_uri="${ISSUER}", realm="${STORAGE}"`;
const STORAGE_LINK = `<${STORAGE}>; rel="https://www.w3.org/ns/lws#storage"`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The fork's metadata, as its /.well-known/lws-configuration serves it. */
const configuration = (): Record<string, unknown> => ({
  issuer: ISSUER,
  token_endpoint: TOKEN_ENDPOINT,
  jwks_uri: `${ISSUER}.well-known/lws/jwks`,
  grant_types_supported: ["urn:ietf:params:oauth:grant-type:token-exchange"],
  token_endpoint_auth_methods_supported: ["none"],
  response_types_supported: ["token"],
  claims_supported: ["sub", "iss", "client_id", "aud", "exp", "iat", "jti"],
  subject_token_types_supported: [
    "urn:ietf:params:oauth:token-type:jwt",
    "urn:ietf:params:oauth:token-type:id_token",
  ],
  subject_identifier_types_supported: ["https", "did:key"],
});

/** The fork's storage description (application/lws+cid). */
const description = (): Record<string, unknown> => ({
  "@context": ["https://www.w3.org/ns/cid/v1", "https://www.w3.org/ns/lws/v1"],
  id: STORAGE,
  type: "Storage",
  service: [
    { type: "NotificationService", serviceEndpoint: "https://elsewhere.example/notify" },
    { type: "StorageRoot", serviceEndpoint: STORAGE },
  ],
});

/** The servers, by URL: what each answers. */
let routes: Map<string, (init: RequestInit | undefined) => Response | Promise<Response>>;
let requests: { url: string; init: RequestInit | undefined }[];
let issued: number;

function exchangeAnswer(): Response {
  issued += 1;
  return json({
    access_token: `lws-${issued}`,
    issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
    token_type: "Bearer",
    expires_in: 300,
  });
}

const session: LwsSession = {
  issuer: ISSUER,
  client: () => ({ client_id: "client-1", token_endpoint_auth_method: "none" }),
  idToken: vi.fn(async () => "id-token-1"),
};

beforeEach(() => {
  issued = 0;
  requests = [];
  vi.mocked(session.idToken).mockClear();
  routes = new Map([
    [CONFIGURATION, () => json(configuration())],
    [STORAGE, () => json(description())],
    [TOKEN_ENDPOINT, exchangeAnswer],
  ]);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    const route = routes.get(url);
    return route ? route(init) : new Response(null, { status: 404 });
  });
});

/** The fork's 401 to `url`, with `challenge` and `link` as its headers. */
function unauthorized(url = RESOURCE, challenge = CHALLENGE, link = STORAGE_LINK, status = 401) {
  const headers = new Headers({ "www-authenticate": challenge });
  if (link !== "") headers.set("link", link);
  const response = new Response(null, { status, headers });
  Object.defineProperty(response, "url", { value: url.href });
  return response;
}

/** The response's challenges, as oauth4webapi parses them for the session's request (oidcSession.ts). */
async function challengesOf(response: Response): Promise<oauth.WWWAuthenticateChallenge[]> {
  try {
    await oauth.protectedResourceRequest("t", "GET", RESOURCE, undefined, null, {
      [oauth.allowInsecureRequests]: true,
      [oauth.customFetch]: async () => response,
    });
  } catch (error) {
    if (error instanceof oauth.WWWAuthenticateChallengeError) return error.cause;
  }
  throw new Error("No challenge");
}

async function discovered(tokens = new LwsTokens(session), response = unauthorized()) {
  return tokens.discover(RESOURCE, response, await challengesOf(response));
}

describe("LwsTokens, on the fork's answers", () => {
  it("checks the storage and its authorization server, then exchanges the ID token for its token", async () => {
    const tokens = new LwsTokens(session);
    const storage = await discovered(tokens);
    expect(storage).toMatchObject({
      uri: STORAGE,
      as: { issuer: ISSUER, token_endpoint: TOKEN_ENDPOINT },
    });
    expect(
      requests.map(({ url, init }) => [url, new Headers(init?.headers).get("accept")]),
    ).toEqual([
      [STORAGE, "application/lws+cid"],
      [CONFIGURATION, "application/json"],
    ]);
    expect(requests.every(({ init }) => init?.credentials === "omit")).toBe(true);
    expect(requests.every(({ init }) => init?.redirect === "manual")).toBe(true);

    await expect(tokens.token(storage!)).resolves.toEqual({ value: "lws-1", exchanged: true });
    const exchange = requests.at(-1)!;
    expect(exchange.url).toBe(TOKEN_ENDPOINT);
    expect(Object.fromEntries(new URLSearchParams(String(exchange.init?.body)))).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      resource: STORAGE,
      subject_token: "id-token-1",
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      client_id: "client-1",
    });
    const headers = new Headers(exchange.init?.headers);
    expect(headers.get("dpop")).toBeNull();
    expect(headers.get("authorization")).toBeNull();

    // Kept: the next request has it at once.
    await expect(tokens.token(storage!)).resolves.toEqual({ value: "lws-1", exchanged: false });
    expect(issued).toBe(1);
  });

  it("knows a storage it checked by the URLs within it, the innermost first", async () => {
    const tokens = new LwsTokens(session);
    expect(tokens.storageOf(RESOURCE)).toBeUndefined();
    const storage = await discovered(tokens);
    expect(tokens.storageOf(RESOURCE)).toBe(storage);
    expect(tokens.storageOf(new URL(STORAGE))).toBe(storage);
    expect(tokens.storageOf(new URL(`${ISSUER}alice`))).toBeUndefined();
    expect(tokens.storageOf(new URL(`${ISSUER}alicex/a`))).toBeUndefined();
    expect(tokens.storageOf(new URL("http://localhost:3989/alice/a"))).toBeUndefined();

    // A storage inside another, as a server may have one.
    const inner = `${STORAGE}notes`;
    routes.set(inner, () => json(description()));
    const innerStorage = await discovered(
      tokens,
      unauthorized(RESOURCE, CHALLENGE, `<${inner}>; rel="https://www.w3.org/ns/lws#storage"`),
    );
    expect(innerStorage?.uri).toBe(inner);
    expect(tokens.storageOf(RESOURCE)).toBe(innerStorage);
    expect(tokens.storageOf(new URL(inner))).toBe(innerStorage);
    expect(tokens.storageOf(new URL(`${STORAGE}other`))).toBe(storage);

    // Checked by two requests at once: one storage.
    const twice = new LwsTokens(session);
    const [one, other] = await Promise.all([discovered(twice), discovered(twice)]);
    expect(one).toBe(other);

    // Met again: the storage as it was, with nothing asked.
    requests = [];
    await expect(discovered(tokens)).resolves.toBe(storage);
    expect(requests).toEqual([]);
  });

  it("exchanges once for the requests that wait together, and again 30 seconds before the token expires", async () => {
    const tokens = new LwsTokens(session);
    const storage = (await discovered(tokens))!;
    const [first, second] = await Promise.all([tokens.token(storage), tokens.token(storage)]);
    expect(first).toEqual({ value: "lws-1", exchanged: true });
    expect(second).toEqual(first);
    expect(issued).toBe(1);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 270_000 });
    try {
      await expect(tokens.token(storage)).resolves.toEqual({ value: "lws-2", exchanged: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a token whose lifetime the authorization server did not say", async () => {
    routes.set(TOKEN_ENDPOINT, () => json({ access_token: "lws-forever", token_type: "Bearer" }));
    const tokens = new LwsTokens(session);
    const storage = (await discovered(tokens))!;
    await tokens.token(storage);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 365 * 24 * 3_600_000 });
    try {
      await expect(tokens.token(storage)).resolves.toEqual({
        value: "lws-forever",
        exchanged: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("forgets a refused token, but not a newer one", async () => {
    const tokens = new LwsTokens(session);
    const storage = (await discovered(tokens))!;
    await tokens.token(storage);
    tokens.forget(storage, "lws-0");
    await expect(tokens.token(storage)).resolves.toEqual({ value: "lws-1", exchanged: false });
    tokens.forget(storage, "lws-1");
    await expect(tokens.token(storage)).resolves.toEqual({ value: "lws-2", exchanged: true });
  });

  it("exchanges nothing without an ID token", async () => {
    vi.mocked(session.idToken).mockResolvedValueOnce(undefined);
    const tokens = new LwsTokens(session);
    const storage = (await discovered(tokens))!;
    await expect(tokens.token(storage)).resolves.toBeUndefined();
    expect(requests.map(({ url }) => url)).not.toContain(TOKEN_ENDPOINT);
  });

  it.each([
    ["refuses the exchange", () => json({ error: "invalid_target" }, 400)],
    ["gives a token of another type", () => json({ access_token: "x", token_type: "DPoP" })],
  ])("has no token when the authorization server %s", async (_, answer) => {
    routes.set(TOKEN_ENDPOINT, answer);
    const tokens = new LwsTokens(session);
    const storage = (await discovered(tokens))!;
    await expect(tokens.token(storage)).resolves.toBeUndefined();
    expect(storage.token).toBeUndefined();
  });

  it("sends an ID token the authorization server refused no more, until the session has another", async () => {
    routes.set(TOKEN_ENDPOINT, () => json({ error: "invalid_grant" }, 400));
    const tokens = new LwsTokens(session);
    const storage = (await discovered(tokens))!;
    const exchanges = () => requests.filter(({ url }) => url === TOKEN_ENDPOINT).length;
    await expect(tokens.token(storage)).resolves.toBeUndefined();
    await expect(tokens.token(storage)).resolves.toBeUndefined();
    expect(exchanges()).toBe(1);
    vi.mocked(session.idToken).mockResolvedValueOnce("id-token-2");
    await expect(tokens.token(storage)).resolves.toBeUndefined();
    expect(exchanges()).toBe(2);
  });

  it("stops waiting for an exchange when the caller aborts, which goes on for the others", async () => {
    let answer: () => void = () => {};
    routes.set(
      TOKEN_ENDPOINT,
      () =>
        new Promise((resolve) => {
          answer = () => resolve(exchangeAnswer());
        }),
    );
    const tokens = new LwsTokens(session);
    const storage = (await discovered(tokens))!;
    const caller = new AbortController();
    const waiting = tokens.token(storage, caller.signal);
    const other = tokens.token(storage, new AbortController().signal);
    await vi.waitFor(() => expect(requests.at(-1)?.url).toBe(TOKEN_ENDPOINT));
    caller.abort(new DOMException("Aborted", "AbortError"));
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    answer();
    await expect(other).resolves.toEqual({ value: "lws-1", exchanged: true });

    const aborted = AbortSignal.abort(new DOMException("Aborted", "AbortError"));
    storage.token = undefined;
    await expect(tokens.token(storage, aborted)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("gives the checks' requests the caller's signal, with a time limit", async () => {
    const caller = new AbortController();
    const response = unauthorized();
    await new LwsTokens(session).discover(
      RESOURCE,
      response,
      await challengesOf(response),
      caller.signal,
    );
    const signal = requests[0]?.init?.signal;
    expect(signal?.aborted).toBe(false);
    caller.abort();
    expect(signal?.aborted).toBe(true);
  });

  it("rejects when a check's request cannot be made", async () => {
    routes.set(STORAGE, () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(discovered()).rejects.toThrow("Failed to fetch");
  });
});

describe("LwsTokens, on LWS's resource metadata (RFC 9728)", () => {
  const METADATA = `${ISSUER}.well-known/oauth-protected-resource/alice/notes/a.ttl`;
  const specChallenge = (metadata = METADATA) =>
    `Bearer resource_metadata="${metadata}", error="invalid_token"`;

  beforeEach(() => {
    routes.set(METADATA, () => json({ resource: RESOURCE.href, authorization_servers: [ISSUER] }));
  });

  it("takes the authorization server from the metadata that names the requested URI", async () => {
    const response = unauthorized(RESOURCE, specChallenge());
    const storage = await new LwsTokens(session).discover(
      new URL(`${RESOURCE.href}#it`),
      response,
      await challengesOf(response),
    );
    expect(storage?.as.issuer).toBe(ISSUER);
    expect(requests[0]?.url).toBe(METADATA);
  });

  it.each([
    ["is on another origin", "http://localhost:3989/meta", undefined],
    ["isn't a URL", "/relative", undefined],
    ["can't be read", `${ISSUER}missing`, undefined],
    ["names another resource", METADATA, { resource: STORAGE, authorization_servers: [ISSUER] }],
    ["names no authorization server", METADATA, { resource: RESOURCE.href }],
    [
      "names one that isn't a string",
      METADATA,
      { resource: RESOURCE.href, authorization_servers: [1] },
    ],
    ["isn't an object", METADATA, [RESOURCE.href]],
    ["isn't JSON", METADATA, "not JSON"],
  ])("refuses resource metadata that %s", async (_, metadata, body) => {
    if (body !== undefined) {
      routes.set(METADATA, () => (typeof body === "string" ? new Response(body) : json(body)));
    }
    const response = unauthorized(RESOURCE, specChallenge(metadata));
    await expect(
      new LwsTokens(session).discover(RESOURCE, response, await challengesOf(response)),
    ).resolves.toBeUndefined();
    expect(requests.map(({ url }) => url)).not.toContain(STORAGE);
  });
});

describe("LwsTokens, refusing", () => {
  /** A JSON body past 64 KiB, its length said in advance or not. */
  const oversized = (said: boolean, document = description()) => {
    const body = JSON.stringify({ ...document, padding: "x".repeat(64 * 1024) });
    return () =>
      said
        ? new Response(body, { headers: { "content-length": String(body.length) } })
        : new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(body));
                controller.close();
              },
            }),
          );
  };

  it.each([
    ["says it is", true],
    ["turns out to be", false],
  ])("reads no storage description that %s past 64 KiB", async (_, said) => {
    routes.set(STORAGE, oversized(said));
    await expect(discovered()).resolves.toBeUndefined();
    expect(requests.map(({ url }) => url)).toEqual([STORAGE]);
  });

  it("reads no resource metadata or authorization server metadata past 64 KiB", async () => {
    const metadata = `${ISSUER}.well-known/oauth-protected-resource/alice/notes/a.ttl`;
    routes.set(
      metadata,
      oversized(true, { resource: RESOURCE.href, authorization_servers: [ISSUER] }),
    );
    const response = unauthorized(RESOURCE, `Bearer resource_metadata="${metadata}"`);
    await expect(
      new LwsTokens(session).discover(RESOURCE, response, await challengesOf(response)),
    ).resolves.toBeUndefined();
    routes.set(CONFIGURATION, oversized(false, configuration()));
    await expect(discovered()).resolves.toBeUndefined();
  });

  it.each([
    ["no LWS challenge", unauthorized(RESOURCE, 'DPoP error="invalid_token"')],
    [
      "a Bearer challenge that names no authorization server",
      unauthorized(RESOURCE, 'Bearer realm="x"'),
    ],
    ["a status other than 401", unauthorized(RESOURCE, CHALLENGE, STORAGE_LINK, 403)],
    ["no storage link", unauthorized(RESOURCE, CHALLENGE, "")],
    [
      "a storage the URL isn't in",
      unauthorized(RESOURCE, CHALLENGE, `<${ISSUER}bob/>; rel="https://www.w3.org/ns/lws#storage"`),
    ],
    [
      "a storage on another origin",
      unauthorized(
        RESOURCE,
        CHALLENGE,
        '<http://localhost:3989/alice/>; rel="https://www.w3.org/ns/lws#storage"',
      ),
    ],
    [
      "a storage that only begins the same",
      unauthorized(
        new URL(`${ISSUER}alicex/a`),
        CHALLENGE,
        `<${ISSUER}alice>; rel="https://www.w3.org/ns/lws#storage"`,
      ),
    ],
  ])("asks nothing on %s", async (_, response) => {
    await expect(
      new LwsTokens(session).discover(
        new URL(response.url),
        response,
        await challengesOf(response),
      ),
    ).resolves.toBeUndefined();
    expect(requests).toEqual([]);
  });

  it.each([
    ["another origin", `Bearer as_uri="https://as.example/"`],
    ["no URL", `Bearer as_uri="not a URL"`],
  ])(
    "sends nothing to an authorization server on %s than the identity provider's",
    async (_, challenge) => {
      await expect(
        discovered(undefined, unauthorized(RESOURCE, challenge)),
      ).resolves.toBeUndefined();
      expect(requests).toEqual([]);
    },
  );

  it.each([
    ["isn't a Storage", { ...description(), type: "Container" }],
    ["has no services", { ...description(), service: undefined }],
    [
      "has no StorageRoot",
      { ...description(), service: [{ type: "Other", serviceEndpoint: STORAGE }] },
    ],
    [
      "has a StorageRoot on another origin",
      {
        ...description(),
        service: [{ type: "StorageRoot", serviceEndpoint: "https://x.example/" }],
      },
    ],
    [
      "has a StorageRoot without an endpoint",
      { ...description(), service: [{ type: "StorageRoot" }] },
    ],
    ["has a service that isn't an object", { ...description(), service: ["StorageRoot"] }],
  ])("refuses a storage whose description %s", async (_, body) => {
    routes.set(STORAGE, () => json(body));
    await expect(discovered()).resolves.toBeUndefined();
    expect(requests.map(({ url }) => url)).toEqual([STORAGE]);
  });

  it("takes a description whose types are lists, or full IRIs", async () => {
    routes.set(STORAGE, () =>
      json({
        ...description(),
        type: ["https://www.w3.org/ns/lws#Storage"],
        service: [
          { type: ["https://www.w3.org/ns/lws#StorageRoot", "Other"], serviceEndpoint: STORAGE },
        ],
      }),
    );
    await expect(discovered()).resolves.toMatchObject({ uri: STORAGE });
  });

  it.each([
    ["names another issuer", { issuer: "http://127.0.0.1:3989/other" }],
    ["names no issuer", { issuer: undefined }],
    ["has no token endpoint", { token_endpoint: undefined }],
    ["has a token endpoint on another origin", { token_endpoint: "http://localhost:3989/token" }],
    [
      "has a token endpoint over plain HTTP elsewhere",
      { token_endpoint: "http://as.example/token" },
    ],
    ["supports no token exchange", { grant_types_supported: ["client_credentials"] }],
    [
      "takes no ID token",
      { subject_token_types_supported: ["urn:ietf:params:oauth:token-type:jwt"] },
    ],
  ])("refuses an authorization server whose metadata %s", async (_, change) => {
    routes.set(CONFIGURATION, () => json({ ...configuration(), ...change }));
    await expect(discovered()).resolves.toBeUndefined();
  });

  it("takes metadata that leaves out what it supports, and an issuer without its path's slash", async () => {
    routes.set(CONFIGURATION, () =>
      json({
        ...configuration(),
        issuer: "http://127.0.0.1:3989",
        grant_types_supported: undefined,
        subject_token_types_supported: undefined,
      }),
    );
    await expect(discovered()).resolves.toMatchObject({ as: { issuer: "http://127.0.0.1:3989" } });
  });

  it("finds the metadata of an issuer with a path where RFC 8414 puts it", async () => {
    const issuer = `${ISSUER}tenant`;
    const configured = `${ISSUER}.well-known/lws-configuration/tenant`;
    routes.set(configured, () => json({ ...configuration(), issuer }));
    await expect(
      discovered(undefined, unauthorized(RESOURCE, `Bearer as_uri="${issuer}"`)),
    ).resolves.toMatchObject({ as: { issuer } });
    expect(requests.map(({ url }) => url)).toContain(configured);
  });
});
