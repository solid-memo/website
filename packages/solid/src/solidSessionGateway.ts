// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getSolidDataset } from "./client/resources";
import { getThing, getUrlAll } from "./client/rdf";
import { limitedFetch, PROFILE_LIMITS } from "./client/readLimits";
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
 * https issuer is accepted: the browser is about to be sent there. The
 * document is read under PROFILE_LIMITS, as the storage lookup reads it
 * (solidStorageGateway.ts): it is read at every login and sign-in.
 */
async function discoverOidcIssuer(webId: string): Promise<string> {
  const dataset = await getSolidDataset(webId, {
    fetch: limitedFetch((input, init) => globalThis.fetch(input, init), PROFILE_LIMITS),
  });
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

/**
 * The identity provider a silent restore is under way with, or left for,
 * in this tab, and when it set off (RestoreAttempt): kept until the next
 * page load, which finds it unanswered when the provider never sent the
 * browser back.
 */
const RESTORE_ATTEMPT_KEY = "solid-memo:restore-attempt";

/** A silent restore this tab set off: the provider, and when, in milliseconds since the epoch. */
interface RestoreAttempt {
  issuer: string;
  at: number;
}

/**
 * How long a restore may keep the page on its loading screen, in
 * milliseconds (docs/authentication.md#session-restore): twice what
 * solid-memo-client gives one request to the provider, as a restore
 * makes a few, and a false alarm costs the learner their session. An
 * attempt that left the page gets as long to come back: only one older
 * than this says the provider isn't answering.
 */
const RESTORE_DEADLINE_MS = 60_000;

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

/** Takes the provider's answer off the address, keeping its route, so a reload does not try it again. */
function takeOffAuthorizationResponse(url: URL): void {
  for (const name of RESPONSE_PARAMETERS) url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url.href);
}

/** Takes the provider's answer off the address and refuses it. */
function refuseAuthorizationResponse(url: URL, error: AppError): never {
  takeOffAuthorizationResponse(url);
  throw error;
}

/**
 * Drops an answer from an identity provider when this tab sent the
 * browser to no provider: it answers nothing this tab asked for, so it
 * is taken off the address and the previous session restored as on any
 * load, where refusing it would stop the session for that load. Any
 * other answer is refused, before a sign-in client redeems its code,
 * unless it names the provider this tab sent the browser to in its
 * `iss` parameter (RFC 9207). Every provider is sent the same redirect
 * URL and client, so `iss` is all that ties an answer to the provider
 * it came from, and only this tab knows which provider it sent the
 * browser to. An answer must also answer a request, by its `state`,
 * that went to that same provider: the client redeems a code where the
 * request went, and may hold requests from other tabs, or ones left
 * unanswered, and an answer it does not know, an error's too, it would
 * drop and restore silently, leaving for the provider again. A refused
 * answer is taken off the address too.
 */
async function checkAuthorizationResponse(
  expectedIssuer: string | null,
  client: SessionClient,
): Promise<void> {
  const url = new URL(window.location.href);
  const { searchParams } = url;
  if (!isAuthorizationResponse(searchParams)) return;
  if (expectedIssuer === null) {
    takeOffAuthorizationResponse(url);
    return;
  }
  const iss = searchParams.get("iss");
  if (iss === null) {
    refuseAuthorizationResponse(
      url,
      new AppError("loginIssuerMissing", { issuer: expectedIssuer }),
    );
  }
  if (withoutTrailingSlash(iss) !== withoutTrailingSlash(expectedIssuer)) {
    refuseAuthorizationResponse(
      url,
      new AppError("loginIssuerMismatch", { issuer: expectedIssuer, iss }),
    );
  }
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

/** Whether the page's address carries an identity provider's answer. */
function hasAuthorizationResponse(): boolean {
  return isAuthorizationResponse(new URL(window.location.href).searchParams);
}

/** Whether the learner reloaded this page: it had not left then, whatever it kept before leaving. */
function isReload(): boolean {
  const [navigation] = window.performance.getEntriesByType("navigation");
  return (navigation as PerformanceNavigationTiming | undefined)?.type === "reload";
}

/** What a restore finds, or a refusal once the deadline passes; what it does after that is ignored. */
async function withinRestoreDeadline<T>(restoring: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AppError("restoreTimedOut", { seconds: RESTORE_DEADLINE_MS / 1000 })),
      RESTORE_DEADLINE_MS,
    );
  });
  try {
    return await Promise.race([restoring, deadline]);
  } finally {
    clearTimeout(timer);
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
   * Before a restore, which may send the browser to the session's
   * provider, even past an answer it does not take: keeps that provider,
   * for its answer to be checked against, and the attempt, for the next
   * load to tell that it never answered. What it returns is the attempt
   * as kept, by which this page knows its own.
   */
  async function noteRestoreAttempt(): Promise<string | null> {
    const issuer = await client.sessionIssuer();
    if (issuer === null) return null;
    const attempt: RestoreAttempt = { issuer, at: Date.now() };
    const kept = JSON.stringify(attempt);
    window.sessionStorage.setItem(LOGIN_ISSUER_KEY, issuer);
    window.sessionStorage.setItem(RESTORE_ATTEMPT_KEY, kept);
    return kept;
  }

  /**
   * Ends the stored session, unless the browser is offline, which says
   * nothing of the provider. It stays bounded like the restore, and the
   * learner sees the restore's error whatever becomes of it.
   */
  async function endStoredSession() {
    if (!window.navigator.onLine) return;
    await withinRestoreDeadline(client.forgetSession()).catch(() => {});
  }

  /**
   * Checks the provider's answer and restores, within the deadline. A
   * silent restore that fails or runs out of time ends the stored
   * session, so that the next visit does not repeat it, and so does an
   * attempt that went unanswered for longer than a working provider
   * takes. Another page can navigate this tab, so neither a young
   * attempt nor a refused answer says anything of the provider: they
   * skip the restore and show the error, and the session stays. So does
   * it past a login's answer. What was kept for a provider's answer stays
   * only if the page leaves, as a restore that left never comes back here.
   *
   * The browser can bring a page that left back from its back/forward
   * cache, its restore still pending and its timer running again. If a
   * later load has taken this page's attempt from the tab by then, the
   * restore is no longer this page's to end: it reloads, and whatever
   * still settles here leaves the session and what that load kept alone.
   */
  async function attemptRestore(loginIssuer: string | null, attempt: RestoreAttempt | null) {
    const answered = hasAuthorizationResponse();
    let endsSession = false;
    let ownAttempt: string | null = null;
    const takenOver = () =>
      ownAttempt !== null && window.sessionStorage.getItem(RESTORE_ATTEMPT_KEY) !== ownAttempt;
    const reloadIfTakenOver = (event: PageTransitionEvent) => {
      if (event.persisted && takenOver()) window.location.reload();
    };
    window.addEventListener("pageshow", reloadIfTakenOver);
    try {
      if (attempt !== null && !answered && !isReload()) {
        endsSession = Date.now() - attempt.at >= RESTORE_DEADLINE_MS;
        throw new AppError("restoreNotReturned", { issuer: attempt.issuer });
      }
      return await withinRestoreDeadline(
        checkAuthorizationResponse(loginIssuer, client).then(async () => {
          endsSession = !answered || loginIssuer === null || attempt !== null;
          ownAttempt = await noteRestoreAttempt();
          return client.restore();
        }),
      );
    } catch (error) {
      if (endsSession && !takenOver()) await endStoredSession();
      if (hasAuthorizationResponse()) {
        takeOffAuthorizationResponse(new URL(window.location.href));
      }
      throw error;
    } finally {
      window.removeEventListener("pageshow", reloadIfTakenOver);
      if (!takenOver()) {
        window.sessionStorage.removeItem(LOGIN_ISSUER_KEY);
        window.sessionStorage.removeItem(RESTORE_ATTEMPT_KEY);
      }
    }
  }

  return {
    async restore() {
      const loginHash = window.sessionStorage.getItem(LOGIN_HASH_KEY) ?? "";
      const loginIssuer = window.sessionStorage.getItem(LOGIN_ISSUER_KEY);
      const attempt = window.sessionStorage.getItem(RESTORE_ATTEMPT_KEY);
      window.sessionStorage.removeItem(LOGIN_HASH_KEY);
      window.sessionStorage.removeItem(LOGIN_ISSUER_KEY);
      window.sessionStorage.removeItem(RESTORE_ATTEMPT_KEY);
      const { webId, fromLogin, restoredFrom } = await attemptRestore(
        loginIssuer,
        attempt === null ? null : (JSON.parse(attempt) as RestoreAttempt),
      );
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

    onReturnedWithoutSession(listener) {
      const heard = ({ persisted }: PageTransitionEvent) => {
        if (!persisted) return;
        // A store that can't be read vouches for no session.
        void client
          .sessionIssuer()
          .catch(() => null)
          .then((issuer) => {
            if (issuer === null) listener();
          });
      };
      window.addEventListener("pageshow", heard);
      return () => window.removeEventListener("pageshow", heard);
    },
  };
}
