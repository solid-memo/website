// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * What the open servers of every other test can't show (docs/testing.md,
 * The signed-in tests): on each server's instance that isn't open, its
 * owner gets in, no one else does, and a release is public while the rest
 * stays private. Every request of a signed-in user goes through the app's
 * authFetch and pod fences, with a token the harness got without a browser
 * (signedIn.ts), sent DPoP-bound as the app sends it. A small suite: the
 * open servers' tests cover what the app does with the data.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { createAuthFetch, SESSION_EXPIRED_EVENT } from "@solid-memo/solid/authFetch";
import { grantPublicRead } from "@solid-memo/solid/client/access";
import { createPodFence } from "@solid-memo/solid/podFence";
import { createSolidReleasePublisher } from "@solid-memo/solid/solidReleasePublisher";
import { clientOf } from "../signedInClient.ts";
import {
  exchangedToken,
  resolveSubdomainsOfLocalhost,
  signIn,
  trustCa,
  type Session,
  type SignedInServer,
} from "../signedIn.ts";

const SERVERS = inject("signedInServers");
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const TURTLE = { "content-type": "text/turtle" };
const ORIGINAL = `<#entry> <https://example.org/says> "first words" .`;

/** The app's fetch for a session, its fence around it, as createAppUseCases wires it. */
function appFetch(session: Session, pod: string): typeof globalThis.fetch {
  return createPodFence(
    createAuthFetch(clientOf(session), { ownStorages: async () => [pod] }).fetch,
  );
}

/** Each way to change a document, as the app's are sent. */
const CHANGES: { method: string; init: RequestInit }[] = [
  {
    method: "PUT",
    init: {
      method: "PUT",
      headers: TURTLE,
      body: `<#entry> <https://example.org/says> "changed" .`,
    },
  },
  {
    method: "PATCH",
    init: {
      method: "PATCH",
      headers: { "content-type": "application/sparql-update" },
      body: `INSERT DATA { <#entry> <https://example.org/says> "added" . }`,
    },
  },
  { method: "DELETE", init: { method: "DELETE" } },
];

const statusOf = async (fetcher: typeof globalThis.fetch, url: string, init?: RequestInit) =>
  (await fetcher(url, init)).status;

if (SERVERS.length === 0) {
  // SOLID_SERVER_URL, or only servers with no such instance: said in the run, not an empty file.
  describe.skip("signed in", () => {
    it("has no server to run on", () => {});
  });
}

describe.each<SignedInServer>(SERVERS)("signed in on $name", (server) => {
  const { owner, stranger } = server;
  let ownerSession: Session;
  let ownerFetch: typeof globalThis.fetch;
  let strangerFetch: typeof globalThis.fetch;
  /** Who else may try, each with the refusal the protocol asks for. */
  let others: { who: string; fetch: typeof globalThis.fetch; refusal: number }[];

  beforeAll(async () => {
    trustCa(server.ca);
    resolveSubdomainsOfLocalhost();
    ownerSession = await signIn(server, owner);
    ownerFetch = appFetch(ownerSession, owner.pod);
    // No fence: what refuses the stranger must be the server, whatever they send it.
    strangerFetch = createAuthFetch(clientOf(await signIn(server, stranger)), {
      ownStorages: async () => [stranger.pod],
    }).fetch;
    others = [
      { who: "no login", fetch: globalThis.fetch, refusal: 401 },
      { who: "the stranger", fetch: strangerFetch, refusal: 403 },
    ];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A document only the owner may use, in a folder of its own; its URL. */
  async function privateDocument(): Promise<string> {
    const url = new URL(`private-${randomUUID()}/diary.ttl`, owner.pod).href;
    const written = await ownerFetch(url, { method: "PUT", headers: TURTLE, body: ORIGINAL });
    expect(written.status).toBe(201);
    return url;
  }

  /** What the document is now, as its owner reads it. */
  async function contents(url: string): Promise<string> {
    const read = await ownerFetch(url, { headers: { accept: "text/turtle" } });
    return `${read.status} ${await read.text()}`;
  }

  it("lets the owner read, write, patch and delete in their pod", async () => {
    const url = await privateDocument();
    expect(await contents(url)).toContain("first words");
    expect((await ownerFetch(url, CHANGES[0]!.init)).ok).toBe(true);
    expect(await contents(url)).toContain("changed");
    expect((await ownerFetch(url, CHANGES[1]!.init)).ok).toBe(true);
    expect(await contents(url)).toContain("added");
    expect((await ownerFetch(url, CHANGES[2]!.init)).ok).toBe(true);
    expect(await statusOf(ownerFetch, url)).toBe(404);
  });

  for (const who of ["no login", "the stranger"]) {
    it(`refuses ${who} on a private document, which stays as it was`, async () => {
      const { fetch: theirs, refusal } = others.find((other) => other.who === who)!;
      const url = await privateDocument();
      const before = await contents(url);
      const answers: Record<string, number> = {
        GET: await statusOf(theirs, url),
        HEAD: await statusOf(theirs, url, { method: "HEAD" }),
      };
      for (const { method, init } of CHANGES) answers[method] = await statusOf(theirs, url, init);
      expect(answers).toEqual({
        GET: refusal,
        HEAD: refusal,
        PUT: refusal,
        PATCH: refusal,
        DELETE: refusal,
      });
      expect(await contents(url)).toBe(before);
    });
  }

  /** An instance of the owner's, with a catalog and a document beside the release to come. */
  async function ownersInstance() {
    const instance = new URL(`release-${randomUUID()}/`, owner.pod).href;
    const catalog = `${instance}catalog.ttl`;
    const diary = `${instance}diary.ttl`;
    for (const [url, body] of [
      [catalog, `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .`],
      [diary, ORIGINAL],
    ] as const)
      expect((await ownerFetch(url, { method: "PUT", headers: TURTLE, body })).status).toBe(201);
    return { instance, catalog, diary, release: `${instance}releases/deck/v1.ttl` };
  }

  /** The release publisher as createAppUseCases wires it, as the session's user. */
  function publisherOf(session: Session, pod: string) {
    const fetch = createAuthFetch(clientOf(session), {
      ownStorages: async () => [pod],
    }).fetch;
    return createSolidReleasePublisher({
      fetch: createPodFence(fetch),
      dataFetch: createPodFence(fetch),
      shareFetch: createPodFence(fetch, { accessControl: true }),
      publicFetch: globalThis.fetch,
      grantPublicRead,
    });
  }

  it("makes a release the owner publishes readable by anyone and changeable by no one else, the rest staying private", async () => {
    const { instance, catalog, diary, release } = await ownersInstance();
    const publisher = publisherOf(ownerSession, owner.pod);
    expect(await publisher.publish(instance, `<> a <${SM}Deck> .`, release)).toEqual({
      public: true,
    });
    expect(await publisher.isPublic(release)).toBe(true);
    const before = await contents(release);
    const named = /<([^>]+)>\s*;\s*rel="acl"/.exec(
      (await ownerFetch(release, { method: "HEAD" })).headers.get("link") ?? "",
    )?.[1];
    expect(named).toBeDefined();
    const accessControl = new URL(named!, release).href;
    const controlBefore = await contents(accessControl);
    for (const { who, fetch: theirs, refusal } of others) {
      expect(await statusOf(theirs, release), `${who} reads the release`).toBe(200);
      for (const { method, init } of CHANGES)
        expect(await statusOf(theirs, release, init), `${who}: ${method} the release`).toBe(
          refusal,
        );
      for (const url of [catalog, diary, instance, new URL(".", release).href])
        expect(await statusOf(theirs, url), `${who} reads ${url}`).toBe(refusal);
      for (const { method, init } of CHANGES.slice(0, 2))
        expect(
          await statusOf(theirs, accessControl, init),
          `${who}: ${method} the access control`,
        ).toBe(refusal);
    }
    expect(await contents(release)).toBe(before);
    expect(await contents(accessControl)).toBe(controlBefore);
    expect(await publisher.listPublished(instance)).toEqual([release]);
  });

  it("changes what the stranger gets when the app makes a document public, and nothing else about it", async () => {
    const { instance, catalog, release } = await ownersInstance();
    const body = `<> a <${SM}Deck> .`;
    const written = await ownerFetch(release, { method: "PUT", headers: TURTLE, body });
    expect(written.status).toBe(201);
    const link = await ownerFetch(catalog, {
      method: "PATCH",
      headers: { "content-type": "application/sparql-update" },
      body: `INSERT DATA { <${catalog}#catalog> <${SM}publishedRelease> <${release}> . }`,
    });
    expect(link.ok).toBe(true);
    const publisher = publisherOf(ownerSession, owner.pod);
    expect(await statusOf(strangerFetch, release)).toBe(403);
    expect(await publisher.isPublic(release)).toBe(false);
    await publisher.makePublic(instance, release);
    expect(await statusOf(strangerFetch, release)).toBe(200);
    expect(await publisher.isPublic(release)).toBe(true);
    expect(await statusOf(strangerFetch, release, CHANGES[0]!.init)).toBe(403);
    expect(await contents(release)).toContain("Deck");
  });

  it("shows the app the 403 when someone who isn't the owner publishes or makes public, and changes nothing", async () => {
    const { instance, catalog, release } = await ownersInstance();
    const written = await ownerFetch(release, {
      method: "PUT",
      headers: TURTLE,
      body: `<> a <${SM}Deck> .`,
    });
    expect(written.status).toBe(201);
    const linked = await ownerFetch(catalog, {
      method: "PATCH",
      headers: { "content-type": "application/sparql-update" },
      body: `INSERT DATA { <${catalog}#catalog> <${SM}publishedRelease> <${release}> . }`,
    });
    expect(linked.ok).toBe(true);
    const strangers = publisherOf(await signIn(server, stranger), stranger.pod);
    await expect(strangers.makePublic(instance, release)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      strangers.publish(instance, `<> a <${SM}Deck> .`, `${instance}releases/other/v1.ttl`),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await statusOf(ownerFetch, `${instance}releases/other/v1.ttl`)).toBe(404);
    expect(await statusOf(globalThis.fetch, release)).toBe(401);
  });

  for (const [what, spoil] of [
    ["an invalid token", (token: string) => `${token.slice(0, -4)}AAAA`],
    ["something that is no token", () => "not-a-token"],
  ] as const) {
    it(`answers ${what} with a 401 the app can read, the document staying as it was`, async () => {
      const url = await privateDocument();
      const before = await contents(url);
      const window = Object.assign(new EventTarget(), { location: { href: server.url } });
      const expired = vi.fn();
      window.addEventListener(SESSION_EXPIRED_EVENT, expired);
      vi.stubGlobal("window", window);
      const spoiled = appFetch(
        {
          ...ownerSession,
          accessToken: spoil(ownerSession.accessToken),
          // On Linked Web Storage alone a bad access token is no one's, and the ID token is what's exchanged.
          ...(ownerSession.openId && {
            openId: { ...ownerSession.openId, idToken: spoil(ownerSession.openId.idToken) },
          }),
        },
        owner.pod,
      );
      const read = await spoiled(url);
      expect(read.status).toBe(401);
      // The app takes it for an ended session only when the answer says the token is invalid.
      const named = /\berror\s*=\s*"?invalid_token\b/i.test(
        read.headers.get("WWW-Authenticate") ?? "",
      );
      expect(expired).toHaveBeenCalledTimes(named ? 1 : 0);
      expect(await statusOf(spoiled, url, CHANGES[0]!.init)).toBe(401);
      expect(await contents(url)).toBe(before);
    });
  }

  /** The rest is Linked Web Storage's (docs/lws.md): a token for a storage, from the ID token. */
  if (server.login !== "css-lws") return;

  it("signs in with the app's client as the server takes it: the exchange on LWS alone, and DPoP beside Solid", async () => {
    const url = await privateDocument();
    const fresh = appFetch(await signIn(server, owner), owner.pod);
    const sent = vi.spyOn(globalThis, "fetch");
    try {
      expect(await statusOf(fresh, url)).toBe(200);
      const requests = sent.mock.calls.map(([input, init]) => ({
        url: String(input),
        scheme: new Headers(init?.headers).get("authorization")?.split(" ")[0],
      }));
      const exchanges = requests.filter((request) => request.url.endsWith("/lws/token"));
      expect(requests[0]).toEqual({ url, scheme: "DPoP" });
      if (server.id === "css-lws-only") {
        expect(exchanges).toHaveLength(1);
        expect(requests.some((request) => request.url.includes("oauth-protected-resource"))).toBe(
          true,
        );
        expect(requests.at(-1)).toEqual({ url, scheme: "Bearer" });
      } else {
        expect(exchanges).toEqual([]);
        expect(requests).toEqual([{ url, scheme: "DPoP" }]);
      }
    } finally {
      sent.mockRestore();
    }
  });

  it("holds a Bearer token from the exchange to its storage and its user's access", async () => {
    const url = await privateDocument();
    const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
    const ownerToken = await exchangedToken(ownerSession, owner.pod);
    expect(await statusOf(globalThis.fetch, url, bearer(ownerToken))).toBe(200);
    const theirs = new URL(`private-${randomUUID()}/diary.ttl`, stranger.pod).href;
    const written = await strangerFetch(theirs, { method: "PUT", headers: TURTLE, body: ORIGINAL });
    expect(written.status).toBe(201);
    expect(await statusOf(globalThis.fetch, theirs, bearer(ownerToken))).toBe(401);
    const strangerSession = await signIn(server, stranger);
    const strangerToken = await exchangedToken(strangerSession, owner.pod);
    expect(await statusOf(globalThis.fetch, url, bearer(strangerToken))).toBe(403);
    const before = await contents(url);
    expect(
      await statusOf(globalThis.fetch, url, {
        ...CHANGES[0]!.init,
        headers: { ...TURTLE, ...bearer(strangerToken).headers },
      }),
    ).toBe(403);
    expect(await contents(url)).toBe(before);
  });
});
