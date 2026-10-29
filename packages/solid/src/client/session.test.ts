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
import { type SessionHarness, sessionContract } from "../testing/contract/session";
import type { LoginOptions } from "./interface";
import { createSessionClient } from "./session";

vi.mock("@inrupt/solid-client-authn-browser");

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

let emitter: ReturnType<typeof makeEmitter>;

/** The library, mocked: the provider's answers are what handleIncomingRedirect resolves to, and the events it fires. */
const harness: SessionHarness = {
  reset() {
    vi.resetAllMocks();
    window.localStorage.clear();
    emitter = makeEmitter();
    vi.mocked(events).mockReturnValue(emitter as never);
    vi.mocked(handleIncomingRedirect).mockResolvedValue({ isLoggedIn: false, sessionId: "s" });
  },
  create: createSessionClient,
  returnFromLogin(webId) {
    vi.mocked(handleIncomingRedirect).mockImplementation(async () => {
      emitter.emit(EVENTS.LOGIN);
      return { isLoggedIn: true, webId, sessionId: "s" };
    });
  },
  sessionToRestore(webId, from) {
    vi.mocked(handleIncomingRedirect).mockImplementation(async () => {
      if (from !== undefined) emitter.emit(EVENTS.SESSION_RESTORED, from);
      return { isLoggedIn: true, webId, sessionId: "s" };
    });
  },
  sessionAt(issuer) {
    window.localStorage.setItem("solidClientAuthn:currentSession", "s");
    window.localStorage.setItem(
      "solidClientAuthenticationUser:s",
      JSON.stringify({ issuer, clientId: "c", redirectUrl: "https://memo.example/" }),
    );
  },
  requestSentTo(issuer) {
    window.localStorage.setItem(
      "solidClientAuthenticationUser:state-1",
      JSON.stringify({ sessionId: "s" }),
    );
    window.localStorage.setItem(
      "solidClientAuthenticationUser:s",
      JSON.stringify({ issuer, codeVerifier: "v", redirectUrl: "https://memo.example/" }),
    );
    return "state-1";
  },
  failToRestore(error) {
    vi.mocked(handleIncomingRedirect).mockRejectedValue(error);
  },
  currentSession(fetch, webId) {
    vi.mocked(getDefaultSession).mockReturnValue({
      fetch,
      info: webId === undefined ? { isLoggedIn: false } : { isLoggedIn: true, webId },
    } as never);
  },
  logins: () => vi.mocked(login).mock.calls.map(([options]) => options as LoginOptions),
  logouts: () => vi.mocked(logout).mock.calls.length,
};

sessionContract(harness);

describe("createSessionClient, over the library", () => {
  beforeEach(() => harness.reset());

  it("asks the library to complete a login or restore the previous session", async () => {
    await createSessionClient().restore();
    expect(handleIncomingRedirect).toHaveBeenCalledWith({ restorePreviousSession: true });
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

  it("names no issuer for a session whose fields the library could not read either", async () => {
    window.localStorage.setItem("solidClientAuthn:currentSession", "s");
    for (const fields of [null, "not json", "null", JSON.stringify({ issuer: 1 })]) {
      if (fields === null) window.localStorage.removeItem("solidClientAuthenticationUser:s");
      else window.localStorage.setItem("solidClientAuthenticationUser:s", fields);
      await expect(createSessionClient().sessionIssuer(), String(fields)).resolves.toBeNull();
    }
  });

  it("names no issuer for a state whose session the library could not read", async () => {
    for (const fields of ["not json", JSON.stringify({ sessionId: 1 })]) {
      window.localStorage.setItem("solidClientAuthenticationUser:state-1", fields);
      await expect(createSessionClient().requestIssuer("state-1"), fields).resolves.toBeNull();
    }
  });

  it("stops listening for logins and restores afterward, even on failure", async () => {
    harness.failToRestore(new Error("boom"));
    await expect(createSessionClient().restore()).rejects.toThrow("boom");
    expect(emitter.count(EVENTS.LOGIN)).toBe(0);
    expect(emitter.count(EVENTS.SESSION_RESTORED)).toBe(0);
  });
});
