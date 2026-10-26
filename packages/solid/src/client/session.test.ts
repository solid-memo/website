// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EVENTS,
  events,
  getDefaultSession,
  handleIncomingRedirect,
  login,
  logout,
} from "@inrupt/solid-client-authn-browser";
import { createSessionClient } from "./session";

vi.mock("@inrupt/solid-client-authn-browser");

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

describe("createSessionClient", () => {
  let emitter: ReturnType<typeof makeEmitter>;

  beforeEach(() => {
    vi.resetAllMocks();
    emitter = makeEmitter();
    vi.mocked(events).mockReturnValue(emitter as never);
  });

  describe("restore", () => {
    it("restores the previous session silently, and says so", async () => {
      vi.mocked(handleIncomingRedirect).mockResolvedValue({
        isLoggedIn: true,
        webId: WEBID,
        sessionId: "s",
      });
      await expect(createSessionClient().restore()).resolves.toEqual({
        webId: WEBID,
        fromLogin: false,
        restoredFrom: null,
      });
      expect(handleIncomingRedirect).toHaveBeenCalledWith({ restorePreviousSession: true });
    });

    it("reports a login when the library announces one", async () => {
      vi.mocked(handleIncomingRedirect).mockImplementation(async () => {
        emitter.emit(EVENTS.LOGIN);
        return { isLoggedIn: true, webId: WEBID, sessionId: "s" };
      });
      await expect(createSessionClient().restore()).resolves.toMatchObject({ fromLogin: true });
    });

    it("reports the page a silent restore left from", async () => {
      vi.mocked(handleIncomingRedirect).mockImplementation(async () => {
        emitter.emit(EVENTS.SESSION_RESTORED, "https://memo.example/#/studio");
        return { isLoggedIn: true, webId: WEBID, sessionId: "s" };
      });
      await expect(createSessionClient().restore()).resolves.toMatchObject({
        restoredFrom: "https://memo.example/#/studio",
      });
    });

    it("finds no one without session info, logged out, or without a WebID", async () => {
      for (const info of [
        undefined,
        { isLoggedIn: false, sessionId: "s" },
        { isLoggedIn: true, sessionId: "s" },
      ]) {
        vi.mocked(handleIncomingRedirect).mockResolvedValue(info);
        await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: null });
      }
    });

    it("stops listening for logins and restores afterward, even on failure", async () => {
      vi.mocked(handleIncomingRedirect).mockRejectedValue(new Error("boom"));
      await expect(createSessionClient().restore()).rejects.toThrow("boom");
      expect(emitter.count(EVENTS.LOGIN)).toBe(0);
      expect(emitter.count(EVENTS.SESSION_RESTORED)).toBe(0);
    });
  });

  it("logs in with the options it is given", async () => {
    const options = {
      oidcIssuer: "https://issuer.example",
      redirectUrl: "https://memo.example/",
      clientName: "Test App",
      clientId: "https://memo.example/clientid.jsonld",
    };
    await createSessionClient().login(options);
    expect(login).toHaveBeenCalledWith(options);
  });

  it("logs out through the library", async () => {
    await createSessionClient().logout();
    expect(logout).toHaveBeenCalledOnce();
  });

  it("fetches with the session current at each call, not the one at creation", async () => {
    const client = createSessionClient();
    const before = vi.fn(async () => new Response("before"));
    const after = vi.fn(async () => new Response("after"));
    vi.mocked(getDefaultSession).mockReturnValue({ fetch: before } as never);
    await client.fetch("https://pod.example/a");
    vi.mocked(getDefaultSession).mockReturnValue({ fetch: after } as never);
    await client.fetch("https://pod.example/b", { method: "HEAD" });

    expect(before).toHaveBeenCalledWith("https://pod.example/a", undefined);
    expect(after).toHaveBeenCalledWith("https://pod.example/b", { method: "HEAD" });
  });

  it("is the session's WebID while logged in, none otherwise", () => {
    const client = createSessionClient();
    vi.mocked(getDefaultSession).mockReturnValue({
      info: { isLoggedIn: true, webId: WEBID },
    } as never);
    expect(client.webId()).toBe(WEBID);
    vi.mocked(getDefaultSession).mockReturnValue({ info: { isLoggedIn: false } } as never);
    expect(client.webId()).toBeUndefined();
  });
});
