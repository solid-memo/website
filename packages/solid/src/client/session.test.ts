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
import { PROVIDER_REDIRECT_KEY } from "./providerRedirect";
import { createSessionClient } from "./session";

vi.mock("@inrupt/solid-client-authn-browser");

const WEBID = "https://alice.example/profile/card#me";
const LOGIN: LoginOptions = {
  oidcIssuer: "https://idp.example/",
  redirectUrl: "https://memo.example/",
  clientName: "Test App",
};

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

/** What the library answers handleIncomingRedirect with when the page's URL has no provider's answer. */
type Answer = () => Promise<Awaited<ReturnType<typeof handleIncomingRedirect>>>;

/** Where the library keeps a request it sent the user to the provider with, by its `state`. */
const requestKey = (state: string) => `solidClientAuthenticationUser:${state}`;

/**
 * The library's handleIncomingRedirect: it takes any `error`, or `code`
 * and `state`, on the page's URL for a redirect to complete, and one it
 * did not send the user for fails and ends the stored session; otherwise
 * it gives `answer`.
 */
function library(answer: Answer): void {
  vi.mocked(handleIncomingRedirect).mockImplementation(async () => {
    const { searchParams } = new URL(window.location.href);
    if (searchParams.has("error") || (searchParams.has("code") && searchParams.has("state"))) {
      emitter.emit(EVENTS.ERROR);
      return { isLoggedIn: false, sessionId: "s" };
    }
    return answer();
  });
}

/** This tab leaves for the provider, the library keeping the request it sends, by its state `s`. */
function leftForProvider(): void {
  window.sessionStorage.setItem(PROVIDER_REDIRECT_KEY, "login");
  window.localStorage.setItem(requestKey("s"), JSON.stringify({ sessionId: "s" }));
}

/** The provider sends the user back to this tab, which left for it, with a code. */
function sentBack(): void {
  leftForProvider();
  window.history.replaceState(null, "", "/?code=c&state=s&iss=https%3A%2F%2Fidp.example%2F");
}

/** The library, mocked: the provider's answers are what handleIncomingRedirect resolves to, and the events it fires. */
const harness: SessionHarness = {
  reset() {
    vi.resetAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    emitter = makeEmitter();
    vi.mocked(events).mockReturnValue(emitter as never);
    vi.mocked(handleIncomingRedirect).mockResolvedValue({ isLoggedIn: false, sessionId: "s" });
  },
  create: createSessionClient,
  returnFromLogin(webId) {
    sentBack();
    // The library completes the login it sent the user for.
    vi.mocked(handleIncomingRedirect).mockImplementation(async () => {
      emitter.emit(EVENTS.LOGIN);
      return { isLoggedIn: true, webId, sessionId: "s" };
    });
  },
  sessionToRestore(webId, from) {
    if (from !== undefined) {
      sentBack();
      vi.mocked(handleIncomingRedirect).mockImplementation(async () => {
        emitter.emit(EVENTS.SESSION_RESTORED, from);
        return { isLoggedIn: true, webId, sessionId: "s" };
      });
      return;
    }
    library(async () => ({ isLoggedIn: true, webId, sessionId: "s" }));
  },
  unaskedAnswer(search, awaiting) {
    if (awaiting) leftForProvider();
    window.history.replaceState(null, "", `/${search}#/study`);
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

  it("takes a provider's answer it did not ask for off the page's URL, keeping the route", async () => {
    harness.sessionToRestore(WEBID);
    window.history.replaceState(
      { kept: true },
      "",
      "/?lang=sv&code=a&state=b&iss=x&error=e&error_description=d#/study",
    );
    await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: WEBID });
    expect(window.location.search).toBe("?lang=sv");
    expect(window.location.hash).toBe("#/study");
    expect(window.history.state).toEqual({ kept: true });
  });

  it("leaves a URL with no provider's answer as it is", async () => {
    window.history.replaceState(null, "", "/?lang=sv#/study");
    const replace = vi.spyOn(window.history, "replaceState");
    await createSessionClient().restore();
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });

  it("hands the library the provider's answer once it left for the provider, then forgets that it did", async () => {
    harness.returnFromLogin(WEBID);
    const client = createSessionClient();
    await expect(client.restore()).resolves.toMatchObject({ webId: WEBID, fromLogin: true });
    expect(window.sessionStorage.getItem(PROVIDER_REDIRECT_KEY)).toBeNull();
    window.history.replaceState(null, "", "/?code=a&state=b");
    await client.restore();
    expect(window.location.search).toBe("");
  });

  it("hands the library an error that answers the request this tab sent, with its state", async () => {
    leftForProvider();
    window.history.replaceState(null, "", "/?error=login_required&state=s");
    await createSessionClient().restore();
    expect(window.location.search).toBe("?error=login_required&state=s");
  });

  it("takes off an answer to no request of this tab's, whether or not it awaits the provider", async () => {
    harness.sessionToRestore(WEBID);
    for (const search of ["?error=e", "?code=a&state=b", "?code=a&state=s"]) {
      window.sessionStorage.clear();
      window.localStorage.clear();
      if (search !== "?code=a&state=s") leftForProvider();
      else window.localStorage.setItem(requestKey("s"), "{}");
      window.history.replaceState(null, "", `/${search}#/study`);
      await expect(createSessionClient().restore()).resolves.toMatchObject({ webId: WEBID });
      expect(window.location.search).toBe("");
    }
  });

  it("marks the tab as left for the provider while a silent restore leaves the page", async () => {
    let settle = (): void => {};
    vi.mocked(handleIncomingRedirect).mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = () => resolve(undefined);
        }),
    );
    const restoring = createSessionClient().restore();
    await vi.waitFor(() => expect(handleIncomingRedirect).toHaveBeenCalled());
    expect(window.sessionStorage.getItem(PROVIDER_REDIRECT_KEY)).not.toBeNull();
    settle();
    await restoring;
    expect(window.sessionStorage.getItem(PROVIDER_REDIRECT_KEY)).toBeNull();
  });

  it("marks the tab as left for the provider on a login, and not once the login fails", async () => {
    await createSessionClient().login(LOGIN);
    expect(window.sessionStorage.getItem(PROVIDER_REDIRECT_KEY)).not.toBeNull();
    window.sessionStorage.clear();
    vi.mocked(login).mockRejectedValue(new Error("unreachable"));
    await expect(createSessionClient().login(LOGIN)).rejects.toThrow("unreachable");
    expect(window.sessionStorage.getItem(PROVIDER_REDIRECT_KEY)).toBeNull();
  });

  it("stops listening for logins and restores afterward, even on failure", async () => {
    harness.failToRestore(new Error("boom"));
    await expect(createSessionClient().restore()).rejects.toThrow("boom");
    expect(emitter.count(EVENTS.LOGIN)).toBe(0);
    expect(emitter.count(EVENTS.SESSION_RESTORED)).toBe(0);
  });
});
