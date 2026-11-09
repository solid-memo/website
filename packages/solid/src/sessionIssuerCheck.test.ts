// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A session's WebID profile must name the session's issuer: the session
 * gateway reads the profile from a pod in memory, through the swappable
 * client, as a session is established.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import { PROFILE_LIMITS } from "./client/readLimits";
import { createSolidSessionGateway } from "./solidSessionGateway";
import { fakePod } from "./testing/fakePod";
import { fakeSessionClient } from "./testing/fakeSessionClient";

const CARD = "https://alice.example/profile/card";
const WEBID = `${CARD}#me`;
const OIDC_ISSUER = "<http://www.w3.org/ns/solid/terms#oidcIssuer>";
const ISSUER = "https://idp.example/";

/** A WebID document whose WebID names these issuers. */
function card(...issuers: string[]): string {
  return issuers.map((issuer) => `<#me> ${OIDC_ISSUER} <${issuer}> .\n`).join("");
}

describe("the session's issuer in its WebID's profile", () => {
  let client: ReturnType<typeof fakeSessionClient>;
  let reads: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

  /** A gateway whose client finds a session, on a login or restored, at `issuer`. */
  function establish({ fromLogin = false, issuer = ISSUER } = {}) {
    client.restore.mockResolvedValue({ webId: WEBID, fromLogin, restoredFrom: null });
    client.sessionIssuer.mockResolvedValue(issuer);
    return createSolidSessionGateway({
      clientName: "Test App",
      site: "https://memo.example/",
      client,
    });
  }

  /** The profile the pod holds is `turtle`, read through the browser's fetch, as no one. */
  async function profile(turtle: string) {
    const pod = fakePod();
    await pod.put(CARD, turtle);
    reads.mockImplementation((input, init) => pod.fetch(String(input).split("#")[0]!, init));
  }

  beforeEach(() => {
    client = fakeSessionClient();
    reads = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", reads);
    window.sessionStorage.clear();
    window.history.replaceState(null, "", window.location.pathname);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("refuses and ends a session", () => {
    it("whose provider claims the WebID of someone whose profile names another", async () => {
      await profile(card(ISSUER));
      for (const fromLogin of [true, false]) {
        client.logout.mockClear();
        const gateway = establish({ fromLogin, issuer: "https://evil.example/" });
        const refused = await gateway.restore().catch((error: unknown) => error);
        expect(refused).toBeInstanceOf(AppError);
        expect(refused).toMatchObject({
          code: "webIdIssuerNotListed",
          detail: `webId: ${WEBID}\nissuer: https://evil.example/`,
        });
        expect(client.logout).toHaveBeenCalledOnce();
      }
    });

    it("whose profile names no issuer, or does not describe the WebID", async () => {
      for (const turtle of ['<#me> <http://xmlns.com/foaf/0.1/name> "Alice" .\n', ""]) {
        await profile(turtle);
        await expect(establish().restore()).rejects.toMatchObject({
          code: "webIdIssuerNotListed",
        });
      }
    });

    it("before it returns the page to a route", async () => {
      await profile(card(ISSUER));
      const gateway = establish({ issuer: "https://evil.example/" });
      client.restore.mockResolvedValue({
        webId: WEBID,
        fromLogin: false,
        restoredFrom: "https://memo.example/#/studio",
      });
      await expect(gateway.restore()).rejects.toMatchObject({ code: "webIdIssuerNotListed" });
      expect(window.location.hash).toBe("");
    });

    it("even if ending it fails", async () => {
      await profile(card(ISSUER));
      client.logout.mockRejectedValue(new Error("storage is gone"));
      await expect(establish({ issuer: "https://evil.example/" }).restore()).rejects.toMatchObject({
        code: "webIdIssuerNotListed",
      });
    });
  });

  describe("keeps a session", () => {
    it("whose issuer the profile names, among others too, on a login or restored", async () => {
      await profile(card("https://other.example/", ISSUER));
      for (const fromLogin of [true, false]) {
        await expect(establish({ fromLogin }).restore()).resolves.toMatchObject({
          session: { webId: WEBID },
        });
      }
      expect(client.logout).not.toHaveBeenCalled();
    });

    it("whose issuer is written with or without its trailing slash", async () => {
      await profile(card("https://idp.example"));
      await expect(establish().restore()).resolves.not.toBeNull();
      await profile(card(ISSUER));
      await expect(establish({ issuer: "https://idp.example" }).restore()).resolves.not.toBeNull();
      expect(client.logout).not.toHaveBeenCalled();
    });

    it("when the profile can't be read: an error, no network, or past the limits", async () => {
      const unreadable: (() => Promise<void>)[] = [
        async () => {
          reads.mockResolvedValue(new Response("gone", { status: 404 }));
        },
        async () => {
          reads.mockRejectedValue(new TypeError("Failed to fetch"));
        },
        async () => {
          await profile(
            Array.from(
              { length: PROFILE_LIMITS.quads + 1 },
              (_, i) => `<#s${i}> <http://example.org/p> "${i}" .\n`,
            ).join(""),
          );
        },
      ];
      for (const setUp of unreadable) {
        await setUp();
        await expect(establish().restore()).resolves.not.toBeNull();
      }
      expect(client.logout).not.toHaveBeenCalled();
    });

    it("when the pod does not answer in time, aborting the read", async () => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      reads.mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            signal?.addEventListener("abort", () => reject(signal?.reason));
          }),
      );
      const restoring = establish().restore();
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(restoring).resolves.not.toBeNull();
      expect(signal?.aborted).toBe(true);
      expect(client.logout).not.toHaveBeenCalled();
    });

    it("whose issuer the client can't name, reading nothing", async () => {
      const gateway = establish();
      client.sessionIssuer.mockResolvedValue(null);
      await expect(gateway.restore()).resolves.not.toBeNull();
      // Asked first as the restore sets off, then for the check.
      client.sessionIssuer
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error("storage is gone"));
      await expect(gateway.restore()).resolves.not.toBeNull();
      expect(reads).not.toHaveBeenCalled();
    });
  });

  describe("refuses and ends a session whose WebID is too long", () => {
    /** A WebID of exactly 512 characters, the most a session's may have. */
    const longest = `https://alice.example/${"a".repeat(512 - "https://alice.example/#me".length)}#me`;

    it("past 512 characters, before it reads anything, on a login or restored", async () => {
      expect(longest).toHaveLength(512);
      const deep = `https://evil.example/${"a/".repeat(64_000)}card#me`;
      for (const fromLogin of [true, false]) {
        client.logout.mockClear();
        const gateway = establish({ fromLogin });
        for (const webId of [deep, `${longest.slice(0, -3)}a#me`]) {
          client.restore.mockResolvedValue({ webId, fromLogin, restoredFrom: null });
          await expect(gateway.restore()).rejects.toMatchObject({
            code: "webIdTooLong",
            detail: `characters: ${webId.length}`,
          });
        }
        expect(client.logout).toHaveBeenCalledTimes(2);
      }
      expect(reads).not.toHaveBeenCalled();
    });

    it("even if ending it fails, and keeps one of 512 characters", async () => {
      client.logout.mockRejectedValue(new Error("storage is gone"));
      const gateway = establish();
      client.restore.mockResolvedValue({
        webId: `${longest}e`,
        fromLogin: false,
        restoredFrom: null,
      });
      await expect(gateway.restore()).rejects.toMatchObject({ code: "webIdTooLong" });
      reads.mockResolvedValue(new Response("gone", { status: 404 }));
      client.restore.mockResolvedValue({ webId: longest, fromLogin: false, restoredFrom: null });
      await expect(gateway.restore()).resolves.toMatchObject({ session: { webId: longest } });
    });
  });

  it("reads nothing when there is no session", async () => {
    const gateway = establish();
    client.restore.mockResolvedValue({ webId: null, fromLogin: false, restoredFrom: null });
    await expect(gateway.restore()).resolves.toBeNull();
    expect(reads).not.toHaveBeenCalled();
  });

  describe("the read", () => {
    it("asks the pod, not the browser's cache, so a provider just added counts", async () => {
      await profile(card(ISSUER));
      await establish().restore();
      expect(reads.mock.calls[0]?.[1]?.cache).toBe("no-cache");
    });

    it("serves the account's lookup that follows a login, once", async () => {
      await profile(card(ISSUER));
      const gateway = establish({ fromLogin: true });
      await gateway.restore();
      expect(reads).toHaveBeenCalledOnce();
      await expect(gateway.discoverOidcIssuer(WEBID)).resolves.toBe(ISSUER);
      expect(reads).toHaveBeenCalledOnce();
      await expect(gateway.discoverOidcIssuer(WEBID)).resolves.toBe(ISSUER);
      expect(reads).toHaveBeenCalledTimes(2);
    });

    it("does not serve a lookup after a logout", async () => {
      await profile(card(ISSUER));
      const gateway = establish({ fromLogin: true });
      await gateway.restore();
      await gateway.logout();
      await gateway.discoverOidcIssuer(WEBID);
      expect(reads).toHaveBeenCalledTimes(2);
    });

    it("does not serve a lookup of another WebID", async () => {
      await profile(`${card(ISSUER)}<#you> ${OIDC_ISSUER} <https://you.example/> .\n`);
      const gateway = establish({ fromLogin: true });
      await gateway.restore();
      await expect(gateway.discoverOidcIssuer(`${CARD}#you`)).resolves.toBe("https://you.example/");
      expect(reads).toHaveBeenCalledTimes(2);
    });

    it("is not kept when the session was restored, for a login much later", async () => {
      await profile(card(ISSUER));
      const gateway = establish();
      await gateway.restore();
      await gateway.discoverOidcIssuer(WEBID);
      expect(reads).toHaveBeenCalledTimes(2);
    });
  });
});
