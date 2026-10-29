// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginOptions, SessionClient } from "../../client/interface";

/**
 * A sign-in client under test, with the means to set up what the
 * identity provider and the browser hold, which differ by
 * implementation: a test of the contract sets one up, then asks the
 * client.
 */
export interface SessionHarness {
  /** Starts afresh: no session, no login under way, nothing asked yet. */
  reset(): void;
  /** A new client of the implementation. */
  create(): SessionClient;
  /** The provider has just sent the user back from a login, as `webId`. */
  returnFromLogin(webId: string): void;
  /** A session from before is there to restore silently, as `webId`, leaving `from` if given. */
  sessionToRestore(webId: string, from?: string): void;
  /** A session from before, at `issuer`, is kept for a silent restore. */
  sessionAt(issuer: string): void;
  /** A login request to `issuer` is under way; gives its state. */
  requestSentTo(issuer: string): string;
  /**
   * The page's URL has a provider's answer, `search`, that no login or
   * restore of this tab's asked for; with `awaiting`, the tab has left
   * for the provider and awaits the answer to another request.
   */
  unaskedAnswer(search: string, awaiting: boolean): void;
  /** Restoring fails with `error`. */
  failToRestore(error: Error): void;
  /** The session now fetches with `fetch`, and is `webId`'s (none: logged out). */
  currentSession(fetch: typeof globalThis.fetch, webId?: string): void;
  /** What the provider was asked to log in with, in order. */
  logins(): LoginOptions[];
  /** How many times the session was ended. */
  logouts(): number;
}

const WEBID = "https://alice.example/profile/card#me";

/**
 * What the app relies on of the sign-in client (SessionClient,
 * client/interface.ts): an implementation passes these, or signing in
 * breaks. The user journeys log in against a real server (e2e/journeys).
 */
export function sessionContract(harness: SessionHarness): void {
  describe("the sign-in client", () => {
    beforeEach(() => harness.reset());

    describe("restore", () => {
      it("restores the previous session silently, and says so", async () => {
        harness.sessionToRestore(WEBID);
        await expect(harness.create().restore()).resolves.toEqual({
          webId: WEBID,
          fromLogin: false,
          restoredFrom: null,
        });
      });

      it("reports a login the provider sent the user back from", async () => {
        harness.returnFromLogin(WEBID);
        await expect(harness.create().restore()).resolves.toEqual({
          webId: WEBID,
          fromLogin: true,
          restoredFrom: null,
        });
      });

      it("reports the page a silent restore left from", async () => {
        harness.sessionToRestore(WEBID, "https://memo.example/#/studio");
        await expect(harness.create().restore()).resolves.toMatchObject({
          webId: WEBID,
          restoredFrom: "https://memo.example/#/studio",
        });
      });

      it("restores the previous session past a provider's answer the tab did not ask for", async () => {
        for (const awaiting of [false, true]) {
          for (const search of ["?error=access_denied", "?code=a&state=b", "?error=e&state=b"]) {
            harness.reset();
            harness.sessionToRestore(WEBID);
            harness.unaskedAnswer(search, awaiting);
            await expect(harness.create().restore()).resolves.toEqual({
              webId: WEBID,
              fromLogin: false,
              restoredFrom: null,
            });
          }
        }
      });

      it("finds no one when there is no session", async () => {
        await expect(harness.create().restore()).resolves.toEqual({
          webId: null,
          fromLogin: false,
          restoredFrom: null,
        });
      });

      it("rejects when restoring fails", async () => {
        harness.failToRestore(new Error("boom"));
        await expect(harness.create().restore()).rejects.toThrow("boom");
      });
    });

    describe("sessionIssuer", () => {
      it("names the issuer of the session a silent restore would go to", async () => {
        harness.sessionAt("https://issuer.example/");
        await expect(harness.create().sessionIssuer()).resolves.toBe("https://issuer.example/");
      });

      it("names none when there is no session", async () => {
        await expect(harness.create().sessionIssuer()).resolves.toBeNull();
      });
    });

    describe("requestIssuer", () => {
      it("names the issuer a login request went to, by its state", async () => {
        const state = harness.requestSentTo("https://issuer.example/");
        await expect(harness.create().requestIssuer(state)).resolves.toBe(
          "https://issuer.example/",
        );
      });

      it("names none for a state it sent no request with", async () => {
        harness.requestSentTo("https://issuer.example/");
        await expect(harness.create().requestIssuer("unknown")).resolves.toBeNull();
      });
    });

    it("logs in with the options it is given", async () => {
      const options = {
        oidcIssuer: "https://issuer.example",
        redirectUrl: "https://memo.example/",
        clientName: "Test App",
        clientId: "https://memo.example/clientid.jsonld",
      };
      await harness.create().login(options);
      expect(harness.logins()).toEqual([options]);
    });

    it("logs out", async () => {
      await harness.create().logout();
      expect(harness.logouts()).toBe(1);
    });

    it("fetches with the session current at each call, not the one at creation", async () => {
      const client = harness.create();
      const before = vi.fn(async () => new Response("before"));
      const after = vi.fn(async () => new Response("after"));
      harness.currentSession(before, WEBID);
      await client.fetch("https://pod.example/a");
      harness.currentSession(after, WEBID);
      await client.fetch("https://pod.example/b", { method: "HEAD" });
      expect(before).toHaveBeenCalledWith("https://pod.example/a", undefined);
      expect(after).toHaveBeenCalledWith("https://pod.example/b", { method: "HEAD" });
    });

    it("is the session's WebID while logged in, none otherwise", () => {
      const client = harness.create();
      const fetch = vi.fn<typeof globalThis.fetch>();
      harness.currentSession(fetch, WEBID);
      expect(client.webId()).toBe(WEBID);
      harness.currentSession(fetch);
      expect(client.webId()).toBeUndefined();
    });
  });
}
