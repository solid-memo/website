import { afterEach, describe, expect, it, vi } from "vitest";
import { aclOf, changeElsewhere, etagMarksEveryEdit, keepsWrittenTurtle, preconditionsOf, storageOf } from "./serverTraits";

const SERVER = "http://127.0.0.1:1/";

interface Seen {
  method: string;
  url: string;
  type: string | null;
  body: string;
}

/** A server answering by method, every request kept. */
function serve(answer: (method: string, url: string) => Response) {
  const seen: Seen[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    seen.push({ method, url: String(input), type: new Headers(init.headers).get("content-type"), body: String(init.body ?? "") });
    return answer(method, String(input));
  });
  return seen;
}

const ok = (headers: Record<string, string> = {}, body = "") => new Response(body, { status: 200, headers });

afterEach(() => vi.unstubAllGlobals());

describe("a probe that cannot tell", () => {
  it("throws rather than say the server lacks it, when its PATCH is refused", async () => {
    serve((method) => (method === "PATCH" ? new Response(null, { status: 415 }) : ok({ etag: '"1"' })));
    await expect(etagMarksEveryEdit(SERVER)).rejects.toThrow(/answered 415/);
    await expect(preconditionsOf(SERVER)).rejects.toThrow(/answered 415/);
  });
});

describe("keepsWrittenTurtle", () => {
  it("is whether a document PUT as Turtle is served as it was written, byte for byte", async () => {
    // A server that keeps the bytes it is given.
    let written = "";
    const keeping = vi.fn(async (_input: string | URL, init: RequestInit = {}) => {
      if (init.method === "PUT") {
        written = String(init.body);
        return new Response(null, { status: 201 });
      }
      return ok({}, written);
    });
    vi.stubGlobal("fetch", keeping);
    await expect(keepsWrittenTurtle(SERVER)).resolves.toBe(true);
    expect(new Headers(keeping.mock.calls[0]![1]!.headers).get("content-type")).toBe("text/turtle");
    expect(written).toContain("# Written by hand.");
    // One that writes out what it keeps anew.
    serve((method) => (method === "PUT" ? new Response(null, { status: 201 }) : ok({}, `<#a> <#t> "x" .`)));
    await expect(keepsWrittenTurtle(SERVER)).resolves.toBe(false);
  });

  it("throws rather than say the server lacks it, when the document cannot be written", async () => {
    serve(() => new Response(null, { status: 403 }));
    await expect(keepsWrittenTurtle(SERVER)).rejects.toThrow(/answered 403/);
  });
});

describe("changeElsewhere", () => {
  it.each([
    ["text/n3, application/sparql-update", "PATCH", "text/n3"],
    ["application/sparql-update", "PATCH", "application/sparql-update"],
    ["", "PUT", "text/turtle"],
  ])("writes as Accept-Patch %j allows: %s %s", async (acceptPatch, method, type) => {
    const seen = serve(() => ok({ "accept-patch": acceptPatch }, `<#a> <#b> "c" .`));
    await changeElsewhere(`${SERVER}doc.ttl`, `<#x> <#y> "z" .`);
    expect(seen.at(-1)).toMatchObject({ method, type, body: expect.stringContaining(`<#x> <#y> "z" .`) });
    if (method === "PUT") expect(seen.at(-1)!.body).toContain(`<#a> <#b> "c" .`);
  });

  it("throws when the server refuses the change", async () => {
    serve((method) => (method === "GET" ? ok({ "accept-patch": "text/n3" }) : new Response(null, { status: 403 })));
    await expect(changeElsewhere(`${SERVER}doc.ttl`, `<#x> <#y> "z" .`)).rejects.toThrow(/403/);
  });
});

describe("aclOf", () => {
  it("is where Link rel=acl says, resolved against the resource", async () => {
    serve(() => ok({ link: `<http://www.w3.org/ns/ldp#Resource>; rel="type", <doc.ttl.acl-of-it>; rel="acl"` }));
    await expect(aclOf(`${SERVER}a/doc.ttl`)).resolves.toBe(`${SERVER}a/doc.ttl.acl-of-it`);
  });

  it("throws when the server names none", async () => {
    serve(() => ok());
    await expect(aclOf(`${SERVER}doc.ttl`)).rejects.toThrow(/names no ACL/);
  });
});

describe("storageOf", () => {
  it("is the nearest container that says it is a pim:Storage", async () => {
    serve((_, url) => ok(url === `${SERVER}pod/` ? { link: `<http://www.w3.org/ns/pim/space#Storage>; rel="type"` } : {}));
    await expect(storageOf(`${SERVER}pod/run/doc.ttl`)).resolves.toBe(`${SERVER}pod/`);
  });

  it("is the origin's root when none says so", async () => {
    serve(() => ok());
    await expect(storageOf(`${SERVER}pod/run/doc.ttl`)).resolves.toBe(SERVER);
  });
});
