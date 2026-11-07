// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createHash, generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import dns from "node:dns";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import type { SessionClient } from "@solid-memo/solid/client/session";

/**
 * The signed-in tests' way in (docs/testing.md): a server's two accounts,
 * a token for each without a browser, and a sign-in client for the app's
 * authFetch that sends it as the app does, DPoP-bound. The browser's login
 * is the user journeys' to test.
 */

/** How a server makes accounts and gives out tokens. */
export type Login = "css" | "css-6" | "css-lws" | "nss" | "jss";

export interface Account {
  webId: string;
  /** The pod's root, ending in a slash. */
  pod: string;
  email: string;
  username: string;
  password: string;
  /** Client credentials, on a server that has them. */
  client?: { id: string; secret: string };
}

/** A server's instance that isn't open, with its accounts. */
export interface SignedInServer {
  id: string;
  tier: "blocking" | "advisory";
  name: string;
  /** Its root, which is its OIDC issuer too. */
  url: string;
  /** The CA of its certificate. */
  ca: string;
  login: Login;
  owner: Account;
  stranger: Account;
}

/** A signed-in user: a token, and the key it is bound to. */
export interface Session {
  webId: string;
  issuer: string;
  accessToken: string;
  key: DpopKey;
  /** The ID token and client of a login that gives them, which a Linked Web Storage server exchanges (cssLogin). */
  openId?: { idToken: string; clientId: string; expiresAt: number };
}

export interface DpopKey {
  privateKey: KeyObject;
  jwk: Record<string, unknown>;
}

export function newDpopKey(): DpopKey {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const { kty, crv, x, y } = publicKey.export({ format: "jwk" });
  return { privateKey, jwk: { kty, crv, x, y } };
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** A DPoP proof (RFC 9449) for one request: with `accessToken`, of a request that sends it. */
export function dpopProof(key: DpopKey, method: string, url: string, accessToken?: string): string {
  const target = new URL(url);
  target.search = "";
  target.hash = "";
  const header = base64url(JSON.stringify({ alg: "ES256", typ: "dpop+jwt", jwk: key.jwk }));
  const payload = base64url(
    JSON.stringify({
      htu: target.href,
      htm: method,
      jti: randomUUID(),
      iat: Math.floor(Date.now() / 1000),
      ...(accessToken !== undefined && {
        ath: createHash("sha256").update(accessToken).digest("base64url"),
      }),
    }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: key.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${base64url(signature)}`;
}

/**
 * The sign-in client over a session: what the app's authFetch is given in
 * the browser, there over a login, here over a token. Its fetch adds the
 * Authorization and DPoP headers to the request as the caller made it.
 */
export function sessionClient(session: Session): SessionClient {
  const never = (): never => {
    throw new Error("The tests' sign-in client has a session already, and keeps it.");
  };
  return {
    restore: never,
    requestIssuer: never,
    login: never,
    logout: never,
    sessionIssuer: async () => session.issuer,
    webId: () => session.webId,
    fetch: (input, init) => {
      const request = input instanceof Request ? input : undefined;
      const url = request?.url ?? String(input);
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers ?? request?.headers);
      headers.set("authorization", `DPoP ${session.accessToken}`);
      headers.set("dpop", dpopProof(session.key, method, url, session.accessToken));
      return globalThis.fetch(input, { ...init, headers });
    },
  };
}

/** The certificates of `ca` trusted by this process's requests, besides those it trusted. */
export function trustCa(ca: string): void {
  const trusted = getCACertificates("default");
  if (!trusted.includes(ca)) setDefaultCACertificates([...trusted, ca]);
}

/**
 * Names under localhost lead where localhost does, which not every
 * system's resolver knows: node-solid-server keeps each pod on one.
 */
let resolving = false;
export function resolveSubdomainsOfLocalhost(): void {
  if (resolving) return;
  resolving = true;
  const { lookup } = dns;
  dns.lookup = ((hostname: string, ...rest: unknown[]) =>
    (lookup as (...args: unknown[]) => unknown)(
      hostname.endsWith(".localhost") ? "localhost" : hostname,
      ...rest,
    )) as typeof dns.lookup;
}

const JSON_BODY = { "content-type": "application/json" };
const FORM_BODY = { "content-type": "application/x-www-form-urlencoded" };

/** The body of an answer that must have gone well, as JSON. */
async function answered<T>(what: string, response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new Error(`${what}: ${response.status} ${text.slice(0, 500)}`);
  return JSON.parse(text) as T;
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: "POST",
    headers: { ...JSON_BODY, ...headers },
    body: JSON.stringify(body),
  });

const basicAuth = ({ id, secret }: { id: string; secret: string }) =>
  `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64")}`;

function credentialsOf(username: string): Omit<Account, "webId" | "pod" | "client"> {
  return {
    username,
    email: `${username}@signed-in.example`,
    password: `Pw-1-${randomUUID()}`,
  };
}

/** An account on the Community Solid Server's account API from version 7. */
async function cssAccount(server: string, username: string): Promise<Account> {
  const credentials = credentialsOf(username);
  const { authorization } = await answered<{ authorization: string }>(
    "Creating the account",
    await post(`${server}.account/account/`, {}),
  );
  const headers = { authorization: `CSS-Account-Token ${authorization}` };
  const { controls } = await answered<{
    controls: {
      password: { create: string };
      account: { pod: string; clientCredentials: string };
    };
  }>("Reading the account", await fetch(`${server}.account/`, { headers }));
  await answered(
    "Adding the password login",
    await post(
      controls.password.create,
      { email: credentials.email, password: credentials.password },
      headers,
    ),
  );
  const { pod, webId } = await answered<{ pod: string; webId: string }>(
    "Creating the pod",
    await post(controls.account.pod, { name: username }, headers),
  );
  const client = await answered<{ id: string; secret: string }>(
    "Creating client credentials",
    await post(controls.account.clientCredentials, { name: username, webId }, headers),
  );
  return { ...credentials, webId, pod, client };
}

/** An account on the Community Solid Server 6's identity API. */
async function css6Account(server: string, username: string): Promise<Account> {
  const credentials = credentialsOf(username);
  const { email, password } = credentials;
  const { webId, podBaseUrl: pod } = await answered<{ webId: string; podBaseUrl: string }>(
    "Registering",
    await post(`${server}idp/register/`, {
      email,
      password,
      confirmPassword: password,
      createWebId: true,
      register: true,
      createPod: true,
      rootPod: false,
      podName: username,
    }),
  );
  const client = await answered<{ id: string; secret: string }>(
    "Creating client credentials",
    await post(`${server}idp/credentials/`, { email, password, name: username }),
  );
  return { ...credentials, webId, pod, client };
}

/** An account on the JavaScript Solid Server: with its pod. */
async function jssAccount(server: string, username: string): Promise<Account> {
  const credentials = credentialsOf(username);
  const { email, password } = credentials;
  const { webId, podUri: pod } = await answered<{ webId: string; podUri: string }>(
    "Creating the pod",
    await post(`${server}.pods`, { name: username, email, password }),
  );
  return { ...credentials, webId, pod };
}

/** An account on node-solid-server: its pod is the subdomain of its name. */
async function nssAccount(server: string, username: string): Promise<Account> {
  const credentials = credentialsOf(username);
  const { email, password } = credentials;
  const response = await fetch(`${server}api/accounts/new`, {
    method: "POST",
    redirect: "manual",
    headers: { ...FORM_BODY, accept: "text/html" },
    body: new URLSearchParams({
      username,
      password,
      repeat_password: password,
      name: username,
      email,
      acceptToc: "true",
    }),
  });
  if (response.status !== 302)
    throw new Error(`Registering: ${response.status} ${(await response.text()).slice(0, 500)}`);
  const { port } = new URL(server);
  const pod = `https://${username}.localhost:${port}/`;
  return { ...credentials, webId: `${pod}profile/card#me`, pod };
}

const ACCOUNT_MAKERS = {
  css: cssAccount,
  "css-6": css6Account,
  "css-lws": cssAccount,
  nss: nssAccount,
  jss: jssAccount,
} satisfies Record<Login, (server: string, username: string) => Promise<Account>>;

/** The server's two accounts: the owner's name isn't "owner", which node-solid-server keeps to itself. */
export async function createAccounts(
  login: Login,
  server: string,
): Promise<{ owner: Account; stranger: Account }> {
  return {
    owner: await ACCOUNT_MAKERS[login](server, "alice"),
    stranger: await ACCOUNT_MAKERS[login](server, "stranger"),
  };
}

/** A token by client credentials, bound to `key` (the Community Solid Server). */
async function clientCredentialsToken(
  server: string,
  account: Account,
  key: DpopKey,
): Promise<string> {
  const url = `${server}.oidc/token`;
  const { access_token } = await answered<{ access_token: string }>(
    "Asking for a token by client credentials",
    await fetch(url, {
      method: "POST",
      headers: {
        ...FORM_BODY,
        authorization: basicAuth(account.client!),
        dpop: dpopProof(key, "POST", url),
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "webid" }),
    }),
  );
  return access_token;
}

/** A token by email and password, bound to `key` (the JavaScript Solid Server's own endpoint for this). */
async function passwordToken(server: string, account: Account, key: DpopKey): Promise<string> {
  const url = `${server}idp/credentials`;
  const { access_token } = await answered<{ access_token: string }>(
    "Asking for a token by password",
    await post(
      url,
      { email: account.email, password: account.password },
      { dpop: dpopProof(key, "POST", url) },
    ),
  );
  return access_token;
}

/** The redirect an answer gives, resolved; throws if it gives none. */
function redirectOf(what: string, response: Response, base: string): URL {
  const location = response.headers.get("location");
  if (location === null) throw new Error(`${what}: ${response.status} and no redirect.`);
  return new URL(location, base);
}

/** Requests as a browser's, keeping cookies and following no redirect: a form's body if it is given one. */
function browser() {
  const cookies = new Map<string, string>();
  return async (url: string | URL, form?: Record<string, string>, json?: unknown) => {
    const response = await fetch(url, {
      method: form === undefined && json === undefined ? "GET" : "POST",
      redirect: "manual",
      headers: {
        accept: json === undefined ? "text/html" : "application/json",
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        ...(form !== undefined && FORM_BODY),
        ...(json !== undefined && JSON_BODY),
      },
      ...(form !== undefined && { body: new URLSearchParams(form) }),
      ...(json !== undefined && { body: JSON.stringify(json) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [name, ...value] = cookie.split(";")[0]!.split("=");
      cookies.set(name!, value.join("="));
    }
    return response;
  };
}

/**
 * A token through node-solid-server's authorization-code flow, its forms
 * filled in as a browser would (it has no other way to one): a client
 * registered, the login, the consent, the code redeemed.
 */
async function codeFlowToken(server: string, account: Account, key: DpopKey): Promise<string> {
  const redirectUri = "https://signed-in.example/callback";
  const client = await answered<{ client_id: string; client_secret: string }>(
    "Registering a client",
    await post(`${server}register`, {
      redirect_uris: [redirectUri],
      response_types: ["code"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "client_secret_basic",
      application_type: "web",
    }),
  );
  const params = {
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: redirectUri,
    scope: "openid webid",
    state: randomUUID(),
    nonce: randomUUID(),
  };
  const browse = browser();
  await browse(`${server}authorize?${new URLSearchParams(params).toString()}`);
  let next = redirectOf(
    "Logging in",
    await browse(`${server}login/password`, {
      ...params,
      username: account.username,
      password: account.password,
    }),
    server,
  );
  for (let step = 0; !next.href.startsWith(redirectUri); step++) {
    if (step === 5) throw new Error(`The login never came back, ending at ${next.href}.`);
    const answer =
      next.pathname === "/sharing"
        ? await browse(`${server}sharing`, {
            ...Object.fromEntries(next.searchParams),
            access_mode: "Read",
            consent: "true",
          })
        : await browse(next);
    next = redirectOf(`Following the login at ${next.pathname}`, answer, server);
  }
  const url = `${server}token`;
  const { access_token } = await answered<{ access_token: string }>(
    "Redeeming the code",
    await fetch(url, {
      method: "POST",
      headers: {
        ...FORM_BODY,
        authorization: `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64")}`,
        dpop: dpopProof(key, "POST", url),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: next.searchParams.get("code") ?? "",
        redirect_uri: redirectUri,
      }),
    }),
  );
  return access_token;
}

/**
 * The tokens of a login on the Community Solid Server's authorization-code
 * flow, its account API answering as its pages would: a client registered,
 * the login, the WebID picked, the consent, the code redeemed. Client
 * credentials give no ID token, which the Linked Web Storage exchange takes.
 */
async function cssLogin(
  server: string,
  account: Account,
  key: DpopKey,
): Promise<Pick<Session, "accessToken" | "openId">> {
  const redirectUri = "https://signed-in.example/callback";
  const provider = await answered<{
    registration_endpoint: string;
    authorization_endpoint: string;
    token_endpoint: string;
  }>("Reading the provider", await fetch(`${server}.well-known/openid-configuration`));
  const { client_id: clientId } = await answered<{ client_id: string }>(
    "Registering a client",
    await post(provider.registration_endpoint, {
      redirect_uris: [redirectUri],
      response_types: ["code"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "none",
      application_type: "web",
      scope: "openid webid",
    }),
  );
  const verifier = randomUUID() + randomUUID();
  const browse = browser();
  const follow = async (start: string) => {
    let next = new URL(start, server);
    for (let step = 0; step < 8; step++) {
      if (next.href.startsWith(redirectUri) || next.pathname.startsWith("/.account/")) return next;
      next = redirectOf(`Following the login at ${next.pathname}`, await browse(next), server);
    }
    throw new Error(`The login never came back, ending at ${next.href}.`);
  };
  const step = async (path: string, body: unknown) =>
    follow(
      (
        await answered<{ location: string }>(
          `Answering ${path}`,
          await browse(`${server}.account/${path}`, undefined, body),
        )
      ).location,
    );
  const authorize = new URL(provider.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid webid",
    state: randomUUID(),
    nonce: randomUUID(),
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  await follow(authorize.href);
  await step("login/password/", { email: account.email, password: account.password });
  await step("oidc/pick-webid/", { webId: account.webId });
  const back = await step("oidc/consent/", { remember: false });
  const { access_token: accessToken, id_token: idToken } = await answered<{
    access_token: string;
    id_token: string;
  }>(
    "Redeeming the code",
    await fetch(provider.token_endpoint, {
      method: "POST",
      headers: { ...FORM_BODY, dpop: dpopProof(key, "POST", provider.token_endpoint) },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code: back.searchParams.get("code") ?? "",
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    }),
  );
  const { exp } = JSON.parse(Buffer.from(idToken.split(".")[1]!, "base64url").toString()) as {
    exp: number;
  };
  return { accessToken, openId: { idToken, clientId, expiresAt: exp * 1000 } };
}

const TOKEN_MAKERS = {
  css: clientCredentialsToken,
  "css-6": clientCredentialsToken,
  nss: codeFlowToken,
  jss: passwordToken,
} satisfies Record<
  Exclude<Login, "css-lws">,
  (server: string, account: Account, key: DpopKey) => Promise<string>
>;

/** The account signed in, on a key of its own. */
export async function signIn(server: SignedInServer, account: Account): Promise<Session> {
  const key = newDpopKey();
  const signedIn = { webId: account.webId, issuer: server.url, key };
  if (server.login === "css-lws")
    return { ...signedIn, ...(await cssLogin(server.url, account, key)) };
  return {
    ...signedIn,
    accessToken: await TOKEN_MAKERS[server.login](server.url, account, key),
  };
}

/** The Bearer token the session's ID token is exchanged for, for `storage`, as the app's client asks for it (lwsAuth.ts). */
export async function exchangedToken(session: Session, storage: string): Promise<string> {
  const { access_token } = await answered<{ access_token: string }>(
    "Exchanging the ID token",
    await fetch(`${session.issuer}.well-known/lws/token`, {
      method: "POST",
      headers: FORM_BODY,
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        resource: storage,
        subject_token: session.openId!.idToken,
        subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      }),
    }),
  );
  return access_token;
}
