import { describe, expect, it, vi } from "vitest";
import { currentVersion, ifMatchOf, sameBytes, served } from "./documentVersion";

const URL_ = "https://pod.example/solid-memo/main/meta.ttl";

describe("served", () => {
  it("is the bytes, the Content-Type and the version of the response: its ETag, else its modification time, else a hash of the bytes", async () => {
    const answer = (headers: Record<string, string>) => vi.fn(async () => new Response("abc", { headers }));
    const etag = answer({ ETag: '"v1"', "Last-Modified": "then", "Content-Type": "text/turtle; charset=utf-8" });
    expect(await served(URL_, etag)).toEqual({
      bytes: new TextEncoder().encode("abc"),
      contentType: "text/turtle; charset=utf-8",
      version: '"v1"',
    });
    // Asked of the pod every time: a browser that kept an earlier answer would give it back without asking.
    expect(etag).toHaveBeenCalledWith(URL_, { cache: "no-store", headers: { Accept: "text/turtle" } });
    expect((await served(URL_, answer({ "Last-Modified": "Fri, 09 Oct 2026 10:00:00 GMT" })))!.version).toBe(
      "Last-Modified: Fri, 09 Oct 2026 10:00:00 GMT",
    );
    expect((await served(URL_, answer({})))!.version).toBe("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("asks for a backup's file as it is stored, and says a Content-Type the pod leaves out is Turtle", async () => {
    const file = vi.fn(async () => {
      const response = new Response(new Uint8Array([0xff]));
      response.headers.delete("Content-Type");
      return response;
    });
    expect(await served(URL_, file, null)).toMatchObject({ bytes: new Uint8Array([0xff]), contentType: "text/turtle" });
    expect(file).toHaveBeenCalledWith(URL_, { cache: "no-store" });
  });

  it("is null for a document that is not there, and throws on any other failure", async () => {
    expect(await served(URL_, async () => new Response(null, { status: 404 }))).toBeNull();
    await expect(served(URL_, async () => new Response(null, { status: 500 }))).rejects.toMatchObject({ code: "cannotCheck" });
  });
});

describe("currentVersion", () => {
  it("is the version of a GET as Turtle, null where there is no document", async () => {
    const etag = vi.fn(async () => new Response("abc", { headers: { ETag: '"v1"' } }));
    expect(await currentVersion(URL_, etag)).toBe('"v1"');
    expect(etag).toHaveBeenCalledWith(URL_, { cache: "no-store", headers: { Accept: "text/turtle" } });
    expect(await currentVersion(URL_, async () => new Response("abc"))).toMatch(/^sha256:ba78/);
    expect(await currentVersion(URL_, async () => new Response(null, { status: 404 }))).toBeNull();
  });
});

describe("ifMatchOf", () => {
  it("is a strong ETag, never a weak one or another kind of version", () => {
    expect(ifMatchOf('"v1"')).toBe('"v1"');
    expect(ifMatchOf('W/"v1"')).toBeUndefined();
    expect(ifMatchOf("Last-Modified: then")).toBeUndefined();
  });
});

describe("sameBytes", () => {
  it("holds for the same bytes only", () => {
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1]))).toBe(false);
  });
});
