// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSolidDataset } from "./client/resources";
import { getThing, getUrlAll } from "./client/rdf";
import { createSolidSessionGateway } from "./solidSessionGateway";
import { SESSION_EXPIRED_EVENT } from "./authFetch";
import { fakeSessionClient } from "./testing/fakeSessionClient";

vi.mock("./client/resources");
vi.mock("./client/rdf");

const WEBID = "https://alice.example/profile/card#me";
const SITE = "https://memo.example/";

describe("createSolidSessionGateway", () => {
  let client: ReturnType<typeof fakeSessionClient>;
  let options: Parameters<typeof createSolidSessionGateway>[0];

  beforeEach(() => {
    vi.resetAllMocks();
    client = fakeSessionClient();
    options = { clientName: "Test App", site: SITE, client };
    window.sessionStorage.clear();
    window.history.replaceState(null, "", window.location.pathname);
  });

  /** What the client's restore finds: a session, and how it came. */
  function restored(fromLogin: boolean, restoredFrom: string | null = null) {
    client.restore.mockResolvedValue({ webId: WEBID, fromLogin, restoredFrom });
  }

  describe("restore", () => {
    it("returns a restored session when no login redirect completed", async () => {
      restored(false);
      const gateway = createSolidSessionGateway(options);
      await expect(gateway.restore()).resolves.toEqual({
        session: { webId: WEBID },
        origin: "restored",
      });
    });

    it("reports a login when the client reports one", async () => {
      restored(true);
      const gateway = createSolidSessionGateway(options);
      await expect(gateway.restore()).resolves.toEqual({
        session: { webId: WEBID },
        origin: "login",
      });
    });

    it("passes on the client's failure", async () => {
      client.restore.mockRejectedValue(new Error("boom"));
      const gateway = createSolidSessionGateway(options);
      await expect(gateway.restore()).rejects.toThrow("boom");
    });

    it("returns to the hash a login set off from, and tells the routers", async () => {
      const gateway = createSolidSessionGateway(options);
      window.history.replaceState(null, "", "#/studio");
      await gateway.loginWithIssuer("https://issuer.example");
      // The identity provider sends the user back without the hash.
      window.history.replaceState(null, "", window.location.pathname);
      restored(true);
      const onHashChange = vi.fn();
      window.addEventListener("hashchange", onHashChange);

      await expect(gateway.restore()).resolves.toMatchObject({ origin: "login" });

      window.removeEventListener("hashchange", onHashChange);
      expect(window.location.hash).toBe("#/studio");
      expect(onHashChange).toHaveBeenCalledOnce();
      expect(window.sessionStorage.getItem("solid-memo:login-hash")).toBeNull();
    });

    it("returns to the hash a silent restore left from", async () => {
      restored(false, "https://memo.example/#/studio?instance=x");
      const gateway = createSolidSessionGateway(options);
      await expect(gateway.restore()).resolves.toMatchObject({ origin: "restored" });
      expect(window.location.hash).toBe("#/studio?instance=x");
    });

    it("forgets the login's hash when the login did not complete", async () => {
      window.sessionStorage.setItem("solid-memo:login-hash", "#/studio");
      const gateway = createSolidSessionGateway(options);
      await expect(gateway.restore()).resolves.toBeNull();
      expect(window.location.hash).toBe("");
      expect(window.sessionStorage.getItem("solid-memo:login-hash")).toBeNull();
    });

    it("returns null when the client finds no one", async () => {
      const gateway = createSolidSessionGateway(options);
      await expect(gateway.restore()).resolves.toBeNull();
    });
  });

  describe("restore, given the identity provider's answer", () => {
    const ISSUER = "https://issuer.example/";

    /** The identity provider sends the user back with these parameters. */
    function sendBack(parameters: Record<string, string>) {
      window.history.replaceState(null, "", `/?${new URLSearchParams(parameters)}`);
    }

    beforeEach(() => {
      // The client holds the request the answers below answer, sent to the provider.
      client.requestIssuer.mockImplementation(async (state) => (state === "s" ? ISSUER : null));
    });

    it("completes a login whose answer names the provider it set off for", async () => {
      const gateway = createSolidSessionGateway(options);
      await gateway.loginWithIssuer(ISSUER);
      sendBack({ code: "c", state: "s", iss: ISSUER });
      restored(true);
      await expect(gateway.restore()).resolves.toMatchObject({ origin: "login" });
      expect(window.sessionStorage.getItem("solid-memo:login-issuer")).toBeNull();
    });

    it("takes the provider written with or without its trailing slash as the same", async () => {
      const gateway = createSolidSessionGateway(options);
      await gateway.loginWithIssuer("https://issuer.example");
      sendBack({ code: "c", state: "s", iss: ISSUER });
      restored(true);
      await expect(gateway.restore()).resolves.toMatchObject({ origin: "login" });
    });

    it("refuses an answer that names a provider when this tab sent the browser to none", async () => {
      // An answer to a request another tab made, say, which only that tab can check.
      sendBack({ code: "c", state: "s", iss: ISSUER });
      const gateway = createSolidSessionGateway(options);
      await expect(gateway.restore()).rejects.toMatchObject({
        code: "loginNotStarted",
        detail: `iss: ${ISSUER}`,
      });
      expect(client.restore).not.toHaveBeenCalled();
      expect(window.location.search).toBe("");
    });

    it("keeps the session's provider before a silent restore leaves, and lets its answer through", async () => {
      client.sessionIssuer.mockResolvedValue(ISSUER);
      // The page leaves for the provider: restore never settles.
      client.restore.mockReturnValue(new Promise(() => {}));
      void createSolidSessionGateway(options).restore();
      await vi.waitFor(() => expect(client.restore).toHaveBeenCalledOnce());
      expect(window.sessionStorage.getItem("solid-memo:login-issuer")).toBe(ISSUER);

      // The provider sends the user back; the page loads afresh.
      sendBack({ code: "c", state: "s", iss: ISSUER });
      client.sessionIssuer.mockClear();
      restored(false);
      await expect(createSolidSessionGateway(options).restore()).resolves.toMatchObject({
        origin: "restored",
      });
      // An answer is completed, not a new silent restore set off.
      expect(client.sessionIssuer).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem("solid-memo:login-issuer")).toBeNull();
    });

    it("refuses a silent restore's answer that names another provider than the session's", async () => {
      window.sessionStorage.setItem("solid-memo:login-issuer", ISSUER);
      sendBack({ code: "c", state: "s", iss: "https://other.example/" });
      await expect(createSolidSessionGateway(options).restore()).rejects.toMatchObject({
        code: "loginIssuerMismatch",
      });
      expect(client.restore).not.toHaveBeenCalled();
    });

    it("forgets the session's provider when the page does not leave, or restoring fails", async () => {
      client.sessionIssuer.mockResolvedValue(ISSUER);
      restored(false);
      await createSolidSessionGateway(options).restore();
      expect(window.sessionStorage.getItem("solid-memo:login-issuer")).toBeNull();

      client.restore.mockRejectedValue(new Error("boom"));
      await expect(createSolidSessionGateway(options).restore()).rejects.toThrow("boom");
      expect(window.sessionStorage.getItem("solid-memo:login-issuer")).toBeNull();
    });

    it("refuses a login's answer that names no provider, before the client sees it", async () => {
      const gateway = createSolidSessionGateway(options);
      await gateway.loginWithIssuer(ISSUER);
      sendBack({ code: "c", state: "s" });
      await expect(gateway.restore()).rejects.toMatchObject({
        code: "loginIssuerMissing",
        detail: `issuer: ${ISSUER}`,
      });
      expect(client.restore).not.toHaveBeenCalled();
      // Taken off the address, so a reload does not try it again.
      expect(window.location.search).toBe("");
      expect(window.sessionStorage.getItem("solid-memo:login-issuer")).toBeNull();
    });

    it("refuses an answer that names no provider without a login set off in this tab, and an error too", async () => {
      const gateway = createSolidSessionGateway(options);
      const answers: Record<string, string>[] = [
        { code: "c", state: "s" },
        { error: "login_required", state: "s" },
      ];
      for (const parameters of answers) {
        sendBack(parameters);
        await expect(gateway.restore()).rejects.toMatchObject({
          code: "loginIssuerMissing",
          detail: "",
        });
      }
      expect(client.restore).not.toHaveBeenCalled();
    });

    it("refuses a login's answer that names another provider", async () => {
      const gateway = createSolidSessionGateway(options);
      await gateway.loginWithIssuer(ISSUER);
      sendBack({ code: "c", state: "s", iss: "https://other.example/" });
      await expect(gateway.restore()).rejects.toMatchObject({
        code: "loginIssuerMismatch",
        detail: `issuer: ${ISSUER}\niss: https://other.example/`,
      });
      expect(client.restore).not.toHaveBeenCalled();
      expect(window.location.search).toBe("");
    });

    it("asks the client which provider the answer's request went to, by its state", async () => {
      const gateway = createSolidSessionGateway(options);
      await gateway.loginWithIssuer(ISSUER);
      sendBack({ code: "c", state: "s", iss: ISSUER });
      restored(true);
      await gateway.restore();
      expect(client.requestIssuer).toHaveBeenCalledWith("s");
    });

    it("refuses a code answering a request, left from a login elsewhere, that went to another provider", async () => {
      // A login to another provider, abandoned, that its provider sent on to this one with the
      // request's state; this tab set off for this provider, which answers with its own iss.
      client.requestIssuer.mockResolvedValue("https://other.example/");
      const gateway = createSolidSessionGateway(options);
      await gateway.loginWithIssuer(ISSUER);
      sendBack({ code: "c", state: "left", iss: ISSUER });
      await expect(gateway.restore()).rejects.toMatchObject({
        code: "loginIssuerMismatch",
        detail: `issuer: ${ISSUER}\nrequest: https://other.example/`,
      });
      expect(client.restore).not.toHaveBeenCalled();
      expect(window.location.search).toBe("");
    });

    it("refuses a code answering no request the client holds, or with no state", async () => {
      const answers: Record<string, string>[] = [
        { code: "c", state: "unknown", iss: ISSUER },
        { code: "c", iss: ISSUER },
      ];
      for (const parameters of answers) {
        const gateway = createSolidSessionGateway(options);
        await gateway.loginWithIssuer(ISSUER);
        sendBack(parameters);
        await expect(gateway.restore()).rejects.toMatchObject({
          code: "loginNotStarted",
          detail: `iss: ${ISSUER}\nstate: ${parameters.state ?? ""}`,
        });
        expect(window.location.search).toBe("");
      }
      expect(client.restore).not.toHaveBeenCalled();
    });

    it("lets an error answer from the provider it set off for through, whatever its state", async () => {
      const gateway = createSolidSessionGateway(options);
      await gateway.loginWithIssuer(ISSUER);
      sendBack({ error: "access_denied", iss: ISSUER });
      await expect(gateway.restore()).resolves.toBeNull();
      expect(client.requestIssuer).not.toHaveBeenCalled();
      expect(client.restore).toHaveBeenCalledOnce();
    });

    it("leaves an address without an answer to the client", async () => {
      sendBack({ state: "s" });
      const gateway = createSolidSessionGateway(options);
      await expect(gateway.restore()).resolves.toBeNull();
      expect(client.restore).toHaveBeenCalledOnce();
    });
  });

  describe("login", () => {
    it("discovers the OIDC issuer from the WebID document and starts login", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue({} as never);
      vi.mocked(getUrlAll).mockReturnValue(["https://issuer.example"]);

      const gateway = createSolidSessionGateway(options);
      await gateway.login(WEBID);

      expect(getThing).toHaveBeenCalledWith(expect.anything(), WEBID);
      expect(getUrlAll).toHaveBeenCalledWith(
        expect.anything(),
        "http://www.w3.org/ns/solid/terms#oidcIssuer",
      );
      expect(client.login).toHaveBeenCalledWith({
        oidcIssuer: "https://issuer.example",
        redirectUrl: SITE,
        clientName: "Test App",
      });
    });

    it("rejects when the WebID document has no subject for the WebID", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue(null);

      const gateway = createSolidSessionGateway(options);
      await expect(gateway.login(WEBID)).rejects.toThrow(
        `Your WebID profile does not describe you.`,
      );
      expect(client.login).not.toHaveBeenCalled();
    });

    it("rejects when the profile declares no solid:oidcIssuer", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue({} as never);
      vi.mocked(getUrlAll).mockReturnValue([]);

      const gateway = createSolidSessionGateway(options);
      await expect(gateway.login(WEBID)).rejects.toThrow(
        "Your WebID profile does not say where you log in.",
      );
      expect(client.login).not.toHaveBeenCalled();
    });
  });

  describe("loginWithIssuer", () => {
    it("starts login at the given issuer without reading any profile", async () => {
      const gateway = createSolidSessionGateway(options);
      await gateway.loginWithIssuer("https://login.inrupt.com");

      expect(getSolidDataset).not.toHaveBeenCalled();
      expect(client.login).toHaveBeenCalledWith({
        oidcIssuer: "https://login.inrupt.com",
        redirectUrl: SITE,
        clientName: "Test App",
      });
    });
  });

  describe("the client ID", () => {
    it("is the site's Client ID Document, when the page is served from its folder", async () => {
      const gateway = createSolidSessionGateway({
        ...options,
        clientId: `${SITE}clientid.jsonld`,
      });
      await gateway.loginWithIssuer("https://login.inrupt.com");
      expect(client.login).toHaveBeenCalledWith({
        oidcIssuer: "https://login.inrupt.com",
        redirectUrl: SITE,
        clientName: "Test App",
        clientId: `${SITE}clientid.jsonld`,
      });
    });

    it("is left out on any other site, or without a document, so the app registers by its name", async () => {
      for (const clientId of [
        "https://other.example/clientid.jsonld",
        "https://memo.example/copy/clientid.jsonld",
        "http://memo.example/clientid.jsonld",
        null,
        undefined,
      ]) {
        client.login.mockClear();
        await createSolidSessionGateway({ ...options, clientId }).loginWithIssuer(
          "https://login.inrupt.com",
        );
        expect(client.login, String(clientId)).toHaveBeenCalledWith({
          oidcIssuer: "https://login.inrupt.com",
          redirectUrl: SITE,
          clientName: "Test App",
        });
      }
    });
  });

  describe("discoverOidcIssuer", () => {
    it("returns the issuer declared in the profile, not the WebID origin", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue({} as never);
      vi.mocked(getUrlAll).mockReturnValue(["https://idp.elsewhere.example"]);

      const gateway = createSolidSessionGateway(options);
      await expect(gateway.discoverOidcIssuer(WEBID)).resolves.toBe(
        "https://idp.elsewhere.example",
      );
    });

    it("skips issuers that are not https URLs", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue({} as never);
      vi.mocked(getUrlAll).mockReturnValue(["http://insecure.example", "https://issuer.example"]);

      const gateway = createSolidSessionGateway(options);
      await expect(gateway.discoverOidcIssuer(WEBID)).resolves.toBe("https://issuer.example");
    });

    it("rejects when no declared issuer is an https URL", async () => {
      vi.mocked(getSolidDataset).mockResolvedValue({} as never);
      vi.mocked(getThing).mockReturnValue({} as never);
      vi.mocked(getUrlAll).mockReturnValue(["javascript:alert(1)"]);

      const gateway = createSolidSessionGateway(options);
      await expect(gateway.login(WEBID)).rejects.toThrow("not a secure https:// address");
      expect(client.login).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("delegates to the client", async () => {
      const gateway = createSolidSessionGateway(options);
      await gateway.logout();
      expect(client.logout).toHaveBeenCalledOnce();
    });
  });

  describe("onSessionExpired", () => {
    it("notifies while subscribed and stops after unsubscribe", () => {
      const gateway = createSolidSessionGateway(options);
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
