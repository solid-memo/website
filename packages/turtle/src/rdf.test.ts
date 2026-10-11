import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RDF_TYPE,
  listMembers,
  localName,
  objectsOf,
  parseTurtle,
  readTurtleTree,
  subjectsOfType,
} from "./rdf.ts";

const BASE = "https://example.com/doc.ttl";
const DOC = `
@prefix ex: <https://example.com/ns#> .
<#a> a ex:Thing ; ex:tag "one", "two" ; ex:list ( "x" "y" ) .
<#b> a ex:Thing, ex:Other .
_:blank a ex:Thing .
<#a> a ex:Thing .
`;

describe("parseTurtle and lookups", () => {
  const quads = parseTurtle(DOC, BASE);

  it("keeps objects in document order", () => {
    expect(objectsOf(quads, `${BASE}#a`, "https://example.com/ns#tag").map((o) => o.value)).toEqual(
      ["one", "two"],
    );
  });

  it("lists named subjects of a type once each, in order of first appearance", () => {
    expect(subjectsOfType(quads, "https://example.com/ns#Thing")).toEqual([
      `${BASE}#a`,
      `${BASE}#b`,
    ]);
    expect(objectsOf(quads, `${BASE}#b`, RDF_TYPE)).toHaveLength(2);
  });

  it("walks an RDF list", () => {
    const head = objectsOf(quads, `${BASE}#a`, "https://example.com/ns#list")[0];
    expect(listMembers(quads, head).map((o) => o.value)).toEqual(["x", "y"]);
  });

  it("stops at a list node without a rest", () => {
    const broken = parseTurtle(
      `<#l> <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> "x" .`,
      BASE,
    );
    const head = broken[0].subject;
    expect(listMembers(broken, head).map((o) => o.value)).toEqual(["x"]);
  });

  it("takes the local name after a hash or a slash", () => {
    expect(localName("https://example.com/ns#Thing")).toBe("Thing");
    expect(localName("http://purl.org/dc/terms/title")).toBe("title");
  });
});

describe("readTurtleTree", () => {
  it("reads every .ttl file under the folder, sorted, with relative paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solid-memo-ttl-"));
    await mkdir(join(dir, "deck"));
    await writeFile(join(dir, "deck", "v2.ttl"), "two");
    await writeFile(join(dir, "deck", "v1.ttl"), "one");
    await writeFile(join(dir, "card.ttl"), "card");
    await writeFile(join(dir, "README.md"), "no");
    expect(await readTurtleTree(dir)).toEqual([
      { path: "card.ttl", turtle: "card" },
      { path: "deck/v1.ttl", turtle: "one" },
      { path: "deck/v2.ttl", turtle: "two" },
    ]);
  });
});
