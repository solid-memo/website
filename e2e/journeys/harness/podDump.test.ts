import { describe, expect, it } from "vitest";
import { containedIn } from "./podDump.ts";

const POD = "https://127.0.0.1:4000/j-1/";
const CONTAINS = "http://www.w3.org/ns/ldp#contains";

describe("containedIn", () => {
  it("lists what the container contains, in expanded JSON-LD, absolute and sorted", () => {
    const jsonld = [
      { "@id": POD, [CONTAINS]: [{ "@id": `${POD}b.ttl` }, { "@id": `${POD}a/` }] },
      { "@id": `${POD}b.ttl`, "@type": ["http://www.w3.org/ns/ldp#Resource"] },
    ];
    expect(containedIn(jsonld, POD)).toEqual([`${POD}a/`, `${POD}b.ttl`]);
  });

  it("reads compacted JSON-LD, relative references and a single object", () => {
    expect(containedIn({ "@id": "", contains: "x.ttl" }, POD)).toEqual([`${POD}x.ttl`]);
    expect(containedIn({ "ldp:contains": [{ "@id": "y/" }] }, POD)).toEqual([`${POD}y/`]);
  });

  it("ignores what other nodes contain, and nodes that are not objects", () => {
    expect(containedIn([null, 3, { "@id": `${POD}other/`, [CONTAINS]: [{ "@id": `${POD}other/z` }] }], POD)).toEqual([]);
  });

  it("is empty for an empty container", () => {
    expect(containedIn([{ "@id": POD }], POD)).toEqual([]);
  });
});
