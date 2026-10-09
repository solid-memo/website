import { describe, expect, it, vi } from "vitest";
import { currentVersion, ifMatchOf, versionOfResponse } from "./documentVersion";

const URL_ = "https://pod.example/solid-memo/main/meta.ttl";

describe("versionOfResponse", () => {
  it("is the ETag, else the modification time, else a hash of the body", async () => {
    expect(await versionOfResponse(new Response("x", { headers: { ETag: '"v1"', "Last-Modified": "then" } }))).toBe('"v1"');
    expect(await versionOfResponse(new Response("x", { headers: { "Last-Modified": "Fri, 09 Oct 2026 10:00:00 GMT" } }))).toBe(
      "Last-Modified: Fri, 09 Oct 2026 10:00:00 GMT",
    );
    expect(await versionOfResponse(new Response("abc"))).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("currentVersion", () => {
  it("asks with a GET, as Turtle, as a copy is made from", async () => {
    const etag = vi.fn(async () => new Response("abc", { headers: { ETag: '"v1"' } }));
    expect(await currentVersion(URL_, etag)).toBe('"v1"');
    expect(etag).toHaveBeenCalledWith(URL_, { headers: { Accept: "text/turtle" } });
    expect(await currentVersion(URL_, async () => new Response("abc"))).toMatch(/^sha256:ba78/);
  });

  it("is null for a document that is not there, and throws on any other failure", async () => {
    expect(await currentVersion(URL_, async () => new Response(null, { status: 404 }))).toBeNull();
    await expect(currentVersion(URL_, async () => new Response(null, { status: 500 }))).rejects.toMatchObject({ code: "cannotCheck" });
  });
});

describe("ifMatchOf", () => {
  it("is a strong ETag, never a weak one or another kind of version", () => {
    expect(ifMatchOf('"v1"')).toBe('"v1"');
    expect(ifMatchOf('W/"v1"')).toBeUndefined();
    expect(ifMatchOf("Last-Modified: then")).toBeUndefined();
  });
});
