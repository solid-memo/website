// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    // The session's WebID profile can't be read, so a session is kept unchecked (sessionIssuerCheck.test.ts).
    vi.mocked(getSolidDataset).mockRejectedValue(new Error("not read"));
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

    /**
     * The page leaves for the provider: restore does not settle until the
     * test ends it, so that the page does not outlive the test.
     */
    function pageLeaves() {
      let settle = () => {};
      client.restore.mockReturnValue(
        new Promise((resolve) => {
          settle = () => resolve({ webId: null, fromLogin: false, restoredFrom: null });
        }),
      );
      return () => settle();
    }

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

    it("drops an answer when this tab sent the browser to no provider, and restores the session", async () => {
      // A link with a provider's parameters, say, or an answer to a request another tab made.
      const answers: Record<string, string>[] = [
        { code: "c", state: "s", iss: ISSUER },
        { code: "c", state: "s" },
        { error: "login_required", state: "s" },
      ];
      client.sessionIssuer.mockResolvedValue(ISSUER);
      restored(false);
      for (const parameters of answers) {
        window.history.replaceState(
          null,
          "",
          `/?lang=sv&${new URLSearchParams(parameters)}#/study`,
        );
        await expect(createSolidSessionGateway(options).restore()).resolves.toEqual({
          session: { webId: WEBID },
          origin: "restored",
        });
        expect(window.location.search).toBe("?lang=sv");
        expect(window.location.hash).toBe("#/study");
      }
      expect(client.requestIssuer).not.toHaveBeenCalled();
      // A silent restore, as on any load, not the answer completed; then the session's check.
      expect(client.sessionIssuer).toHaveBeenCalledTimes(answers.length * 2);
    });

    it("keeps the session's provider before a silent restore leaves, and lets its answer through", async () => {
      client.sessionIssuer.mockResolvedValue(ISSUER);
      const settle = pageLeaves();
      const left = createSolidSessionGateway(options).restore();
      await vi.waitFor(() => expect(client.restore).toHaveBeenCalledOnce());
      expect(window.sessionStorage.getItem("solid-memo:login-issuer")).toBe(ISSUER);

      // The provider sends the user back; the page loads afresh.
      sendBack({ code: "c", state: "s", iss: ISSUER });
      restored(false);
      await expect(createSolidSessionGateway(options).restore()).resolves.toMatchObject({
        origin: "restored",
      });
      // Each load notes its attempt, and the answer's load checks the session too.
      expect(client.sessionIssuer).toHaveBeenCalledTimes(3);
      expect(window.sessionStorage.getItem("solid-memo:login-issuer")).toBeNull();
      expect(window.sessionStorage.getItem("solid-memo:restore-attempt")).toBeNull();
      settle();
      await left;
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

    it("lets an error answering a request to the provider it set off for through", async () => {
      const gateway = createSolidSessionGateway(options);
      await gateway.loginWithIssuer(ISSUER);
      sendBack({ error: "access_denied", state: "s", iss: ISSUER });
      await expect(gateway.restore()).resolves.toBeNull();
      expect(client.requestIssuer).toHaveBeenCalledWith("s");
      expect(client.restore).toHaveBeenCalledOnce();
    });

    it("refuses an error answering no request the client holds, or with no state", async () => {
      const answers: Record<string, string>[] = [
        { error: "login_required", state: "unknown", iss: ISSUER },
        { error: "login_required", iss: ISSUER },
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

    it("keeps the provider and the attempt before passing an answer to a client that may leave", async () => {
      client.sessionIssuer.mockResolvedValue(ISSUER);
      const settle = pageLeaves();
      window.sessionStorage.setItem("solid-memo:login-issuer", ISSUER);
      sendBack({ code: "c", state: "s", iss: ISSUER });
      const left = createSolidSessionGateway(options).restore();
      await vi.waitFor(() => expect(client.restore).toHaveBeenCalledOnce());
      expect(window.sessionStorage.getItem("solid-memo:login-issuer")).toBe(ISSUER);
      expect(window.sessionStorage.getItem("solid-memo:restore-attempt")).toContain(ISSUER);
      settle();
      await left;
    });

    it("leaves an address without an answer to the client", async () => {
      sendBack({ state: "s" });
      const gateway = createSolidSessionGateway(options);
      await expect(gateway.restore()).resolves.toBeNull();
      expect(client.restore).toHaveBeenCalledOnce();
    });
  });

  describe("restore, when the provider keeps the page waiting", () => {
    const ISSUER = "https://issuer.example/";
    const DEADLINE_MS = 60_000;

    /** A session is stored at the provider, and restoring it never settles. */
    function neverSettles() {
      client.sessionIssuer.mockResolvedValue(ISSUER);
      client.restore.mockReturnValue(new Promise(() => {}));
    }

    /** How a load came about, as the browser reports it. */
    function loadedBy(type: string) {
      vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
        { type } as PerformanceNavigationTiming,
      ]);
    }

    /** This tab set off on a silent restore this long ago, and left. */
    function attemptMade(age: number) {
      window.sessionStorage.setItem(
        "solid-memo:restore-attempt",
        JSON.stringify({ issuer: ISSUER, at: Date.now() - age }),
      );
      window.sessionStorage.setItem("solid-memo:login-issuer", ISSUER);
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(async () => {
      // No page of a test stays waiting, to answer the next test's events.
      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    /** A restore that left for the provider, whatever becomes of it after the test. */
    async function restoreThatLeft() {
      neverSettles();
      const restoring = createSolidSessionGateway(options).restore();
      restoring.catch(() => {});
      await vi.waitFor(() => expect(client.restore).toHaveBeenCalledOnce());
      return { restoring };
    }

    /** The browser brings the page back: from its back/forward cache, or not. */
    function pageShown(persisted: boolean) {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));
    }

    it("gives up at the deadline, ends the stored session and keeps nothing for an answer", async () => {
      neverSettles();
      const restoring = createSolidSessionGateway(options).restore();
      const given = expect(restoring).rejects.toMatchObject({
        code: "restoreTimedOut",
        vars: { seconds: DEADLINE_MS / 1000 },
      });
      await vi.advanceTimersByTimeAsync(DEADLINE_MS - 1);
      expect(client.forgetSession).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem("solid-memo:restore-attempt")).toContain(ISSUER);
      await vi.advanceTimersByTimeAsync(1);
      await given;
      expect(client.forgetSession).toHaveBeenCalledOnce();
      expect(window.sessionStorage.getItem("solid-memo:login-issuer")).toBeNull();
      expect(window.sessionStorage.getItem("solid-memo:restore-attempt")).toBeNull();
    });

    it("still restores with a provider that answers just inside the deadline", async () => {
      client.sessionIssuer.mockResolvedValue(ISSUER);
      client.restore.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () => resolve({ webId: WEBID, fromLogin: false, restoredFrom: null }),
              DEADLINE_MS - 1,
            );
          }),
      );
      const restoring = createSolidSessionGateway(options).restore();
      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      await expect(restoring).resolves.toMatchObject({ origin: "restored" });
      expect(client.forgetSession).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("ends the stored session after a silent restore that fails, so the next visit does not repeat it", async () => {
      client.sessionIssuer.mockResolvedValue(ISSUER);
      client.restore.mockRejectedValue(new Error("boom"));
      await expect(createSolidSessionGateway(options).restore()).rejects.toThrow("boom");
      expect(client.forgetSession).toHaveBeenCalledOnce();
    });

    it("keeps the stored session when the browser is offline, which says nothing of the provider", async () => {
      vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
      client.sessionIssuer.mockResolvedValue(ISSUER);
      client.restore.mockRejectedValue(new Error("boom"));
      await expect(createSolidSessionGateway(options).restore()).rejects.toThrow("boom");
      expect(client.forgetSession).not.toHaveBeenCalled();
    });

    it("gets past a stored session that can't be ended, still with the restore's error", async () => {
      neverSettles();
      client.forgetSession.mockReturnValue(new Promise(() => {}));
      const given = expect(createSolidSessionGateway(options).restore()).rejects.toMatchObject({
        code: "restoreTimedOut",
      });
      await vi.advanceTimersByTimeAsync(2 * DEADLINE_MS);
      await given;
      expect(vi.getTimerCount()).toBe(0);

      client.forgetSession.mockRejectedValue(new Error("blocked"));
      const again = expect(createSolidSessionGateway(options).restore()).rejects.toMatchObject({
        code: "restoreTimedOut",
      });
      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      await again;
    });

    it.each([
      ["took the attempt", null],
      ["set off on its own", JSON.stringify({ issuer: ISSUER, at: Date.now() + 1 })],
    ])(
      "leaves the session and the keys alone at the deadline when a later load %s",
      async (_, later) => {
        const { restoring } = await restoreThatLeft();
        window.sessionStorage.removeItem("solid-memo:restore-attempt");
        window.sessionStorage.removeItem("solid-memo:login-issuer");
        if (later !== null) {
          window.sessionStorage.setItem("solid-memo:restore-attempt", later);
          window.sessionStorage.setItem("solid-memo:login-issuer", ISSUER);
        }

        await vi.advanceTimersByTimeAsync(DEADLINE_MS);

        await expect(restoring).rejects.toMatchObject({ code: "restoreTimedOut" });
        expect(client.forgetSession).not.toHaveBeenCalled();
        expect(window.sessionStorage.getItem("solid-memo:restore-attempt")).toBe(later);
        expect(window.sessionStorage.getItem("solid-memo:login-issuer")).toBe(
          later === null ? null : ISSUER,
        );
      },
    );

    it("reloads a page the browser brings back from its cache after a later load took its attempt", async () => {
      const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
      const { restoring } = await restoreThatLeft();

      pageShown(true);
      expect(reload).not.toHaveBeenCalled();
      window.sessionStorage.removeItem("solid-memo:restore-attempt");
      pageShown(false);
      expect(reload).not.toHaveBeenCalled();
      pageShown(true);
      expect(reload).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      await expect(restoring).rejects.toMatchObject({ code: "restoreTimedOut" });
      pageShown(true);
      expect(reload).toHaveBeenCalledOnce();
    });

    it("waits for the deadline, then ends the stored session, when the page brought back still holds its attempt", async () => {
      const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
      const { restoring } = await restoreThatLeft();
      pageShown(true);
      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      await expect(restoring).rejects.toMatchObject({ code: "restoreTimedOut" });
      expect(reload).not.toHaveBeenCalled();
      expect(client.forgetSession).toHaveBeenCalledOnce();
    });

    it.each(["back_forward", "navigate"])(
      "skips the silent restore, and ends the stored session, when an attempt found by a %s load is past what a working provider takes",
      async (type) => {
        attemptMade(DEADLINE_MS);
        loadedBy(type);
        await expect(createSolidSessionGateway(options).restore()).rejects.toMatchObject({
          code: "restoreNotReturned",
          vars: { issuer: ISSUER },
        });
        expect(client.restore).not.toHaveBeenCalled();
        expect(client.sessionIssuer).not.toHaveBeenCalled();
        expect(client.forgetSession).toHaveBeenCalledOnce();
        expect(window.sessionStorage.getItem("solid-memo:restore-attempt")).toBeNull();
      },
    );

    it.each(["back_forward", "navigate"])(
      "skips the silent restore but keeps the stored session when an attempt found by a %s load is young",
      async (type) => {
        await restoreThatLeft();

        // The page loads afresh with no answer, by the learner or by another page.
        loadedBy(type);
        client.restore.mockClear();
        await expect(createSolidSessionGateway(options).restore()).rejects.toMatchObject({
          code: "restoreNotReturned",
          vars: { issuer: ISSUER },
        });
        expect(client.restore).not.toHaveBeenCalled();
        expect(client.forgetSession).not.toHaveBeenCalled();
        expect(window.sessionStorage.getItem("solid-memo:restore-attempt")).toBeNull();
      },
    );

    it("restores anew when the learner reloaded the page, which had not left", async () => {
      await restoreThatLeft();

      loadedBy("reload");
      restored(false);
      await expect(createSolidSessionGateway(options).restore()).resolves.toMatchObject({
        origin: "restored",
      });
      expect(client.forgetSession).not.toHaveBeenCalled();
    });

    it("takes a silent restore's answer as answered, not as a provider that never came back", async () => {
      attemptMade(0);
      client.requestIssuer.mockResolvedValue(ISSUER);
      window.history.replaceState(null, "", `/?code=c&state=s&iss=${encodeURIComponent(ISSUER)}`);
      restored(false);
      await expect(createSolidSessionGateway(options).restore()).resolves.toMatchObject({
        origin: "restored",
      });
      expect(client.forgetSession).not.toHaveBeenCalled();
    });

    it.each([0, DEADLINE_MS])(
      "keeps the stored session when an answer to an attempt %i ms old is refused, as another page can send one",
      async (age) => {
        const iss = encodeURIComponent(ISSUER);
        const answers = [
          ["/?error=x", "loginIssuerMissing"],
          ["/?error=x&iss=https%3A%2F%2Fother.example%2F", "loginIssuerMismatch"],
          [`/?error=x&iss=${iss}`, "loginNotStarted"],
          [`/?error=x&state=unknown&iss=${iss}`, "loginNotStarted"],
          [`/?code=c&state=unknown&iss=${iss}`, "loginNotStarted"],
        ] as const;
        client.sessionIssuer.mockResolvedValue(ISSUER);
        for (const [address, code] of answers) {
          attemptMade(age);
          loadedBy("navigate");
          window.history.replaceState(null, "", address);
          await expect(createSolidSessionGateway(options).restore()).rejects.toMatchObject({
            code,
          });
          expect(window.location.search).toBe("");
        }
        expect(client.restore).not.toHaveBeenCalled();
        expect(client.forgetSession).not.toHaveBeenCalled();
      },
    );

    it("ends the stored session when a silent restore's accepted answer fails", async () => {
      attemptMade(0);
      client.requestIssuer.mockResolvedValue(ISSUER);
      client.restore.mockRejectedValue(new Error("boom"));
      window.history.replaceState(null, "", `/?code=c&state=s&iss=${encodeURIComponent(ISSUER)}`);
      await expect(createSolidSessionGateway(options).restore()).rejects.toThrow("boom");
      expect(client.forgetSession).toHaveBeenCalledOnce();
      expect(window.location.search).toBe("");
    });

    it("gives up on a login's answer at the deadline, leaving the stored session and clearing the address", async () => {
      window.sessionStorage.setItem("solid-memo:login-issuer", ISSUER);
      client.requestIssuer.mockResolvedValue(ISSUER);
      client.restore.mockReturnValue(new Promise(() => {}));
      window.history.replaceState(null, "", `/?code=c&state=s&iss=${encodeURIComponent(ISSUER)}`);
      const given = expect(createSolidSessionGateway(options).restore()).rejects.toMatchObject({
        code: "restoreTimedOut",
      });
      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      await given;
      expect(client.forgetSession).not.toHaveBeenCalled();
      expect(window.location.search).toBe("");
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

  describe("onReturnedWithoutSession", () => {
    /** The page shown again, from the back/forward cache or not, and time for the client to answer. */
    async function shown(persisted: boolean) {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));
      await new Promise((resolve) => setTimeout(resolve));
    }

    it("notifies when the page returns from the cache with no session stored", async () => {
      client.sessionIssuer.mockResolvedValue(null);
      const listener = vi.fn();
      const unsubscribe = createSolidSessionGateway(options).onReturnedWithoutSession(listener);
      await shown(true);
      expect(listener).toHaveBeenCalledOnce();
      unsubscribe();
    });

    it("stays quiet while a session is stored", async () => {
      client.sessionIssuer.mockResolvedValue("https://issuer.example/");
      const listener = vi.fn();
      const unsubscribe = createSolidSessionGateway(options).onReturnedWithoutSession(listener);
      await shown(true);
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("takes a store it can't read for no session", async () => {
      client.sessionIssuer.mockRejectedValue(new Error("storage refused"));
      const listener = vi.fn();
      const unsubscribe = createSolidSessionGateway(options).onReturnedWithoutSession(listener);
      await shown(true);
      expect(listener).toHaveBeenCalledOnce();
      unsubscribe();
    });

    it("doesn't ask on a page's ordinary load", async () => {
      const listener = vi.fn();
      const unsubscribe = createSolidSessionGateway(options).onReturnedWithoutSession(listener);
      await shown(false);
      expect(client.sessionIssuer).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("stops after unsubscribe", async () => {
      const listener = vi.fn();
      createSolidSessionGateway(options).onReturnedWithoutSession(listener)();
      await shown(true);
      expect(client.sessionIssuer).not.toHaveBeenCalled();
    });
  });
});
