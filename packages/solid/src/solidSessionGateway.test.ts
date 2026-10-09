import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EVENTS,
  events,
  handleIncomingRedirect,
  login as authnLogin,
  logout as authnLogout,
} from "@inrupt/solid-client-authn-browser";
import { getIriAll, getSolidDataset, getThing } from "@inrupt/solid-client";
import { createSolidSessionGateway } from "./solidSessionGateway";
import { SESSION_EXPIRED_EVENT } from "./authFetch";

vi.mock("@inrupt/solid-client-authn-browser");
vi.mock("@inrupt/solid-client");

const WEBID = "https://alice.example/profile/card#me";

/** Minimal stand-in for the default session's event emitter. */
function makeEmitter() {
  type Listener = (...args: unknown[]) => void;
  const listeners = new Map<string, Set<Listener>>();
  return {
    on: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));
    }),
    off: vi.fn((event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
    }),
    emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach((listener) => listener(...args));
    },
    count: (event: string) => listeners.get(event)?.size ?? 0,
  };
}

describe("createSolidSessionGateway", () => {
  let emitter: ReturnType<typeof makeEmitter>;

  beforeEach(() => {
    vi.resetAllMocks();
    emitter = makeEmitter();
    vi.mocked(events).mockReturnValue(emitter as never);
    window.sessionStorage.clear();
    window.history.replaceState(null, "", window.location.pathname);
  });

  describe("restore", () => {
    it("returns a restored session when no login redirect completed", async () => {
      vi.mocked(handleIncomingRedirect).mockResolvedValue({
        isLoggedIn: true,
        webId: WEBID,
        sessionId: "s",
      });
      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.restore()).resolves.toEqual({
        session: { webId: WEBID },
        origin: "restored",
      });
      expect(handleIncomingRedirect).toHaveBeenCalledWith({
        restorePreviousSession: true,
      });
    });

    it("reports a login when the library announces one", async () => {
      vi.mocked(handleIncomingRedirect).mockImplementation(async () => {
        emitter.emit(EVENTS.LOGIN);
        return { isLoggedIn: true, webId: WEBID, sessionId: "s" };
      });
      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.restore()).resolves.toEqual({
        session: { webId: WEBID },
        origin: "login",
      });
    });

    it("stops listening for logins and restores afterwards, even on failure", async () => {
      vi.mocked(handleIncomingRedirect).mockRejectedValue(new Error("boom"));
      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.restore()).rejects.toThrow("boom");
      expect(emitter.count(EVENTS.LOGIN)).toBe(0);
      expect(emitter.count(EVENTS.SESSION_RESTORED)).toBe(0);
    });

    it("returns to the hash a login set off from, and tells the routers", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue({} as never);
      vi.mocked(getIriAll).mockReturnValue(["https://issuer.example"]);
      const gateway = createSolidSessionGateway("Test App");
      window.history.replaceState(null, "", "#/studio");
      await gateway.loginWithIssuer("https://issuer.example");
      // The identity provider sends the user back without the hash.
      window.history.replaceState(null, "", window.location.pathname);
      vi.mocked(handleIncomingRedirect).mockImplementation(async () => {
        emitter.emit(EVENTS.LOGIN);
        return { isLoggedIn: true, webId: WEBID, sessionId: "s" };
      });
      const onHashChange = vi.fn();
      window.addEventListener("hashchange", onHashChange);

      await expect(gateway.restore()).resolves.toMatchObject({ origin: "login" });

      window.removeEventListener("hashchange", onHashChange);
      expect(window.location.hash).toBe("#/studio");
      expect(onHashChange).toHaveBeenCalledOnce();
      expect(window.sessionStorage.getItem("solid-memo:login-hash")).toBeNull();
    });

    it("returns to the hash a silent restore left from", async () => {
      vi.mocked(handleIncomingRedirect).mockImplementation(async () => {
        emitter.emit(EVENTS.SESSION_RESTORED, "https://memo.example/#/studio?instance=x");
        return { isLoggedIn: true, webId: WEBID, sessionId: "s" };
      });
      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.restore()).resolves.toMatchObject({ origin: "restored" });
      expect(window.location.hash).toBe("#/studio?instance=x");
    });

    it("forgets the login's hash when the login did not complete", async () => {
      window.sessionStorage.setItem("solid-memo:login-hash", "#/studio");
      vi.mocked(handleIncomingRedirect).mockResolvedValue(undefined);
      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.restore()).resolves.toBeNull();
      expect(window.location.hash).toBe("");
      expect(window.sessionStorage.getItem("solid-memo:login-hash")).toBeNull();
    });

    it("returns null when there is no session info", async () => {
      vi.mocked(handleIncomingRedirect).mockResolvedValue(undefined);
      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.restore()).resolves.toBeNull();
    });

    it("returns null when not logged in", async () => {
      vi.mocked(handleIncomingRedirect).mockResolvedValue({
        isLoggedIn: false,
        sessionId: "s",
      });
      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.restore()).resolves.toBeNull();
    });

    it("returns null when logged in but without a WebID", async () => {
      vi.mocked(handleIncomingRedirect).mockResolvedValue({
        isLoggedIn: true,
        sessionId: "s",
      });
      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.restore()).resolves.toBeNull();
    });
  });

  describe("login", () => {
    it("discovers the OIDC issuer from the WebID document and starts login", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue({} as never);
      vi.mocked(getIriAll).mockReturnValue(["https://issuer.example"]);

      const gateway = createSolidSessionGateway("Test App");
      await gateway.login(WEBID);

      expect(getThing).toHaveBeenCalledWith(expect.anything(), WEBID);
      expect(getIriAll).toHaveBeenCalledWith(
        expect.anything(),
        "http://www.w3.org/ns/solid/terms#oidcIssuer",
      );
      expect(authnLogin).toHaveBeenCalledWith({
        oidcIssuer: "https://issuer.example",
        redirectUrl: new URL(
          window.location.pathname,
          window.location.origin,
        ).toString(),
        clientName: "Test App",
      });
    });

    it("rejects when the WebID document has no subject for the WebID", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue(null);

      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.login(WEBID)).rejects.toThrow(
        `Your WebID profile does not describe you.`,
      );
      expect(authnLogin).not.toHaveBeenCalled();
    });

    it("rejects when the profile declares no solid:oidcIssuer", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue({} as never);
      vi.mocked(getIriAll).mockReturnValue([]);

      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.login(WEBID)).rejects.toThrow(
        "Your WebID profile does not say where you log in.",
      );
      expect(authnLogin).not.toHaveBeenCalled();
    });
  });

  describe("loginWithIssuer", () => {
    it("starts login at the given issuer without reading any profile", async () => {
      const gateway = createSolidSessionGateway("Test App");
      await gateway.loginWithIssuer("https://login.inrupt.com");

      expect(getSolidDataset).not.toHaveBeenCalled();
      expect(authnLogin).toHaveBeenCalledWith({
        oidcIssuer: "https://login.inrupt.com",
        redirectUrl: new URL(
          window.location.pathname,
          window.location.origin,
        ).toString(),
        clientName: "Test App",
      });
    });
  });

  describe("discoverOidcIssuer", () => {
    it("returns the issuer declared in the profile, not the WebID origin", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue({} as never);
      vi.mocked(getIriAll).mockReturnValue(["https://idp.elsewhere.example"]);

      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.discoverOidcIssuer(WEBID)).resolves.toBe(
        "https://idp.elsewhere.example",
      );
    });

    it("skips issuers that are not https URLs", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue({} as never);
      vi.mocked(getIriAll).mockReturnValue([
        "http://insecure.example",
        "https://issuer.example",
      ]);

      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.discoverOidcIssuer(WEBID)).resolves.toBe(
        "https://issuer.example",
      );
    });

    it("rejects when no declared issuer is an https URL", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue({} as never);
      vi.mocked(getIriAll).mockReturnValue(["javascript:alert(1)"]);

      const gateway = createSolidSessionGateway("Test App");
      await expect(gateway.login(WEBID)).rejects.toThrow(
        "not a secure https:// address",
      );
      expect(authnLogin).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("delegates to the authn library", async () => {
      const gateway = createSolidSessionGateway("Test App");
      await gateway.logout();
      expect(authnLogout).toHaveBeenCalledOnce();
    });
  });

  describe("onSessionExpired", () => {
    it("notifies while subscribed and stops after unsubscribe", () => {
      const gateway = createSolidSessionGateway("Test App");
      const listener = vi.fn();
      const unsubscribe = gateway.onSessionExpired(listener);

      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      expect(listener).toHaveBeenCalledOnce();

      unsubscribe();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      expect(listener).toHaveBeenCalledOnce();
    });
  });
});
