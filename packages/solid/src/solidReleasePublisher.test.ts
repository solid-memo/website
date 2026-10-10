import { afterEach, describe, expect, it, vi } from "vitest";
import { draftPod, INSTANCE, POD } from "./testing/releaseDrafts";
import { accessFetch, anonymousFetch, createSolidReleasePublisher } from "./solidReleasePublisher";

const RELEASE = `${INSTANCE}releases/solid/v1.ttl`;
const CATALOG = `${INSTANCE}catalog.ttl`;
const TURTLE = `@base <${RELEASE}> .\n<> a <https://solid-memo.com/ns/vocab/v1.ttl#Deck> .`;
const ACL = "http://www.w3.org/ns/auth/acl#";
const PUBLISHED = "https://solid-memo.com/ns/vocab/v1.ttl#publishedRelease";

/**
 * The test pod, its access controlled by Web Access Control (`wac`):
 * each resource's ACL is the resource's URL and `.acl` (rel="acl"), the
 * root's lets everyone do everything, as the end-to-end servers' do.
 * Without it, the pod has no access control, as a guest's has none.
 * With `folderAcl`, every resource's ACL is its folder's (`<.acl>`).
 */
async function publisherPod({ wac = true, folderAcl = false } = {}) {
  const pod = await draftPod();
  const fetch = (async (input, init) => {
    const response = await pod.fetch(input, init);
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (!wac || url.endsWith(".acl") || (method !== "GET" && method !== "HEAD")) return response;
    const headers = new Headers(response.headers);
    headers.append("Link", folderAcl ? '<.acl>; rel="acl"' : `<${url}.acl>; rel="acl"`);
    const answer = new Response(response.body, { status: response.status, headers });
    Object.defineProperty(answer, "url", { value: url });
    return answer;
  }) as typeof globalThis.fetch;
  await pod.put(
    `${POD}.acl`,
    `<#all> a <${ACL}Authorization>; <${ACL}agentClass> <http://xmlns.com/foaf/0.1/Agent>; <${ACL}accessTo> <${POD}>; <${ACL}default> <${POD}>; <${ACL}mode> <${ACL}Read>, <${ACL}Write>, <${ACL}Control> .`,
  );
  const publicFetch = vi.fn(async (input: RequestInfo | URL) => new Response(null, { status: String(input) === RELEASE ? 200 : 401 }));
  const publisher = createSolidReleasePublisher({ fetch, publicFetch });
  /** The writes made since `from`, as method and URL, with If-None-Match: * when it was sent. */
  const writes = (from = 0) =>
    pod.requests
      .slice(from)
      .filter((request) => request.method !== "GET" && request.method !== "HEAD")
      .map((request) => `${request.method} ${request.url}${request.ifNoneMatch === "*" ? " If-None-Match" : ""}`);
  return { pod, publisher, publicFetch, writes };
}

describe("publish", () => {
  it("writes the release where nothing is, makes that document alone readable by everyone, and links it from the catalogue", async () => {
    const { pod, publisher, writes } = await publisherPod();
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: true });
    expect(writes()).toEqual([`PUT ${RELEASE} If-None-Match`, `PATCH ${RELEASE}.acl`, `PATCH ${CATALOG}`]);
    expect(await pod.text(RELEASE)).toContain(`<${RELEASE}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>`);
    const acl = await pod.text(`${RELEASE}.acl`);
    expect(acl).toContain(`<${ACL}accessTo> <${RELEASE}>`);
    // The release alone: every rule the ACL holds is of it.
    const named = [...acl.matchAll(/<http:\/\/www\.w3\.org\/ns\/auth\/acl#(?:accessTo|default)> <([^>]+)>/g)].map((match) => match[1]);
    expect(new Set(named)).toEqual(new Set([RELEASE]));
    await expect(publisher.listPublished(INSTANCE)).resolves.toEqual([RELEASE]);
    expect(await pod.text(CATALOG)).toContain(`<${PUBLISHED}> <${RELEASE}>`);
  });

  it("never writes over a release: one there already is releaseTaken, with nothing written", async () => {
    const { publisher, writes } = await publisherPod();
    await publisher.publish(INSTANCE, TURTLE, RELEASE);
    const before = writes().length;
    await expect(publisher.publish(INSTANCE, "changed", RELEASE)).rejects.toMatchObject({ code: "releaseTaken", vars: { url: RELEASE } });
    expect(writes(0).slice(before)).toEqual([`PUT ${RELEASE} If-None-Match`]);
  });

  it("finishes a publishing cut short: a release there that states what this one does, its time of issue aside, is this one", async () => {
    const { pod, publisher, writes } = await publisherPod();
    const at = (time: string) =>
      `${TURTLE}\n<> <http://purl.org/dc/terms/issued> "${time}"^^<http://www.w3.org/2001/XMLSchema#dateTime>; <http://purl.org/dc/terms/title> "Solid"@en; <https://solid-memo.com/ns/vocab/v1.ttl#tag> [ <https://solid-memo.com/ns/vocab/v1.ttl#label> "a" ] .`;
    // Written, then cut short: not public, not linked.
    await pod.put(RELEASE, at("2026-01-01T00:00:00.000Z"));
    const before = writes().length;
    await expect(publisher.publish(INSTANCE, at("2026-01-02T00:00:00.000Z"), RELEASE)).resolves.toEqual({ public: true });
    expect(writes().slice(before)).toEqual([`PUT ${RELEASE} If-None-Match`, `PATCH ${RELEASE}.acl`, `PATCH ${CATALOG}`]);
    await expect(publisher.listPublished(INSTANCE)).resolves.toEqual([RELEASE]);
    // Another, it is not: nor one that cannot be read.
    await expect(publisher.publish(INSTANCE, at("2026-01-02T00:00:00.000Z").replace('"Solid"', '"Other"'), RELEASE)).rejects.toMatchObject({ code: "releaseTaken" });
    pod.failNext("GET", RELEASE, 500);
    await expect(publisher.publish(INSTANCE, at("2026-01-03T00:00:00.000Z"), RELEASE)).rejects.toMatchObject({ code: "releaseTaken" });
  });

  it("publishes a release the pod will not make public all the same, readable by its owner alone", async () => {
    const { pod, publisher } = await publisherPod({ wac: false });
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: false });
    await expect(publisher.listPublished(INSTANCE)).resolves.toEqual([RELEASE]);
    expect(await pod.urls()).not.toContain(`${RELEASE}.acl`);
  });

  it("writes no access control a pod names as the release's folder's too, which would change who may use the folder", async () => {
    const { pod, publisher, writes } = await publisherPod({ folderAcl: true });
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: false });
    expect(writes()).toEqual([`PUT ${RELEASE} If-None-Match`, `PATCH ${CATALOG}`]);
    expect(await pod.urls()).not.toContain(`${INSTANCE}releases/solid/.acl`);
  });

  it("asks the library all the same when the server says nothing of the release's links", async () => {
    const { pod, publisher } = await publisherPod({ wac: false });
    // A HEAD answered without a Link header.
    pod.failNext("HEAD", RELEASE, 200);
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: false });
    expect(pod.requests.filter((request) => request.method === "HEAD" && request.url === RELEASE).length).toBeGreaterThan(1);
  });

  it("says a write the pod refuses for any other reason, and writes nothing more", async () => {
    const { pod, publisher, writes } = await publisherPod();
    pod.failNext("PUT", RELEASE, 403);
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).rejects.toMatchObject({ code: "addFailed", vars: { url: RELEASE, status: 403 } });
    expect(writes()).toEqual([`PUT ${RELEASE} If-None-Match`]);
  });

  it("counts an access write that fails as not public", async () => {
    const { pod, publisher } = await publisherPod();
    pod.failNext("HEAD", RELEASE, null, async () => {
      throw new Error("offline");
    });
    await expect(publisher.publish(INSTANCE, TURTLE, RELEASE)).resolves.toEqual({ public: false });
  });
});

describe("makePublic", () => {
  it("makes the release readable by everyone again, or says the pod will not", async () => {
    const shared = await publisherPod();
    await shared.pod.put(RELEASE, TURTLE);
    await expect(shared.publisher.makePublic(RELEASE)).resolves.toBeUndefined();
    expect(await shared.pod.text(`${RELEASE}.acl`)).toContain(`<${ACL}accessTo> <${RELEASE}>`);
    const refused = await publisherPod({ wac: false });
    await refused.pod.put(RELEASE, TURTLE);
    await expect(refused.publisher.makePublic(RELEASE)).rejects.toMatchObject({ code: "publicAccessRefused", vars: { url: RELEASE } });
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

  it("lists nothing for an instance without a catalogue", async () => {
    const { publisher } = await publisherPod();
    await expect(publisher.listPublished(`${POD}solid-memo/other/`)).resolves.toEqual([]);
  });
});

describe("accessFetch", () => {
  it("puts a space before each \".\" that ends a statement in a PATCH, after an IRI or a string", async () => {
    const fetch = vi.fn(async () => new Response(null));
    const spaced = accessFetch(fetch);
    await spaced(RELEASE, { method: "PATCH", body: 'INSERT DATA {<#a> <#b> <#c>.\n<#a> <#d> "x.y\\".", "z".}' });
    expect(fetch).toHaveBeenLastCalledWith(RELEASE, { method: "PATCH", body: 'INSERT DATA {<#a> <#b> <#c> .\n<#a> <#d> "x.y\\".", "z" .}' });
    await spaced(RELEASE, { method: "PUT", body: "<#a> <#b> <#c>." });
    expect(fetch).toHaveBeenLastCalledWith(RELEASE, { method: "PUT", body: "<#a> <#b> <#c>." });
  });

  it("reads an Access Control Resource not written yet as one that says only what it is, and leaves every other answer be", async () => {
    const ACR = `${RELEASE}.acr`;
    const type = '<http://www.w3.org/ns/solid/acp#AccessControlResource>; rel="type"';
    const answers: Record<string, Response> = {
      [ACR]: new Response("Not found", { status: 404, headers: { Link: type } }),
      [RELEASE]: new Response("Not found", { status: 404 }),
    };
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const answer = answers[String(input)]!;
      Object.defineProperty(answer, "url", { value: String(input) });
      return answer;
    });
    const read = await accessFetch(fetch)(ACR);
    expect(read.status).toBe(200);
    expect(read.url).toBe(ACR);
    expect(read.headers.get("Link")).toBe(type);
    expect(await read.text()).toBe("<> a <http://www.w3.org/ns/solid/acp#AccessControlResource> .");
    expect((await accessFetch(fetch)(RELEASE)).status).toBe(404);
    answers[ACR] = new Response(null, { status: 404, headers: { Link: type } });
    const head = await accessFetch(fetch)(ACR, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    answers[ACR] = new Response(null, { status: 404, headers: { Link: type } });
    expect((await accessFetch(fetch)(ACR, { method: "PUT", body: "" })).status).toBe(404);
  });
});

describe("anonymousFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends no credentials", async () => {
    const fetch = vi.fn(async () => new Response(null));
    vi.stubGlobal("fetch", fetch);
    await anonymousFetch(RELEASE, { method: "HEAD" });
    expect(fetch).toHaveBeenCalledWith(RELEASE, { method: "HEAD", credentials: "omit" });
  });
});
