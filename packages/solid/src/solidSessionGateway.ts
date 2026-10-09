import {
  EVENTS,
  events,
  handleIncomingRedirect,
  login,
  logout,
} from "@inrupt/solid-client-authn-browser";
import { getIriAll, getSolidDataset, getThing } from "@inrupt/solid-client";
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
 * https issuer is accepted: the browser is about to be sent there.
 */
async function discoverOidcIssuer(webId: string): Promise<string> {
  const dataset = await getSolidDataset(webId);
  const profile = getThing(dataset, webId);
  if (!profile) {
    throw new AppError("webIdNoSubject", { webId });
  }
  const issuers = getIriAll(profile, SOLID_OIDC_ISSUER);
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
const LOGIN_HASH_KEY = "solid-memo:login-hash";

/**
 * Takes the page back to a route the redirect dropped: the Studio's, say,
 * not the default one. The hashchange tells the routers, as a link would.
 */
function returnTo(hash: string): void {
  if (hash === "") return;
  window.history.replaceState(null, "", hash);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function createSolidSessionGateway(clientName: string): SessionGateway {
  /** Redirects the browser to the identity provider; does not return. */
  async function startLogin(oidcIssuer: string): Promise<void> {
    window.sessionStorage.setItem(LOGIN_HASH_KEY, window.location.hash);
    await login({
      oidcIssuer,
      redirectUrl: new URL(
        window.location.pathname,
        window.location.origin,
      ).toString(),
      clientName,
    });
  }

  return {
    async restore() {
      // Set by the listener below, so not narrowed to its first value.
      let origin = "restored" as SessionOrigin;
      const onLogin = () => {
        origin = "login";
      };
      // A silent restore leaves the page for the identity provider and
      // comes back without its hash; the library reports the page it left.
      let restoredFrom = "";
      const onRestored = (url: string) => {
        restoredFrom = new URL(url).hash;
      };
      events().on(EVENTS.LOGIN, onLogin);
      events().on(EVENTS.SESSION_RESTORED, onRestored);
      try {
        const info = await handleIncomingRedirect({
          restorePreviousSession: true,
        });
        const loginHash = window.sessionStorage.getItem(LOGIN_HASH_KEY) ?? "";
        window.sessionStorage.removeItem(LOGIN_HASH_KEY);
        if (info?.isLoggedIn && info.webId) {
          returnTo(origin === "login" ? loginHash : restoredFrom);
          return { session: { webId: info.webId }, origin };
        }
        return null;
      } finally {
        events().off(EVENTS.LOGIN, onLogin);
        events().off(EVENTS.SESSION_RESTORED, onRestored);
      }
    },

    discoverOidcIssuer,

    async login(webId) {
      await startLogin(await discoverOidcIssuer(webId));
    },

    loginWithIssuer: startLogin,

    async logout() {
      await logout();
    },

    onSessionExpired(listener) {
      window.addEventListener(SESSION_EXPIRED_EVENT, listener);
      return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
    },
  };
}
