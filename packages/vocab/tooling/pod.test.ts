import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { createShapesFetch, readPodTurtle, readShapeTree, SHAPE_SOURCES, SHAPES_POD, shapesFetch, SITE_VENDOR, VOCAB_POD } from "./pod.ts";
import { VOCAB_ROOT } from "./root.ts";

const turtle = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/turtle" } });

/** A pod as a fetch: each URL's Turtle. */
function podOf(documents: Record<string, string>) {
  return vi.fn(async (input: string | URL | Request) => {
    const body = documents[String(input)];
    return body === undefined ? turtle("", 404) : turtle(body);
  }) as unknown as typeof globalThis.fetch & ReturnType<typeof vi.fn>;
}

const listing = (url: string, members: string[], containers: string[] = []) =>
  `@prefix ldp: <http://www.w3.org/ns/ldp#> .
<${url}> ldp:contains ${members.map((m) => `<${m}>`).join(", ")} .
${containers.map((c) => `<${c}> a ldp:Container .`).join("\n")}`;

describe("readPodTurtle", () => {
  it("reads a document as Turtle, once per process", async () => {
    const url = "https://vocab.example/once";
    const fetch = podOf({ [url]: "<#a> <#b> <#c> ." });
    expect(await readPodTurtle(url, fetch)).toBe("<#a> <#b> <#c> .");
    expect(await readPodTurtle(url, fetch)).toBe("<#a> <#b> <#c> .");
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(url, { headers: { Accept: "text/turtle" } });
  });

  it("reads over https by default, failing on a document the pod does not serve", async () => {
    expect(await readPodTurtle(`${VOCAB_POD}v1`)).toContain("owl:Ontology");
    await expect(readPodTurtle(`${SHAPES_POD}no-such-shape/v1`)).rejects.toThrow(`${SHAPES_POD}no-such-shape/v1 cannot be read: 40`);
    await expect(readPodTurtle("https://no-such-host.invalid/v1")).rejects.toThrow();
  });

  it("fails on a document it cannot read, and reads it again next time", async () => {
    const url = "https://vocab.example/missing";
    await expect(readPodTurtle(url, podOf({}))).rejects.toThrow(`${url} cannot be read: 404.`);
    expect(await readPodTurtle(url, podOf({ [url]: "found" }))).toBe("found");
  });
});

describe("readShapeTree", () => {
  it("reads every versioned document in each folder the shapes' pod lists, sorted, leaving out its profile", async () => {
    const fetch = podOf({
      [SHAPES_POD]: listing(SHAPES_POD, [`${SHAPES_POD}deck/`, `${SHAPES_POD}card`, `${SHAPES_POD}profile/`, `${SHAPES_POD}README`], [`${SHAPES_POD}card`]),
      [`${SHAPES_POD}deck/`]: listing(`${SHAPES_POD}deck/`, [`${SHAPES_POD}deck/v2`, `${SHAPES_POD}deck/notes`, `${SHAPES_POD}deck/v1`, `${SHAPES_POD}deck/old/`]),
      [`${SHAPES_POD}card`]: listing(`${SHAPES_POD}card`, [`${SHAPES_POD}card/v1`]),
      [`${SHAPES_POD}deck/v1`]: "deck 1",
      [`${SHAPES_POD}deck/v2`]: "deck 2",
      [`${SHAPES_POD}card/v1`]: "card 1",
    });
    expect(await readShapeTree(fetch)).toEqual([
      { path: "card/v1", turtle: "card 1" },
      { path: "deck/v1", turtle: "deck 1" },
      { path: "deck/v2", turtle: "deck 2" },
    ]);
    expect(fetch.mock.calls.map(([url]) => String(url))).not.toContain(`${SHAPES_POD}profile/`);
  });
});

describe("shapesFetch", () => {
  it("serves the vendored profiles from this package's vendor/ folder", async () => {
    const path = "skohub/skos.shacl.ttl";
    const response = await shapesFetch(new Request(`${SITE_VENDOR}${path}`));
    expect(response.headers.get("content-type")).toBe("text/turtle");
    expect(await response.text()).toBe(await readFile(`${VOCAB_ROOT}vendor/${path}`, "utf8"));
  });

  it("serves the pods' documents as readPodTurtle reads them, at their own address", async () => {
    const url = `${VOCAB_POD}served-once`;
    const response = await createShapesFetch(podOf({ [url]: "<#x> <#y> <#z> ." }))(url);
    expect(response.url).toBe(url);
    expect(await response.text()).toBe("<#x> <#y> <#z> .");
  });

  it("is given with the bases the app uses", () => {
    expect(SHAPE_SOURCES).toEqual({ shapesBaseUrl: SHAPES_POD, vocabBaseUrl: VOCAB_POD, vendorBaseUrl: SITE_VENDOR });
  });
});
