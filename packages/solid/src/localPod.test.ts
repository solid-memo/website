import { describe, expect, it } from "vitest";
import { createLocalPod, dataBlocks, parentOf } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";

const ROOT = "https://guest.example/";
const DOC = `${ROOT}a/b/doc.ttl`;
const LDP = "http://www.w3.org/ns/ldp#";

function pod() {
  const store = createMemoryResourceStore();
  let etags = 0;
  const fetch = createLocalPod({ root: ROOT, store, newEtag: () => `"e${++etags}"` });
  return { store, fetch };
}

const turtle = (body: string): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "text/turtle" },
  body,
});

const update = (body: string, headers: Record<string, string> = {}): RequestInit => ({
  method: "PATCH",
  headers: { "Content-Type": "application/sparql-update", ...headers },
  body,
});

describe("createLocalPod", () => {
  it("stores Turtle and serves it, relative IRIs made absolute", async () => {
    const { fetch } = pod();
    const put = await fetch(DOC, turtle('<#it> <#name> "Deck" .'));
    expect(put.status).toBe(201);
    const get = await fetch(DOC);
    expect(get.status).toBe(200);
    expect(get.url).toBe(DOC);
    expect(get.headers.get("Content-Type")).toBe("text/turtle");
    expect(get.headers.get("ETag")).toBe('"e1"');
    expect(get.headers.get("Link")).toBe(`<${LDP}Resource>; rel="type"`);
    expect(await get.text()).toBe(`<${DOC}#it> <${DOC}#name> "Deck" .`);
  });

  it("reads Turtle, and a SPARQL Update, sent as bytes as it reads them sent as text", async () => {
    const { fetch } = pod();
    const served = '<#it> <#name> "Deck" .';
    expect((await fetch(DOC, { ...turtle(""), body: new TextEncoder().encode(served) })).status).toBe(201);
    expect(await (await fetch(DOC)).text()).toBe(`<${DOC}#it> <${DOC}#name> "Deck" .`);
    // Its own bytes put back, it serves them as they were.
    const bytes = new Uint8Array(await (await fetch(DOC)).arrayBuffer());
    await fetch(DOC, update("INSERT DATA { <#it> <#n> 1 . }"));
    await fetch(DOC, { ...turtle(""), body: bytes });
    expect(new Uint8Array(await (await fetch(DOC)).arrayBuffer())).toEqual(bytes);
    expect((await fetch(DOC, { ...update(""), body: new TextEncoder().encode("INSERT DATA { <#it> <#n> 2 . }") })).status).toBe(205);
    expect(await (await fetch(DOC)).text()).toContain(`<${DOC}#n> "2"`);
  });

  it("serves the document of a fragment URL, as the network does", async () => {
    const { fetch } = pod();
    await fetch(DOC, turtle("<#me> <#p> <#o> ."));
    const get = await fetch(new Request(`${DOC}#me`));
    expect(get.status).toBe(200);
    expect(get.url).toBe(DOC);
  });

  it("creates the containers above a new resource, and lists them", async () => {
    const { fetch } = pod();
    await fetch(DOC, turtle(""));
    const root = await fetch(ROOT);
    expect(root.headers.get("Link")).toBe(
      `<${LDP}Resource>; rel="type", <${LDP}Container>; rel="type", <${LDP}BasicContainer>; rel="type", <http://www.w3.org/ns/pim/space#Storage>; rel="type"`,
    );
    expect(await root.text()).toContain(`<${ROOT}> <${LDP}contains> <${ROOT}a/> .`);
    const b = await fetch(`${ROOT}a/b/`);
    expect(b.headers.get("Link")).not.toContain("Storage");
    expect(await b.text()).toBe(
      [
        `<${ROOT}a/b/> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${LDP}Container> .`,
        `<${ROOT}a/b/> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${LDP}BasicContainer> .`,
        `<${ROOT}a/b/> <${LDP}contains> <${DOC}> .`,
      ].join("\n"),
    );
  });

  it("answers HEAD without a body, and 304 when the ETag named is current", async () => {
    const { fetch } = pod();
    await fetch(DOC, turtle(""));
    const head = await fetch(DOC, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const etag = head.headers.get("ETag")!;
    const unchanged = await fetch(DOC, { headers: { "If-None-Match": etag } });
    expect(unchanged.status).toBe(304);
    expect(unchanged.headers.get("ETag")).toBe(etag);
  });

  it("answers 404 for what it does not have, or what is outside its root", async () => {
    const { fetch } = pod();
    expect((await fetch(DOC)).status).toBe(404);
    expect((await fetch("https://elsewhere.example/doc", turtle(""))).status).toBe(404);
  });

  it("refuses methods it does not speak", async () => {
    const { fetch } = pod();
    expect((await fetch(DOC, { method: "POST" })).status).toBe(405);
  });

  it("holds writes to If-Match and If-None-Match: *", async () => {
    const { fetch } = pod();
    expect((await fetch(DOC, { ...turtle(""), headers: { "Content-Type": "text/turtle", "If-Match": '"x"' } })).status).toBe(412);
    expect((await fetch(DOC, { ...turtle(""), headers: { "Content-Type": "text/turtle", "If-None-Match": "*" } })).status).toBe(201);
    expect((await fetch(DOC, { ...turtle(""), headers: { "Content-Type": "text/turtle", "If-None-Match": "*" } })).status).toBe(412);
    const etag = (await fetch(DOC, { method: "HEAD" })).headers.get("ETag")!;
    expect((await fetch(DOC, { ...turtle(""), headers: { "Content-Type": "text/turtle", "If-Match": etag } })).status).toBe(205);
    expect((await fetch(DOC, { ...turtle(""), headers: { "Content-Type": "text/turtle", "If-Match": etag } })).status).toBe(412);
  });

  it("refuses Turtle that does not parse", async () => {
    const { fetch } = pod();
    expect((await fetch(DOC, turtle("<#it> <#p"))).status).toBe(400);
    expect((await fetch(DOC)).status).toBe(404);
    expect((await fetch(DOC, { method: "PUT", headers: { "Content-Type": "text/turtle" } })).status).toBe(201);
  });

  it("keeps any other file as it is, under its content type", async () => {
    const { fetch } = pod();
    const bytes = new Uint8Array([1, 2, 3]);
    expect((await fetch(`${ROOT}img.png`, { method: "PUT", headers: { "Content-Type": "image/png" }, body: bytes })).status).toBe(201);
    const get = await fetch(`${ROOT}img.png`);
    expect(get.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(bytes);
    expect((await fetch(`${ROOT}blank`, { method: "PUT" })).status).toBe(201);
    expect((await fetch(`${ROOT}blank`)).headers.get("Content-Type")).toBe("");
  });

  it("applies SPARQL Updates in order, creating a missing document", async () => {
    const { fetch } = pod();
    expect((await fetch(DOC, update("INSERT DATA {\n<#a> <#b> <#c> .\n<#a> <#b> 1 .\n};\n"))).status).toBe(201);
    const patched = await fetch(
      DOC,
      update('DELETE DATA {\n<#a> <#b> 1 .\n};\nINSERT DATA {\n<#a> <#b> "x}y" .\n};\n'),
    );
    expect(patched.status).toBe(205);
    expect((await (await fetch(DOC)).text()).split("\n").sort()).toEqual([
      `<${DOC}#a> <${DOC}#b> "x}y" .`,
      `<${DOC}#a> <${DOC}#b> <${DOC}#c> .`,
    ]);
  });

  it("refuses a PATCH it cannot apply", async () => {
    const { fetch } = pod();
    expect((await fetch(DOC, { method: "PATCH", headers: { "Content-Type": "text/n3" }, body: "" })).status).toBe(415);
    expect((await fetch(DOC, { method: "PATCH", headers: { "Content-Type": "application/sparql-update" } })).status).toBe(415);
    expect((await fetch(DOC, update("DELETE { ?s ?p ?o } WHERE { ?s ?p ?o }"))).status).toBe(400);
    expect((await fetch(DOC, update("INSERT DATA { <#a> <#b> }"))).status).toBe(400);
    await fetch(`${ROOT}img.png`, { method: "PUT", headers: { "Content-Type": "image/png" }, body: "x" });
    expect((await fetch(`${ROOT}img.png`, update("INSERT DATA { <#a> <#b> <#c> . }"))).status).toBe(409);
  });

  it("holds a PATCH to If-Match", async () => {
    const { fetch } = pod();
    await fetch(DOC, turtle(""));
    expect((await fetch(DOC, update("INSERT DATA { <#a> <#b> <#c> . }", { "If-Match": '"old"' }))).status).toBe(412);
  });

  it("creates containers by PUT, never twice, and nothing else at a container URL", async () => {
    const { fetch } = pod();
    expect((await fetch(`${ROOT}c/d/`, { method: "PUT", headers: { "Content-Type": "text/turtle" } })).status).toBe(201);
    expect((await fetch(`${ROOT}c/`)).status).toBe(200);
    expect((await fetch(`${ROOT}c/d/`, { method: "PUT" })).status).toBe(409);
    expect((await fetch(`${ROOT}c/e/`, update("INSERT DATA { <#a> <#b> <#c> . }"))).status).toBe(409);
  });

  it("deletes documents and empty containers, never the root or a full container", async () => {
    const { fetch } = pod();
    await fetch(DOC, turtle(""));
    expect((await fetch(`${ROOT}a/b/`, { method: "DELETE" })).status).toBe(409);
    expect((await fetch(ROOT, { method: "DELETE" })).status).toBe(405);
    expect((await fetch(DOC, { method: "DELETE" })).status).toBe(205);
    expect((await fetch(DOC, { method: "DELETE" })).status).toBe(404);
    expect((await fetch(`${ROOT}a/b/`, { method: "DELETE" })).status).toBe(205);
    expect(await (await fetch(`${ROOT}a/`)).text()).not.toContain("contains");
  });

  it("gives a container a new ETag when what it contains changes, and only then", async () => {
    const { fetch } = pod();
    await fetch(DOC, turtle(""));
    const etag = async () => (await fetch(`${ROOT}a/b/`, { method: "HEAD" })).headers.get("ETag");
    const before = await etag();
    await fetch(DOC, turtle("<#a> <#b> <#c> ."));
    expect(await etag()).toBe(before);
    await fetch(`${ROOT}a/b/other.ttl`, turtle(""));
    const added = await etag();
    expect(added).not.toBe(before);
    await fetch(`${ROOT}a/b/other.ttl`, { method: "DELETE" });
    expect(await etag()).not.toBe(added);
  });

  it("runs one request at a time on its store", async () => {
    const { fetch } = pod();
    const writes = Array.from({ length: 5 }, (_, i) => fetch(DOC, update(`INSERT DATA { <#a> <#b> ${i} . }`)));
    expect((await Promise.all(writes)).map((r) => r.status).sort()).toEqual([201, 205, 205, 205, 205]);
    expect((await (await fetch(DOC)).text()).split("\n")).toHaveLength(5);
  });
});

describe("dataBlocks", () => {
  it("reads INSERT DATA and DELETE DATA blocks, in any case", () => {
    expect(dataBlocks("delete data { <a> <b> <c> . } ; insert DATA{<a> <b> <d>.}")).toEqual([
      { operation: "DELETE", data: " <a> <b> <c> . " },
      { operation: "INSERT", data: "<a> <b> <d>." },
    ]);
    expect(dataBlocks("  ")).toEqual([]);
  });

  it("does not end a block at a brace in an IRI, a string or a comment", () => {
    const data = ` <a{}> <b> "}\\"}" , '}' , """}"}""" , '''}''' . # }\n `;
    expect(dataBlocks(`INSERT DATA {${data}}`)).toEqual([{ operation: "INSERT", data }]);
  });

  it("refuses other updates, and unfinished ones", () => {
    expect(dataBlocks("INSERT { <a> <b> <c> } WHERE {}")).toBeNull();
    expect(dataBlocks("INSERT DATA { <a> <b> <c> .")).toBeNull();
    expect(dataBlocks("INSERT DATA { <a")).toBeNull();
    expect(dataBlocks("INSERT DATA { # }")).toBeNull();
  });
});

describe("parentOf", () => {
  it("is the container a resource is in", () => {
    expect(parentOf(`${ROOT}a/b/doc.ttl`)).toBe(`${ROOT}a/b/`);
    expect(parentOf(`${ROOT}a/b/`)).toBe(`${ROOT}a/`);
    expect(parentOf(`${ROOT}a`)).toBe(ROOT);
    expect(parentOf(ROOT)).toBeNull();
  });
});
