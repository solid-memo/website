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
 * The app the session was logged in from, which the identity provider
 * sends the user back to: on a silent restore too, for the authn library
 * keeps one session per origin, wherever it was logged in.
 */
const SESSION_PAGE_KEY = "solid-memo:session-page";

/** This page, as the identity provider is told to send the user back to it. */
function thisPage(): string {
  return new URL(window.location.pathname, window.location.origin).toString();
}

/**
 * The app this page belongs to, as its directory: `/` and `/index.html`
 * are one app, and so are `/studio` and `/studio/`.
 */
function thisApp(): string {
  const path = window.location.pathname.replace(/index\.html$/, "");
  return new URL(
    path.endsWith("/") ? path : `${path}/`,
    window.location.origin,
  ).toString();
}

/**
 * `clientName` is the name the app gives itself at login. `defaultApp` is
 * the directory of the app a session with no app kept was logged in from:
 * Solid Memo's, for a session from before the Studio could only have
 * been logged in there.
 */
export function createSolidSessionGateway(clientName: string, defaultApp: string): SessionGateway {
  /** Redirects the browser to the identity provider; does not return. */
  async function startLogin(oidcIssuer: string): Promise<void> {
    window.localStorage.setItem(SESSION_PAGE_KEY, thisApp());
    await login({ oidcIssuer, redirectUrl: thisPage(), clientName });
  }

  return {
    async restore() {
      let origin: SessionOrigin = "restored";
      const onLogin = () => {
        origin = "login";
      };
      events().on(EVENTS.LOGIN, onLogin);
      try {
        // A session logged in from another app of the site (Solid Memo and
        // the Studio share an origin) is restored only there: a silent
        // restore here would send the user to that app. This app takes a
        // login of its own instead (docs/authentication.md).
        const sessionPage = window.localStorage.getItem(SESSION_PAGE_KEY) ?? defaultApp;
        const info = await handleIncomingRedirect({
          restorePreviousSession: sessionPage === thisApp(),
        });
        if (info?.isLoggedIn && info.webId) {
          return { session: { webId: info.webId }, origin };
        }
        return null;
      } finally {
        events().off(EVENTS.LOGIN, onLogin);
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
