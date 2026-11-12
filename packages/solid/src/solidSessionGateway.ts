// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getSolidDataset } from "./client/resources";
import { type FetchedDataset, getThing, getUrlAll } from "./client/rdf";
import { limitedFetch, MAX_BASE_CHARACTERS, PROFILE_LIMITS } from "./client/readLimits";
import type { SessionClient } from "./client/session";
import type { SessionGateway } from "@solid-memo/application/ports";
import type { SessionOrigin } from "@solid-memo/domain/session";
import { isSecureUrl } from "@solid-memo/domain/webId";
import { isGuestPodIri } from "@solid-memo/domain/guest";
import { TRIAL_ORIGIN } from "@solid-memo/domain/release/trial";
import { SESSION_EXPIRED_EVENT } from "./authFetch";
import { AppError } from "@solid-memo/domain/appError";

const SOLID_OIDC_ISSUER = "http://www.w3.org/ns/solid/terms#oidcIssuer";

/**
 * How long a session waits for its WebID profile before it is kept
 * unchecked, in milliseconds. It holds up the page's first screen, on a
 * read a slow pod must not turn into a lockout, so it is shorter than a
 * pod read's deadline (readDeadline.ts).
 */
const ISSUER_CHECK_DEADLINE_MS = 5_000;

/**
 * The most characters a session's WebID may have: the longest address
 * Solid Memo accepts as a document's base, far beyond any real WebID.
 * The storage lookup derives addresses from the WebID's path
 * (solidStorageGateway.ts), so a longer one is refused.
 */
const MAX_WEBID_CHARACTERS = MAX_BASE_CHARACTERS;

/**
 * The origin of a trial's pod, which this browser alone holds, as it
 * does the guest's (isGuestPodIri): no server holds a profile there, so
 * a session's WebID there could never be checked.
 */
const TRIAL_POD_ORIGIN = new URL(TRIAL_ORIGIN).origin;

/**
 * Dereference a WebID (unauthenticated). The document is read under
 * PROFILE_LIMITS, as the storage lookup reads it
 * (solidStorageGateway.ts): it is read at every login and sign-in, and
 * as every session is checked.
 */
function readWebIdProfile(
  webId: string,
  fetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init),
): Promise<FetchedDataset> {
  return getSolidDataset(webId, { fetch: limitedFetch(fetch, PROFILE_LIMITS) });
}

/**
 * Read the solid:oidcIssuer triple from the profile so the user only
 * needs to type their WebID. The issuer is never guessed from the
 * WebID's origin, and only an https issuer is accepted: the browser is
 * about to be sent there.
 */
function issuerOfProfile(dataset: FetchedDataset, webId: string): string {
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
 * The WebID profile, or null if it can't be read in time, for whatever
 * reason. It is asked of the pod, not taken from the browser's cache,
 * which could hold a profile from before the user added a provider.
 */
async function readProfileToCheck(webId: string): Promise<FetchedDataset | null> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), ISSUER_CHECK_DEADLINE_MS);
  try {
    return await readWebIdProfile(webId, (input, init) =>
      globalThis.fetch(input, { ...init, cache: "no-cache", signal: deadline.signal }),
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether the WebID's profile names this issuer, a trailing slash aside. */
function profileNamesIssuer(dataset: FetchedDataset, webId: string, issuer: string): boolean {
  const profile = getThing(dataset, webId);
  if (!profile) return false;
  const wanted = withoutTrailingSlash(issuer);
  return getUrlAll(profile, SOLID_OIDC_ISSUER).some(
    (listed) => withoutTrailingSlash(listed) === wanted,
  );
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
export const RESTORE_ATTEMPT_KEY = "solid-memo:restore-attempt";

/**
 * A silent restore this tab set off: the provider, and when, in
 * milliseconds since the epoch, by which a page tells its own attempt
 * from a later load's.
 */
interface RestoreAttempt {
  issuer: string;
  at: number;
}

/**
 * How long a restore may keep the page on its loading screen, in
 * milliseconds (docs/authentication.md#session-restore): twice what
 * solid-memo-client gives one request to the provider, as a restore
 * makes a few, and a false alarm stops a restore that would have worked.
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
  /** The profile a login's check read, for the account's lookup that follows it: one read for both. */
  let checkedAtLogin: { webId: string; dataset: FetchedDataset } | null = null;

  async function discoverOidcIssuer(webId: string): Promise<string> {
    const checked = checkedAtLogin;
    checkedAtLogin = null;
    const dataset = checked?.webId === webId ? checked.dataset : await readWebIdProfile(webId);
    return issuerOfProfile(dataset, webId);
  }

  /**
   * Ends the session and refuses it if the WebID's profile, read as no
   * one, does not name the session's issuer: a provider's word for a
   * WebID is not enough (Solid-OIDC). The session is kept if the profile
   * can't be read, so that a slow or absent pod locks no one out; a
   * WebID no pod could serve is refused before (refuseUnusableWebId).
   */
  async function refuseUnlistedIssuer(webId: string, fromLogin: boolean): Promise<void> {
    const issuer = await client.sessionIssuer().catch(() => null);
    if (issuer === null) return;
    const dataset = await readProfileToCheck(webId);
    if (dataset === null) return;
    if (!profileNamesIssuer(dataset, webId, issuer)) {
      // Refused either way: a logout that fails is tried again by the next load's check.
      await client.logout().catch(() => undefined);
      throw new AppError("webIdIssuerNotListed", { webId, issuer });
    }
    if (fromLogin) checkedAtLogin = { webId, dataset };
  }

  /**
   * Ends the session and refuses it if its WebID is longer than
   * MAX_WEBID_CHARACTERS: the provider names it, and nothing is read or
   * derived from it before this check.
   */
  async function refuseLongWebId(webId: string): Promise<void> {
    if (webId.length <= MAX_WEBID_CHARACTERS) return;
    await client.logout().catch(() => undefined);
    throw new AppError("webIdTooLong", { limit: MAX_WEBID_CHARACTERS, characters: webId.length });
  }

  /**
   * Ends the session and refuses it if its WebID is not one whose profile
   * can be read to check its issuer: an https URL with no user name or
   * password that Turtle can write (isSecureUrl), outside the guest's
   * pod (isGuestPodIri) and a trial's (TRIAL_POD_ORIGIN), which only
   * this browser holds. The issuer check keeps a session whose profile
   * can't be read only for a WebID that a pod could serve.
   */
  async function refuseUnusableWebId(webId: string): Promise<void> {
    const usable =
      isSecureUrl(webId) && !isGuestPodIri(webId) && new URL(webId).origin !== TRIAL_POD_ORIGIN;
    if (usable) return;
    await client.logout().catch(() => undefined);
    throw new AppError("webIdUnusable", { webId });
  }

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
   * Checks the provider's answer and restores, within the deadline. Only
   * the provider's own refusal of this tab's request ends the stored
   * session, in the sign-in client. Another page can navigate this tab,
   * keep it from leaving and choose when it brings it back, so neither
   * an unanswered attempt, however old, nor a refused answer, nor the
   * deadline says anything of the provider: they show the error, and the
   * session stays, until the learner logs in again or forgets it
   * (forgetStoredSession). Past the deadline of a silent restore its
   * attempt stays kept, so that the next load does not wait on the
   * provider again but shows that it did not answer; the load after that
   * tries again. A login's answer keeps none. What was kept for a
   * provider's answer stays only if the page leaves, as a restore that
   * left never comes back here.
   *
   * The browser can bring a page that left back from its back/forward
   * cache, its restore still pending and its timer running again. If a
   * later load has taken this page's attempt from the tab by then, the
   * restore is no longer this page's: it reloads, and whatever still
   * settles here leaves what that load kept alone.
   */
  async function attemptRestore(loginIssuer: string | null, attempt: RestoreAttempt | null) {
    const answered = hasAuthorizationResponse();
    let ownAttempt: string | null = null;
    // A login's answer is no silent restore, whatever session is stored from before it.
    const silent = !answered || loginIssuer === null || attempt !== null;
    let keepsAttempt = false;
    const takenOver = () =>
      ownAttempt !== null && window.sessionStorage.getItem(RESTORE_ATTEMPT_KEY) !== ownAttempt;
    const reloadIfTakenOver = (event: PageTransitionEvent) => {
      if (event.persisted && takenOver()) window.location.reload();
    };
    window.addEventListener("pageshow", reloadIfTakenOver);
    try {
      if (attempt !== null && !answered && !isReload()) {
        throw new AppError("restoreNotReturned", { issuer: attempt.issuer });
      }
      return await withinRestoreDeadline(
        checkAuthorizationResponse(loginIssuer, client).then(async () => {
          ownAttempt = await noteRestoreAttempt();
          return client.restore();
        }),
      );
    } catch (error) {
      keepsAttempt = silent && error instanceof AppError && error.code === "restoreTimedOut";
      if (hasAuthorizationResponse()) {
        takeOffAuthorizationResponse(new URL(window.location.href));
      }
      throw error;
    } finally {
      window.removeEventListener("pageshow", reloadIfTakenOver);
      if (!takenOver()) {
        window.sessionStorage.removeItem(LOGIN_ISSUER_KEY);
        if (!keepsAttempt) window.sessionStorage.removeItem(RESTORE_ATTEMPT_KEY);
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
      await refuseLongWebId(webId);
      await refuseUnusableWebId(webId);
      await refuseUnlistedIssuer(webId, fromLogin);
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
      checkedAtLogin = null;
      await client.logout();
    },

    async hasStoredSession() {
      return (await client.sessionIssuer()) !== null;
    },

    async forgetStoredSession() {
      window.sessionStorage.removeItem(LOGIN_ISSUER_KEY);
      window.sessionStorage.removeItem(RESTORE_ATTEMPT_KEY);
      await client.forgetSession();
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
