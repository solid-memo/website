// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import * as oauth from "oauth4webapi";
import { type ReadLimits, ReadLimitError } from "@solid-memo/solid/client/interface";
import { linkTargets } from "@solid-memo/solid/client/linkHeader";
import { limitedFetch } from "@solid-memo/solid/client/readLimits";
import { clientAuth, requestOptions, secureEndpoint, timeLimited } from "./oidcLogin";

/**
 * Linked Web Storage (LWS) authorization for a session that logged in
 * with Solid-OIDC (docs/solid-memo-client.md#linked-web-storage): a
 * storage that answers 401 with an LWS challenge is checked as LWS
 * Protocol 1.0's "Discovery Validation by a Client" says, then the
 * session's ID token is exchanged (RFC 8693) at the storage's
 * authorization server for a Bearer token whose audience is the storage.
 * The tokens are kept per storage, in memory, for the session's life;
 * oidcSession.ts sends them.
 *
 * Two rules of the app's own, both because a Bearer token, unlike a DPoP
 * one, works for whoever holds it:
 *
 * - The ID token goes only to an authorization server whose issuer is
 *   the session's own, but for a trailing slash. Its audience is the app,
 *   so any authorization server that trusts that provider would take it;
 *   a server that names its own authorization server, or another issuer
 *   on the provider's origin, never gets it.
 * - A storage's token goes only to URLs within that storage (same origin,
 *   and the storage's path as a prefix), never elsewhere on its server.
 */

/** The Link relation naming the storage a resource is in. */
const LWS_STORAGE = "https://www.w3.org/ns/lws#storage";

const TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange";
const ID_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";

/** How long before it expires a storage's token is exchanged anew, in ms. */
const RENEW_MARGIN = 30_000;

/** A storage the app talks LWS with: where it is, its authorization server, and its token. */
export interface LwsStorage {
  readonly uri: string;
  readonly as: oauth.AuthorizationServer;
  token?: { value: string; expiresAt: number };
  exchanging?: Promise<string | undefined>;
  /** The ID token the authorization server refused for this storage: not sent again. */
  refused?: string;
}

/** What LWS authorization needs of the session: its provider, client and ID token. */
export interface LwsSession {
  /** The issuer of the session's identity provider. */
  readonly issuer: string;
  client(): oauth.Client;
  /** The ID token, refreshed when it is about to expire; none when there is none to have. */
  idToken(): Promise<string | undefined>;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a `type` (a string, or a list of strings) names one of `names`. */
function names(type: unknown, ...wanted: string[]): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((one) => wanted.includes(one));
}

/** Whether `url` is within `storage`: on its origin, and its path the storage's or below it. */
function within(url: URL, storage: string): boolean {
  const root = new URL(storage);
  const folder = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`;
  return (
    root.origin === url.origin &&
    (url.pathname === root.pathname || url.pathname.startsWith(folder))
  );
}

/** The request's own URI: without its fragment, which is never sent. */
function requested(url: URL): string {
  const uri = new URL(url);
  uri.hash = "";
  return uri.href;
}

/**
 * How much of a discovery document is read: any server that answers a
 * session's request with a 401 names them, so a larger one is refused
 * rather than read into the tab's memory.
 */
const DISCOVERY_LIMITS: ReadLimits = { bytes: 64 * 1024, quads: 0, characters: 64 * 1024 };

/**
 * A JSON object read with a GET, as no one, following no redirect, and
 * no larger than DISCOVERY_LIMITS; none for anything else.
 */
async function getJson(
  url: string,
  accept: string,
  signal: AbortSignal | null | undefined,
): Promise<Json | undefined> {
  let response: Response;
  try {
    response = await limitedFetch(globalThis.fetch, DISCOVERY_LIMITS)(url, {
      headers: { accept },
      credentials: "omit",
      redirect: "manual",
      signal: timeLimited(signal),
    });
  } catch (error) {
    // Its Content-Length says it is too large.
    if (error instanceof ReadLimitError) return undefined;
    throw error;
  }
  if (!response.ok) return undefined;
  const body: unknown = await response
    .text()
    .then(JSON.parse)
    .catch(() => undefined);
  return isObject(body) ? body : undefined;
}

/** Waits for `work`, or rejects as soon as `signal` aborts; `work` goes on for whoever else waits for it. */
function abortable<T>(work: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/**
 * The authorization server's issuer the challenge's `resource_metadata`
 * (RFC 9728) leads to: the metadata is on the requested URI's scheme and
 * authority, names that URI as its `resource`, and its first
 * authorization server is the one.
 */
async function issuerOf(
  url: URL,
  metadataUri: string,
  signal: AbortSignal | null | undefined,
): Promise<string | undefined> {
  const metadataUrl = URL.parse(metadataUri);
  if (metadataUrl?.origin !== url.origin) return undefined;
  const metadata = await getJson(metadataUrl.href, "application/json", signal);
  if (metadata?.resource !== requested(url)) return undefined;
  const servers = metadata.authorization_servers;
  return Array.isArray(servers) && typeof servers[0] === "string" ? servers[0] : undefined;
}

/**
 * Whether the storage's description (application/lws+cid) is a
 * Storage's, with a StorageRoot service on the requested URI's scheme
 * and authority.
 */
async function describesStorage(
  storage: string,
  url: URL,
  signal: AbortSignal | null | undefined,
): Promise<boolean> {
  const description = await getJson(storage, "application/lws+cid", signal);
  if (!names(description?.type, "Storage", "https://www.w3.org/ns/lws#Storage")) return false;
  const services: unknown[] = Array.isArray(description?.service) ? description.service : [];
  return services.some(
    (service) =>
      isObject(service) &&
      names(service.type, "StorageRoot", "https://www.w3.org/ns/lws#StorageRoot") &&
      typeof service.serviceEndpoint === "string" &&
      URL.parse(service.serviceEndpoint)?.origin === url.origin,
  );
}

/** Whether a metadata list the server may leave out lists `value` when it is there. */
const listsOrOmits = (list: unknown, value: string) =>
  list === undefined || (Array.isArray(list) && list.includes(value));

/**
 * The authorization server's metadata, from its
 * /.well-known/lws-configuration, placed as RFC 8414 places a
 * well-known path: before the issuer's path. Its issuer must be the one
 * asked for, its token endpoint `https:` (or `http:` on this machine) on
 * the issuer's origin, and the token exchange of ID tokens supported
 * where it lists what it supports.
 */
async function lwsConfiguration(
  issuer: URL,
  signal: AbortSignal | null | undefined,
): Promise<oauth.AuthorizationServer | undefined> {
  const path = issuer.pathname === "/" ? "" : issuer.pathname;
  const metadata = await getJson(
    `${issuer.origin}/.well-known/lws-configuration${path}`,
    "application/json",
    signal,
  );
  const tokenEndpoint = metadata?.token_endpoint;
  if (
    typeof metadata?.issuer !== "string" ||
    URL.parse(metadata.issuer)?.href !== issuer.href ||
    typeof tokenEndpoint !== "string" ||
    secureEndpoint(tokenEndpoint)?.origin !== issuer.origin ||
    !listsOrOmits(metadata.grant_types_supported, TOKEN_EXCHANGE) ||
    !listsOrOmits(metadata.subject_token_types_supported, ID_TOKEN_TYPE)
  ) {
    return undefined;
  }
  return { issuer: metadata.issuer, token_endpoint: tokenEndpoint };
}

/**
 * Whether two issuers are the same, but for one trailing slash: one
 * origin can serve many issuers under different paths (tenants or
 * realms), each its own identity provider.
 */
const sameIssuer = (a: URL, b: URL) => withoutSlash(a.href) === withoutSlash(b.href);

const withoutSlash = (href: string) => (href.endsWith("/") ? href.slice(0, -1) : href);

/** The tokens of the LWS storages a session has met, kept on the session (oidcSession.ts). */
export class LwsTokens {
  readonly #session: LwsSession;
  readonly #storages = new Map<string, LwsStorage>();

  constructor(session: LwsSession) {
    this.#session = session;
  }

  /** The storage `url` is within, of those met, the innermost; none when it is in none. */
  storageOf(url: URL): LwsStorage | undefined {
    let found: LwsStorage | undefined;
    for (const storage of this.#storages.values()) {
      if (within(url, storage.uri) && storage.uri.length > (found?.uri.length ?? -1)) {
        found = storage;
      }
    }
    return found;
  }

  /**
   * The LWS storage a 401 to `url` names, once checked; none when the
   * answer is no LWS challenge, or a check fails. A check's request that
   * cannot be made rejects, as the request would have.
   */
  async discover(
    url: URL,
    response: Response,
    challenges: oauth.WWWAuthenticateChallenge[],
    signal?: AbortSignal | null,
  ): Promise<LwsStorage | undefined> {
    const metadataUri = challenges.find(
      ({ scheme, parameters }) => scheme === "bearer" && parameters.resource_metadata !== undefined,
    )?.parameters.resource_metadata;
    if (response.status !== 401 || metadataUri === undefined) return undefined;
    const uri = linkTargets(response, LWS_STORAGE, url.href).find((target) => within(url, target));
    if (uri === undefined) return undefined;
    const known = this.#storages.get(uri);
    if (known !== undefined) return known;
    const issuer = URL.parse((await issuerOf(url, metadataUri, signal)) ?? "");
    if (
      issuer === null ||
      !sameIssuer(issuer, new URL(this.#session.issuer)) ||
      !(await describesStorage(uri, url, signal))
    ) {
      return undefined;
    }
    const as = await lwsConfiguration(issuer, signal);
    if (as === undefined) return undefined;
    // Another request may have checked it meanwhile: one storage, one token at a time.
    const storage = this.#storages.get(uri) ?? { uri, as };
    this.#storages.set(uri, storage);
    return storage;
  }

  /**
   * The storage's token: the one it has until 30 seconds before it
   * expires, else a new one, from one exchange at a time per storage.
   * `exchanged` when it was exchanged for this call. None when the
   * session has no ID token, or the authorization server refuses it:
   * that ID token is not sent for the storage again.
   */
  async token(
    storage: LwsStorage,
    signal?: AbortSignal | null,
  ): Promise<{ value: string; exchanged: boolean } | undefined> {
    const kept = storage.token;
    if (kept !== undefined && Date.now() < kept.expiresAt - RENEW_MARGIN) {
      return { value: kept.value, exchanged: false };
    }
    storage.exchanging ??= this.#exchange(storage).finally(() => {
      storage.exchanging = undefined;
    });
    const value = await abortable(storage.exchanging, signal);
    return value === undefined ? undefined : { value, exchanged: true };
  }

  /** Forgets the storage's token `value`, which it refused; a newer one is kept. */
  forget(storage: LwsStorage, value: string): void {
    if (storage.token?.value === value) storage.token = undefined;
  }

  /**
   * Exchanges the session's ID token for one of the storage's (RFC 8693):
   * its `resource` the storage, the client authenticating as at login,
   * and no DPoP, as LWS tokens are Bearer tokens.
   */
  async #exchange(storage: LwsStorage): Promise<string | undefined> {
    const idToken = await this.#session.idToken();
    if (idToken === undefined || idToken === storage.refused) return undefined;
    const client = this.#session.client();
    const response = await oauth.genericTokenEndpointRequest(
      storage.as,
      client,
      clientAuth(client),
      TOKEN_EXCHANGE,
      { resource: storage.uri, subject_token: idToken, subject_token_type: ID_TOKEN_TYPE },
      // The token endpoint was checked: https:, or http: on this machine.
      requestOptions(storage.as.token_endpoint!),
    );
    const tokens = await oauth
      .processGenericTokenEndpointResponse(storage.as, client, response)
      .catch(() => undefined);
    if (tokens?.token_type !== "bearer") {
      storage.refused = idToken;
      return undefined;
    }
    storage.token = {
      value: tokens.access_token,
      expiresAt:
        tokens.expires_in === undefined
          ? Number.POSITIVE_INFINITY
          : Date.now() + tokens.expires_in * 1000,
    };
    return tokens.access_token;
  }
}
