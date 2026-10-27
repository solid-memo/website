// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { afterEach, describe, expect, it, vi } from "vitest";
import { anonymousFetch, createAuthFetch, SESSION_EXPIRED_EVENT } from "./authFetch";
import { fakeSessionClient } from "./testing/fakeSessionClient";

const URL_ = "https://pod.example/resource";

/** What a browser's fetch gives for a redirect it doesn't follow (`redirect: "manual"`). */
function opaqueRedirect(): Response {
  const response = new Response(null);
  Object.defineProperty(response, "type", { value: "opaqueredirect" });
  return response;
}

/** The sign-in client's fetch as a browser's is with `redirect: "error"`, on an address that redirects. */
function redirectingClient() {
  const client = fakeSessionClient();
  client.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
  return client;
}

describe("createAuthFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("delegates to the client's fetch, following no redirect", async () => {
    const client = fakeSessionClient();
    const response = new Response("ok");
    client.fetch.mockResolvedValue(response);

    const result = await createAuthFetch(client)(URL_, { method: "HEAD", redirect: "follow" });

    expect(result).toBe(response);
    expect(client.fetch).toHaveBeenCalledWith(URL_, { method: "HEAD", redirect: "error" });
  });

  it("refuses a write the address redirects, before any credentials follow it", async () => {
    const client = redirectingClient();
    const fetch = vi.fn(async () => opaqueRedirect());
    vi.stubGlobal("fetch", fetch);

    const write = createAuthFetch(client)(URL_, { method: "PUT", body: "<#a> <#b> <#c> ." });

    await expect(write).rejects.toEqual(
      new AppError("redirectRefused", { method: "PUT", url: URL_ }),
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(URL_, {
      method: "HEAD",
      redirect: "manual",
      credentials: "omit",
    });
  });

  it("refuses a Request's write that a server redirects by its status", async () => {
    const client = redirectingClient();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 307, headers: { Location: "/x.acl" } })),
    );

    await expect(
      createAuthFetch(client)(new Request(URL_, { method: "PATCH", body: "" })),
    ).rejects.toMatchObject({ code: "redirectRefused", vars: { method: "PATCH", url: URL_ } });
  });

  it("reads an address that redirects as no one, the redirect followed", async () => {
    const client = redirectingClient();
    const profile = new Response("<#me> a <#Person> .");
    Object.defineProperty(profile, "redirected", { value: true });
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "HEAD" ? opaqueRedirect() : profile,
    );
    vi.stubGlobal("fetch", fetch);
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    const result = await createAuthFetch(client)(URL_, { headers: { Accept: "text/turtle" } });

    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
    expect(result).toBe(profile);
    expect(fetch).toHaveBeenLastCalledWith(URL_, {
      headers: { Accept: "text/turtle" },
      credentials: "omit",
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it("passes on a read's failure when the read as no one followed no redirect", async () => {
    const client = redirectingClient();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "HEAD" ? opaqueRedirect() : new Response("<#me> a <#Person> ."),
      ),
    );

    await expect(createAuthFetch(client)(URL_)).rejects.toThrow("Failed to fetch");
  });

  it("passes on an aborted request's failure without asking the address again", async () => {
    const client = fakeSessionClient();
    const aborted = new DOMException("Aborted", "AbortError");
    client.fetch.mockRejectedValue(aborted);
    const fetch = vi.fn(async () => opaqueRedirect());
    vi.stubGlobal("fetch", fetch);

    await expect(
      createAuthFetch(client)(URL_, { method: "PUT", signal: AbortSignal.abort() }),
    ).rejects.toBe(aborted);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes on a failure that is no redirect", async () => {
    const client = redirectingClient();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null)),
    );

    await expect(createAuthFetch(client)(URL_, { method: "DELETE" })).rejects.toThrow(
      "Failed to fetch",
    );
  });

  it("passes on the failure when the address can't be asked either", async () => {
    const client = redirectingClient();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );

    await expect(createAuthFetch(client)(URL_)).rejects.toThrow("Failed to fetch");
  });

  it("announces expired sessions on a 401 response", async () => {
    const client = fakeSessionClient();
    client.fetch.mockResolvedValue(new Response(null, { status: 401 }));
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    await createAuthFetch(client)(URL_);

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it("stays silent on non-401 responses", async () => {
    const client = fakeSessionClient();
    client.fetch.mockResolvedValue(new Response(null, { status: 403 }));
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    await createAuthFetch(client)(URL_);

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });
});

describe("anonymousFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends no credentials", async () => {
    const fetch = vi.fn(async () => new Response(null));
    vi.stubGlobal("fetch", fetch);
    await anonymousFetch(URL_, { method: "HEAD" });
    expect(fetch).toHaveBeenCalledWith(URL_, { method: "HEAD", credentials: "omit" });
  });
});
