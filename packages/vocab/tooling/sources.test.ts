import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fileOf, readShapeTree, readSiteTurtle, SHAPE_SOURCES, SHAPES_BASE, shapesFetch, SITE, SITE_VENDOR, VOCAB_BASE } from "./sources.ts";
import { DECKS_ROOT, NS_ROOT, VOCAB_ROOT } from "./root.ts";

describe("fileOf", () => {
  it("reads ns/ and decks/ from the repository and vendor/ from this package, without the fragment", () => {
    expect(fileOf(`${VOCAB_BASE}v1.ttl#Card`)).toBe(`${NS_ROOT}vocab/v1.ttl`);
    expect(fileOf(`${SHAPES_BASE}card/v1.ttl`)).toBe(`${NS_ROOT}shapes/card/v1.ttl`);
    expect(fileOf(`${SITE}decks/index.ttl#capitals`)).toBe(`${DECKS_ROOT}index.ttl`);
    expect(fileOf(`${SITE_VENDOR}skohub/skos.shacl.ttl`)).toBe(`${VOCAB_ROOT}vendor/skohub/skos.shacl.ttl`);
  });

  it("knows no other document", () => {
    expect(fileOf(`${SITE}index.html`)).toBeUndefined();
    expect(fileOf("https://pod.example/ns/vocab/v1.ttl")).toBeUndefined();
  });
});

describe("readSiteTurtle", () => {
  it("reads a document from disk, failing on one the repository does not publish or have", async () => {
    expect(await readSiteTurtle(`${VOCAB_BASE}v1.ttl`)).toContain(`@base <${VOCAB_BASE}v1.ttl> .`);
    await expect(readSiteTurtle("https://pod.example/x.ttl")).rejects.toThrow("https://pod.example/x.ttl is not published from this repository.");
    await expect(readSiteTurtle(`${SHAPES_BASE}no-such-shape/v1.ttl`)).rejects.toThrow("ENOENT");
  });
});

describe("readShapeTree", () => {
  it("reads every shape document, sorted, each with its own address as its base", async () => {
    const files = await readShapeTree();
    expect(files.map((f) => f.path)).toContain("card/v1.ttl");
    for (const { path, turtle } of files) {
      expect(path).toMatch(/^[a-z][a-z0-9-]*\/v[1-9][0-9]*\.ttl$/);
      expect(turtle).toContain(`@base <${SHAPES_BASE}${path}> .`);
    }
  });
});

describe("shapesFetch", () => {
  it("serves the vendored profiles from this package's vendor/ folder", async () => {
    const path = "skohub/skos.shacl.ttl";
    const response = await shapesFetch(new Request(`${SITE_VENDOR}${path}`));
    expect(response.headers.get("content-type")).toBe("text/turtle");
    expect(await response.text()).toBe(await readFile(`${VOCAB_ROOT}vendor/${path}`, "utf8"));
  });

  it("serves the site's documents at their own address, and 404 for any other", async () => {
    const url = `${SHAPES_BASE}card/v1.ttl`;
    const response = await shapesFetch(url);
    expect(response.url).toBe(url);
    expect(await response.text()).toBe(await readFile(`${NS_ROOT}shapes/card/v1.ttl`, "utf8"));
    expect((await shapesFetch(`${SHAPES_BASE}card/v99.ttl`)).status).toBe(404);
    expect((await shapesFetch("https://pod.example/x.ttl")).status).toBe(404);
  });

  it("is given with the bases the app uses", () => {
    expect(SHAPE_SOURCES).toEqual({ shapesBaseUrl: SHAPES_BASE, vocabBaseUrl: VOCAB_BASE, vendorBaseUrl: SITE_VENDOR });
  });
});
