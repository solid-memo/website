// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    const result = await createAuthFetch(client).fetch(URL_, {
      method: "HEAD",
      redirect: "follow",
    });

    expect(result).toBe(response);
    expect(client.fetch).toHaveBeenCalledWith(URL_, { method: "HEAD", redirect: "error" });
  });

  it("refuses a write the address redirects, before any credentials follow it", async () => {
    const client = redirectingClient();
    const fetch = vi.fn(async () => opaqueRedirect());
    vi.stubGlobal("fetch", fetch);

    const write = createAuthFetch(client).fetch(URL_, { method: "PUT", body: "<#a> <#b> <#c> ." });

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
      createAuthFetch(client).fetch(new Request(URL_, { method: "PATCH", body: "" })),
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

    const result = await createAuthFetch(client).fetch(URL_, {
      headers: { Accept: "text/turtle" },
    });

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

    await expect(createAuthFetch(client).fetch(URL_)).rejects.toThrow("Failed to fetch");
  });

  it("passes on an aborted request's failure without asking the address again", async () => {
    const client = fakeSessionClient();
    const aborted = new DOMException("Aborted", "AbortError");
    client.fetch.mockRejectedValue(aborted);
    const fetch = vi.fn(async () => opaqueRedirect());
    vi.stubGlobal("fetch", fetch);

    await expect(
      createAuthFetch(client).fetch(URL_, { method: "PUT", signal: AbortSignal.abort() }),
    ).rejects.toBe(aborted);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes on a failure that is no redirect", async () => {
    const client = redirectingClient();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null)),
    );

    await expect(createAuthFetch(client).fetch(URL_, { method: "DELETE" })).rejects.toThrow(
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

    await expect(createAuthFetch(client).fetch(URL_)).rejects.toThrow("Failed to fetch");
  });

  describe("on a 401", () => {
    const ALICE = "https://alice.example/profile/card#me";
    const STORAGE = "https://alice.example/";
    const ISSUER = "https://login.example/";
    const FOREIGN = "https://elsewhere.example/memo/preferences.ttl";
    const INVALID = { "WWW-Authenticate": 'DPoP realm="pod", error="invalid_token"' };

    let listener: ReturnType<typeof vi.fn<() => void>>;
    beforeEach(() => {
      listener = vi.fn<() => void>();
      window.addEventListener(SESSION_EXPIRED_EVENT, listener);
    });
    afterEach(() => window.removeEventListener(SESSION_EXPIRED_EVENT, listener));

    /** A client with Alice logged in, whose every request is answered 401 with `headers`. */
    function refusingClient(headers: Record<string, string> = INVALID) {
      const client = fakeSessionClient();
      client.webId.mockReturnValue(ALICE);
      client.sessionIssuer.mockResolvedValue(ISSUER);
      client.fetch.mockImplementation(async () => new Response(null, { status: 401, headers }));
      return client;
    }
    const ownStorages = async () => [STORAGE];

    it("leaves a foreign own folder's 401 to the caller, the session untouched", async () => {
      const client = refusingClient();
      const { fetch } = createAuthFetch(client, { ownStorages });

      const response = await fetch(FOREIGN);

      expect(response.status).toBe(401);
      expect(listener).not.toHaveBeenCalled();
    });

    it("announces an expired session when the user's own storage refuses the token as invalid", async () => {
      const client = refusingClient();

      await createAuthFetch(client, { ownStorages }).fetch(`${STORAGE}memo/preferences.ttl`);

      expect(listener).toHaveBeenCalledOnce();
    });

    it("announces an expired session when the identity provider refuses the token as invalid", async () => {
      const client = refusingClient();

      await createAuthFetch(client).fetch(new Request(`${ISSUER}userinfo`));

      expect(listener).toHaveBeenCalledOnce();
    });

    it("stays silent on an own storage's 401 that does not name the token invalid", async () => {
      const client = refusingClient({ "WWW-Authenticate": 'DPoP realm="pod"' });

      await createAuthFetch(client, { ownStorages }).fetch(STORAGE);
      await createAuthFetch(refusingClient({})).fetch(STORAGE);

      expect(listener).not.toHaveBeenCalled();
    });

    it("stays silent when neither the provider nor the storages can be told", async () => {
      const client = refusingClient();
      client.sessionIssuer
        .mockRejectedValueOnce(new Error("no session"))
        .mockResolvedValueOnce("not an issuer");
      const unknown = async () => Promise.reject(new TypeError("Failed to fetch"));

      await createAuthFetch(client, { ownStorages: unknown }).fetch(STORAGE);
      await createAuthFetch(client).fetch(STORAGE);
      await createAuthFetch(client).fetch("not an address");

      expect(listener).not.toHaveBeenCalled();
    });

    it("announces an expired session once the sign-in client no longer has the user", async () => {
      const client = refusingClient({});
      const { fetch } = createAuthFetch(client);
      client.fetch.mockResolvedValueOnce(new Response("ok"));
      await fetch(FOREIGN);
      // The provider refused to refresh the token: the client ended the session.
      client.webId.mockReturnValue(undefined);

      await fetch(FOREIGN);
      await fetch(FOREIGN);

      expect(listener).toHaveBeenCalledOnce();
    });

    it("stays silent with no one logged in, or once the user logged out", async () => {
      const client = refusingClient();
      client.webId.mockReturnValue(undefined);
      await createAuthFetch(client, { ownStorages }).fetch(STORAGE);

      client.webId.mockReturnValue(ALICE);
      const auth = createAuthFetch(client, { ownStorages });
      await auth.fetch(FOREIGN);
      auth.forget();
      client.webId.mockReturnValue(undefined);
      await auth.fetch(STORAGE);

      expect(listener).not.toHaveBeenCalled();
    });

    it("stays silent on other statuses", async () => {
      const client = refusingClient();
      client.fetch.mockResolvedValue(new Response(null, { status: 403, headers: INVALID }));

      await createAuthFetch(client, { ownStorages }).fetch(STORAGE);

      expect(listener).not.toHaveBeenCalled();
    });
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
