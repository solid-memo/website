// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  buildAuthenticatedFetch,
  createDpopHeader,
  generateDpopKeyPair,
} from "@inrupt/solid-client-authn-core";
import { AppError } from "@solid-memo/domain/appError";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousFetch, createAuthFetch, SESSION_EXPIRED_EVENT } from "./authFetch";
import { createPodFence } from "./podFence";
import { createSolidReleasePublisher } from "./solidReleasePublisher";
import { createSolidStorageGateway } from "./solidStorageGateway";
import { withReadDeadline } from "./readDeadline";
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

  it("fails a read under deadlines whose address redirects and then never answers the HEAD", async () => {
    vi.useFakeTimers();
    try {
      // A browser's fetch settles on the abort; a fetch that does not is ended all the same.
      const heard = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
          ),
      );
      const deaf = vi.fn(() => new Promise<Response>(() => {}));
      for (const stalled of [heard, deaf]) {
        vi.stubGlobal("fetch", stalled);
        const read = withReadDeadline(createAuthFetch(redirectingClient()).fetch, 50, 1000)(URL_);
        const failed = expect(read).rejects.toMatchObject({ code: "podNoAnswer" });
        await vi.advanceTimersByTimeAsync(50);
        await failed;
      }
      expect(deaf).toHaveBeenCalledOnce();
      expect(heard).toHaveBeenCalledOnce();
      expect(heard.mock.calls[0]?.[1]).toMatchObject({
        method: "HEAD",
        signal: expect.any(AbortSignal),
      });
      expect(heard.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes on the failure of a request aborted while the HEAD asked, without asking again", async () => {
    const client = redirectingClient();
    const caller = new AbortController();
    const fetch = vi.fn(async () => {
      caller.abort();
      return opaqueRedirect();
    });
    vi.stubGlobal("fetch", fetch);

    await expect(createAuthFetch(client).fetch(URL_, { signal: caller.signal })).rejects.toThrow(
      "Failed to fetch",
    );
    expect(fetch).toHaveBeenCalledOnce();
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

describe("createAuthFetch, with the sign-in library's own proof", () => {
  /** The address in a proof. */
  function htuOf(proof: string): string {
    return JSON.parse(atob(proof.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))).htu;
  }

  /** The library's authenticated fetch behind authFetch, and the server it would reach. */
  async function signedIn() {
    const server = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response("ok");
    });
    const client = fakeSessionClient();
    client.fetch.mockImplementation(
      buildAuthenticatedFetch("TOKEN", { dpopKey: await generateDpopKeyPair(), fetch: server }),
    );
    return { server, auth: createAuthFetch(client) };
  }

  const REFUSED = [
    "https://evil.example//honest.example/alice/notes.ttl",
    "https://evil.example///honest.example/alice/notes.ttl",
    "https://evil.example/.//honest.example/alice/notes.ttl",
    "https://evil.example/%2e//honest.example/alice/notes.ttl",
    "https://evil.example/x/..//honest.example/alice/notes.ttl",
    "https://evil.example/\\honest.example/alice/notes.ttl",
    "https://evil.example/\t/honest.example/alice/notes.ttl",
    "https://evil.example//honest.example:8443/alice/notes.ttl",
    "https://evil.example//user:secret@honest.example/alice/notes.ttl",
    // These the library cannot make a proof for at all.
    "https://evil.example//",
    "https://evil.example//honest.example:99999/",
  ];

  it("would name another server in the proof, or throw, for each refused address", async () => {
    const dpopKey = await generateDpopKeyPair();
    for (const url of REFUSED) {
      const htu = await createDpopHeader(url, "GET", dpopKey).then(htuOf, () => null);
      expect(htu === null || !htu.startsWith("https://evil.example/"), url).toBe(true);
    }
  });

  it("sends nothing to an address whose proof would name another server", async () => {
    const { server, auth } = await signedIn();
    for (const url of REFUSED) {
      for (const method of ["GET", "HEAD", "PUT"]) {
        await expect(auth.fetch(url, { method }), `${method} ${url}`).rejects.toEqual(
          new AppError("credentialsRefused", { url }),
        );
      }
    }
    await expect(auth.fetch(new URL(REFUSED[0]!))).rejects.toMatchObject({
      code: "credentialsRefused",
    });
    await expect(auth.fetch(new Request(REFUSED[0]!))).rejects.toMatchObject({
      code: "credentialsRefused",
    });
    expect(server).not.toHaveBeenCalled();
  });

  it("sends the proof to any other address, naming the server it goes to", async () => {
    const { server, auth } = await signedIn();
    for (const url of [
      "https://pod.example/alice/notes.ttl",
      "https://pod.example/alice//notes.ttl",
      "https://pod.example/%2F/honest.example/notes.ttl",
      "https://pod.example//pod.example/notes.ttl",
    ]) {
      server.mockClear();
      await auth.fetch(url);
      const proof = new Headers(server.mock.calls[0]![1]!.headers).get("DPoP")!;
      expect(new URL(htuOf(proof)).origin, url).toBe("https://pod.example");
    }
  });

  it("leaves to the client text that is no address, and an address with no origin", async () => {
    const client = fakeSessionClient();
    const { fetch } = createAuthFetch(client);
    await fetch("/relative");
    await fetch("data:text/plain,x");
    expect(client.fetch).toHaveBeenCalledTimes(2);
  });

  it("sends nothing when a storage typed by hand is asked after", async () => {
    const { server, auth } = await signedIn();
    const gateway = createSolidStorageGateway({
      fetch: auth.fetch,
      profileStorages: async () => [],
    });
    await expect(
      gateway.probeStorage("https://evil.example//honest.example/alice/"),
    ).rejects.toMatchObject({ code: "credentialsRefused" });
    expect(server).not.toHaveBeenCalled();
  });

  it("neither lists nor makes public a foreign instance's release at an address with an empty segment", async () => {
    const root = "https://evil.example//honest.example/";
    const target = `${root}alice/private/notes/v1.ttl`;
    const hostile = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "HEAD") return new Response(null, { status: 403 });
      const url = String(input);
      const body = url.endsWith("catalog.ttl")
        ? `<${root}catalog.ttl#catalog> <https://solid-memo.com/ns/vocab/v1.ttl#publishedRelease> <${target}> .`
        : "";
      const answer = new Response(body, { headers: { "Content-Type": "text/turtle" } });
      Object.defineProperty(answer, "url", { value: url });
      return answer;
    });
    const client = fakeSessionClient();
    client.fetch.mockImplementation(
      buildAuthenticatedFetch("TOKEN", { dpopKey: await generateDpopKeyPair(), fetch: hostile }),
    );
    const session = createPodFence(createAuthFetch(client).fetch);
    const publisher = createSolidReleasePublisher({
      fetch: session,
      dataFetch: session,
      shareFetch: session,
      publicFetch: hostile,
      grantPublicRead: async () => false,
    });

    await expect(publisher.listPublished(root)).resolves.toEqual([]);
    await expect(publisher.makePublic(root, target)).rejects.toMatchObject({
      code: "publicAccessRefused",
    });
  });
});
