// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { draftPod, INSTANCE, POD } from "./testing/releaseDrafts";
import { addCatalogLink } from "./catalogLinks";
import { type GrantPublicRead, grantPublicRead as libraryGrant } from "./client/access";
import type { ReadLimits } from "./client/interface";
import { limitedFetch } from "./client/readLimits";
import { createPodFence } from "./podFence";
import { createSolidReleasePublisher } from "./solidReleasePublisher";

const RELEASE = `${INSTANCE}releases/solid/v1.ttl`;
const CATALOG = `${INSTANCE}catalog.ttl`;
const TURTLE = `@base <${RELEASE}> .\n<> a <https://solid-memo.com/ns/vocab/v1.ttl#Deck> .`;
const ACL = "http://www.w3.org/ns/auth/acl#";
const ACP = "http://www.w3.org/ns/solid/acp#";
const PUBLISHED = "https://solid-memo.com/ns/vocab/v1.ttl#publishedRelease";

/**
 * A public-read grant that asks as the library's does (client/access.ts): it reads
 * the document, then adds read for everyone to the access control its
 * server names (`rel="acl"`); public when that write is taken. A server
 * that names none has no access control to write. Each request goes by
 * URL, as the library's do.
 */
const fakeGrant = vi.fn<GrantPublicRead>(async (url, { fetch }) => {
  const link = (await fetch(url)).headers.get("Link") ?? "";
  const acl = /<([^>]+)>;\s*rel="acl"/.exec(link)?.[1];
  if (acl === undefined) return false;
  const written = await fetch(new URL(acl, url).href, {
    method: "PATCH",
    headers: { "Content-Type": "application/sparql-update" },
    body: `INSERT DATA { <#public> a <${ACL}Authorization>; <${ACL}agentClass> <http://xmlns.com/foaf/0.1/Agent>; <${ACL}accessTo> <${url}>; <${ACL}mode> <${ACL}Read> . }`,
  });
  return written.ok;
});

/**
 * The test pod, its access controlled by Web Access Control (`wac`):
 * each resource's ACL is the resource's URL and `.acl` (rel="acl"), the
 * root's lets everyone do everything, as the end-to-end servers' do.
 * Without it, the pod has no access control, as a guest's has none.
 * With `acl`, a resource's access control is the one it names instead,
 * by the resource's URL and the number of reads of it so far (from 1);
 * with `answeredFrom`, every answer says it came from that address.
 * With `acp`, the pod's access is controlled by Access Control Policies
 * instead: each resource's access control is its URL and `.acr`, each
 * answer for which has a Link saying what it is, a 404 too while it is
 * not written yet, as the Community Solid Server does. `grant` is the public-read grant the
 * publisher is given, a fake one unless told. `sent` is every request
 * made, with its redirect mode and a PATCH's body. With `dataLimits`,
 * the publisher's reads of an instance's data are made under them.
 */
async function publisherPod({
  wac = true,
  acp = false,
  acl = (url: string) => `${url}.${acp ? "acr" : "acl"}`,
  answeredFrom,
  grant = fakeGrant,
  dataLimits,
}: {
  wac?: boolean;
  acp?: boolean;
  acl?: (url: string, reads: number) => string;
  answeredFrom?: string;
  grant?: GrantPublicRead;
  dataLimits?: ReadLimits;
} = {}) {
  const pod = await draftPod();
  const sent: string[] = [];
  const reads = new Map<string, number>();
  const fetch = (async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    sent.push(
      `${method} ${url}${init?.redirect ? ` redirect: ${init.redirect}` : ""}${method === "PATCH" ? ` ${String(init?.body)}` : ""}`,
    );
    const response = await pod.fetch(input, init);
    if (acp && url.endsWith(".acr")) {
      const headers = new Headers(response.headers);
      headers.append("Link", `<${ACP}AccessControlResource>; rel="type"`);
      const answer = new Response(response.body, { status: response.status, headers });
      Object.defineProperty(answer, "url", { value: url });
      return answer;
    }
    if (!wac || /\.ac[lr]$/.test(url) || (method !== "GET" && method !== "HEAD")) return response;
    reads.set(url, (reads.get(url) ?? 0) + 1);
    const headers = new Headers(response.headers);
    headers.append("Link", `<${acl(url, reads.get(url)!)}>; rel="acl"`);
    const answer = new Response(response.body, { status: response.status, headers });
    Object.defineProperty(answer, "url", { value: url === RELEASE ? (answeredFrom ?? url) : url });
    return answer;
  }) as typeof globalThis.fetch;
  await pod.put(
    `${POD}.acl`,
    `<#all> a <${ACL}Authorization>; <${ACL}agentClass> <http://xmlns.com/foaf/0.1/Agent>; <${ACL}accessTo> <${POD}>; <${ACL}default> <${POD}>; <${ACL}mode> <${ACL}Read>, <${ACL}Write>, <${ACL}Control> .`,
  );
  const publicFetch = vi.fn(
    async (input: RequestInfo | URL) =>
      new Response(null, { status: String(input) === RELEASE ? 200 : 401 }),
  );
  // Behind the pod fences, as the app wires it (appUseCases.ts).
  const publisher = createSolidReleasePublisher({
    fetch: createPodFence(fetch),
    dataFetch: createPodFence(dataLimits === undefined ? fetch : limitedFetch(fetch, dataLimits)),
    shareFetch: createPodFence(fetch, { accessControl: true }),
    publicFetch,
    grantPublicRead: grant,
  });
  /** The writes made since `from`, as method and URL, with If-None-Match: * when it was sent. */
  const writes = (from = 0) =>
    pod.requests
      .slice(from)
      .filter((request) => request.method !== "GET" && request.method !== "HEAD")
      .map(
        (request) =>
          `${request.method} ${request.url}${request.ifNoneMatch === "*" ? " If-None-Match" : ""}`,
      );
  return { pod, publisher, publicFetch, writes, sent };
}

describe("publish", () => {
  it("writes the release where nothing is, makes that document alone readable by everyone, and links it from the catalog", async () => {
    const { pod, publisher, writes } = await publisherPod();
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: true });
    expect(writes()).toEqual([
      `PUT ${RELEASE} If-None-Match`,
      `PATCH ${RELEASE}.acl`,
      `PATCH ${CATALOG}`,
    ]);
    expect(await pod.text(RELEASE)).toContain(
      `<${RELEASE}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>`,
    );
    const acl = await pod.text(`${RELEASE}.acl`);
    expect(acl).toContain(`<${ACL}accessTo> <${RELEASE}>`);
    // The release alone: every rule the ACL holds is of it.
    const named = [
      ...acl.matchAll(/<http:\/\/www\.w3\.org\/ns\/auth\/acl#(?:accessTo|default)> <([^>]+)>/g),
    ].map((match) => match[1]);
    expect(new Set(named)).toEqual(new Set([RELEASE]));
    await expect(publisher.listPublished(INSTANCE)).resolves.toEqual([RELEASE]);
    expect(await pod.text(CATALOG)).toContain(`<${PUBLISHED}> <${RELEASE}>`);
  });

  it("lists the catalog's releases as the instance's data is read, under its limits", async () => {
    const { publisher } = await publisherPod({
      dataLimits: { bytes: 64, quads: 1_000, characters: 64 * 1024 },
    });
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: true });
    await expect(publisher.listPublished(INSTANCE)).rejects.toMatchObject({
      name: "ReadLimitError",
      url: CATALOG,
    });
  });

  it("never writes over a release: one there already is releaseTaken, with nothing written", async () => {
    const { publisher, writes } = await publisherPod();
    await publisher.publish(INSTANCE, TURTLE, RELEASE);
    const before = writes().length;
    await expect(publisher.publish(INSTANCE, "changed", RELEASE)).rejects.toMatchObject({
      code: "releaseTaken",
      vars: { url: RELEASE },
    });
    expect(writes(0).slice(before)).toEqual([`PUT ${RELEASE} If-None-Match`]);
  });

  it("finishes a publishing cut short: a release there that states what this one does, its time of issue aside, is this one", async () => {
    const { pod, publisher, writes } = await publisherPod();
    const at = (time: string) =>
      `${TURTLE}\n<> <http://purl.org/dc/terms/issued> "${time}"^^<http://www.w3.org/2001/XMLSchema#dateTime>; <http://purl.org/dc/terms/title> "Solid"@en; <https://solid-memo.com/ns/vocab/v1.ttl#tag> [ <https://solid-memo.com/ns/vocab/v1.ttl#label> "a" ] .`;
    // Written, then cut short: not public, not linked.
    await pod.put(RELEASE, at("2026-01-01T00:00:00.000Z"));
    const before = writes().length;
    await expect(
      publisher.publish(INSTANCE, at("2026-01-02T00:00:00.000Z"), RELEASE),
    ).resolves.toEqual({ public: true });
    expect(writes().slice(before)).toEqual([
      `PUT ${RELEASE} If-None-Match`,
      `PATCH ${RELEASE}.acl`,
      `PATCH ${CATALOG}`,
    ]);
    await expect(publisher.listPublished(INSTANCE)).resolves.toEqual([RELEASE]);
    // Another, it is not: nor one that cannot be read.
    await expect(
      publisher.publish(
        INSTANCE,
        at("2026-01-02T00:00:00.000Z").replace('"Solid"', '"Other"'),
        RELEASE,
      ),
    ).rejects.toMatchObject({ code: "releaseTaken" });
    pod.failNext("GET", RELEASE, 500);
    await expect(
      publisher.publish(INSTANCE, at("2026-01-03T00:00:00.000Z"), RELEASE),
    ).rejects.toMatchObject({ code: "releaseTaken" });
  });

  it("publishes a release the pod will not make public all the same, readable by its owner alone", async () => {
    const { pod, publisher } = await publisherPod({ wac: false });
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: false });
    await expect(publisher.listPublished(INSTANCE)).resolves.toEqual([RELEASE]);
    expect(await pod.urls()).not.toContain(`${RELEASE}.acl`);
  });

  it("writes no access control a pod names as the release's folder's too, which would change who may use the folder", async () => {
    const { pod, publisher, writes } = await publisherPod({
      acl: (url) => new URL(".acl", url).href,
    });
    await publisher.publish(INSTANCE, TURTLE, RELEASE);
    expect(writes()).toEqual([`PUT ${RELEASE} If-None-Match`, `PATCH ${CATALOG}`]);
    expect(await pod.urls()).not.toContain(`${INSTANCE}releases/solid/.acl`);
  });

  it("writes no access control but the release's own, whatever its server names: not another document's, nor one in another pod", async () => {
    const elsewhere = [
      `${POD}private/diary.ttl.acl`,
      `${POD}private/diary.ttl.acr`,
      `${POD}private/.acl`,
      `${POD}.acl`,
      `${RELEASE}.acl/x`,
      "https://bob.example/private/diary.ttl.acl",
    ];
    for (const named of elsewhere) {
      const { publisher, writes, sent } = await publisherPod({
        acl: (url) => (url === RELEASE ? named : `${url}.acl`),
      });
      await publisher.publish(INSTANCE, TURTLE, RELEASE);
      await publisher.makePublic(INSTANCE, RELEASE).catch(() => undefined);
      expect(writes()).toEqual([`PUT ${RELEASE} If-None-Match`, `PATCH ${CATALOG}`]);
      expect(sent.filter((one) => one.includes("bob.example"))).toEqual([]);
    }
  });

  it("writes no other access control when the release's server names another at one read of the release and its own at the next", async () => {
    const other = `${POD}private/diary.ttl.acl`;
    for (const first of [true, false]) {
      const { publisher, writes } = await publisherPod({
        acl: (url, reads) => (url === RELEASE && (reads === 1) === first ? other : `${url}.acl`),
      });
      await publisher.publish(INSTANCE, TURTLE, RELEASE);
      await publisher.makePublic(INSTANCE, RELEASE).catch(() => undefined);
      expect(writes().filter((one) => one.includes(".acl"))).toEqual([`PATCH ${RELEASE}.acl`]);
    }
  });

  it("writes the release's own access control without following a redirect, and refuses an answer from another origin", async () => {
    const shared = await publisherPod();
    await shared.publisher.publish(INSTANCE, TURTLE, RELEASE);
    expect(shared.sent.some((one) => one.startsWith(`PATCH ${RELEASE}.acl redirect: error `))).toBe(
      true,
    );
    const redirected = await publisherPod({
      answeredFrom: "https://bob.example/private/diary.ttl",
    });
    await expect(redirected.publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({
      public: false,
    });
    expect(redirected.writes()).toEqual([`PUT ${RELEASE} If-None-Match`, `PATCH ${CATALOG}`]);
    expect(redirected.sent.filter((one) => one.includes("bob.example"))).toEqual([]);
  });

  it("asks the grant all the same when the server says nothing of the release's links", async () => {
    const { pod, publisher } = await publisherPod({ wac: false });
    // A read answered without a Link header.
    pod.failNext("GET", RELEASE, 200);
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: false });
    expect(
      pod.requests.filter((request) => request.method === "GET" && request.url === RELEASE).length,
    ).toBeGreaterThan(0);
  });

  it("says a write the pod refuses for any other reason, and writes nothing more", async () => {
    const { pod, publisher, writes } = await publisherPod();
    pod.failNext("PUT", RELEASE, 403);
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).rejects.toMatchObject({
      code: "addFailed",
      vars: { url: RELEASE, status: 403 },
    });
    expect(writes()).toEqual([`PUT ${RELEASE} If-None-Match`]);
  });

  it("counts an access write that fails as not public", async () => {
    const { pod, publisher } = await publisherPod();
    pod.failNext("GET", RELEASE, null, async () => {
      throw new Error("offline");
    });
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: false });
  });
});

describe("publish, with the library's grant (client/access.ts)", () => {
  const grant = libraryGrant;

  it("writes the release's own ACL alone, by URL, without following a redirect, its statements ended as node-solid-server takes them", async () => {
    const { pod, publisher, writes, sent } = await publisherPod({ grant });
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: true });
    expect(writes()).toEqual([
      `PUT ${RELEASE} If-None-Match`,
      `PATCH ${RELEASE}.acl`,
      `PATCH ${CATALOG}`,
    ]);
    const acl = await pod.text(`${RELEASE}.acl`);
    const named = [
      ...acl.matchAll(/<http:\/\/www\.w3\.org\/ns\/auth\/acl#(?:accessTo|default)> <([^>]+)>/g),
    ].map((match) => match[1]);
    expect(new Set(named)).toEqual(new Set([RELEASE]));
    const patch = sent.find((one) => one.startsWith(`PATCH ${RELEASE}.acl redirect: error `));
    expect(patch).toBeDefined();
    expect(patch).not.toMatch(/>\.(\s|\})/);
  });

  it("writes the release's own ACR on a pod with Access Control Policies, one not written yet read as an empty one", async () => {
    const { pod, publisher, writes } = await publisherPod({ grant, acp: true });
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: true });
    expect(writes()).toEqual([
      `PUT ${RELEASE} If-None-Match`,
      `PATCH ${RELEASE}.acr`,
      `PATCH ${CATALOG}`,
    ]);
    const acr = await pod.text(`${RELEASE}.acr`);
    expect(acr).toContain(`<${ACP}PublicAgent>`);
    expect(acr).toContain(`<${ACL}Read>`);
  });

  it("says a pod without access control did not make the release public", async () => {
    const { pod, publisher, writes } = await publisherPod({ grant, wac: false });
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: false });
    expect(writes()).toEqual([`PUT ${RELEASE} If-None-Match`, `PATCH ${CATALOG}`]);
    expect(await pod.urls()).not.toContain(`${RELEASE}.acl`);
  });

  it("writes no access control a pod names as the release's folder's, another document's, or one in another pod", async () => {
    for (const named of [
      `${INSTANCE}releases/solid/.acl`,
      `${POD}private/diary.ttl.acl`,
      `${POD}private/diary.ttl.acr`,
      `${POD}.acl`,
      `${RELEASE}.acl/x`,
      "https://bob.example/private/diary.ttl.acl",
    ]) {
      const { publisher, writes, sent } = await publisherPod({
        grant,
        acl: (url) => (url === RELEASE ? named : `${url}.acl`),
      });
      await publisher.publish(INSTANCE, TURTLE, RELEASE);
      expect(writes()).toEqual([`PUT ${RELEASE} If-None-Match`, `PATCH ${CATALOG}`]);
      expect(sent.filter((one) => one.includes("bob.example"))).toEqual([]);
    }
  });

  it("writes no other access control when the release's server names another at one read of the release and its own at the next", async () => {
    const other = `${POD}private/diary.ttl.acl`;
    for (const first of [true, false]) {
      const { publisher, writes } = await publisherPod({
        grant,
        acl: (url, reads) => (url === RELEASE && (reads === 1) === first ? other : `${url}.acl`),
      });
      await publisher.publish(INSTANCE, TURTLE, RELEASE);
      await publisher.makePublic(INSTANCE, RELEASE).catch(() => undefined);
      expect(writes().filter((one) => one.includes(".acl"))).not.toContain(`PATCH ${other}`);
    }
  });

  it("refuses an answer from another origin, and writes nothing there", async () => {
    const { publisher, writes, sent } = await publisherPod({
      grant,
      answeredFrom: "https://bob.example/private/diary.ttl",
    });
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: false });
    expect(writes()).toEqual([`PUT ${RELEASE} If-None-Match`, `PATCH ${CATALOG}`]);
    expect(sent.filter((one) => one.includes("bob.example"))).toEqual([]);
  });
});

describe("makePublic", () => {
  it("makes the release readable by everyone again, or says the pod will not", async () => {
    const shared = await publisherPod();
    await shared.publisher.publish(INSTANCE, TURTLE, RELEASE);
    await expect(shared.publisher.makePublic(INSTANCE, RELEASE)).resolves.toBeUndefined();
    expect(await shared.pod.text(`${RELEASE}.acl`)).toContain(`<${ACL}accessTo> <${RELEASE}>`);
    const refused = await publisherPod({ wac: false });
    await refused.publisher.publish(INSTANCE, TURTLE, RELEASE);
    await expect(refused.publisher.makePublic(INSTANCE, RELEASE)).rejects.toMatchObject({
      code: "publicAccessRefused",
      vars: { url: RELEASE },
    });
  });

  it("makes public only a release the instance's catalog lists whose document is a release", async () => {
    const { pod, publisher, writes } = await publisherPod();
    const diary = `${POD}private/diary/v1.ttl`;
    const unread = `${POD}private/gone/v1.ttl`;
    await pod.put(diary, `<#entry> <https://example.org/says> "secret" .`);
    await pod.put(RELEASE, TURTLE);
    for (const url of [diary, unread]) await addCatalogLink(INSTANCE, PUBLISHED, url, pod.fetch);
    const before = writes().length;
    // Not listed, listed but not a release, and listed but not there.
    for (const url of [RELEASE, diary, unread]) {
      await expect(publisher.makePublic(INSTANCE, url)).rejects.toMatchObject({
        code: "publicAccessRefused",
      });
    }
    pod.failNext("GET", diary, null, async () => {
      throw new Error("offline");
    });
    await expect(publisher.makePublic(INSTANCE, diary)).rejects.toMatchObject({
      code: "publicAccessRefused",
    });
    expect(writes().slice(before)).toEqual([]);
  });
});

describe("isPublic and listPublished", () => {
  it("asks as someone with no login, a failed request counting as not public", async () => {
    const { publisher, publicFetch } = await publisherPod();
    await expect(publisher.isPublic(RELEASE)).resolves.toBe(true);
    expect(publicFetch).toHaveBeenCalledWith(RELEASE, { method: "HEAD" });
    await expect(publisher.isPublic(`${INSTANCE}releases/other/v1.ttl`)).resolves.toBe(false);
    publicFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(publisher.isPublic(RELEASE)).resolves.toBe(false);
  });

  it("lists only the links at an address a release may have", async () => {
    const { pod, publisher } = await publisherPod();
    for (const url of [
      RELEASE,
      `${INSTANCE}releases/../../../profile/v1.ttl`,
      `${INSTANCE}%2e%2e/solid/v1.ttl`,
      `HTTPS://POD.EXAMPLE/solid/v1.ttl`,
      `${POD}profile/card`,
      `${INSTANCE}releases/solid/v1.ttl?x`,
      "urn:x:solid/v1.ttl",
    ]) {
      await addCatalogLink(INSTANCE, PUBLISHED, url, pod.fetch);
    }
    await expect(publisher.listPublished(INSTANCE)).resolves.toEqual([RELEASE]);
  });

  it("lists nothing for an instance without a catalog", async () => {
    const { publisher } = await publisherPod();
    await expect(publisher.listPublished(`${POD}solid-memo/other/`)).resolves.toEqual([]);
  });
});
