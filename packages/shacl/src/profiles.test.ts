import type { Quad } from "@rdfjs/types";
import { describe, expect, it } from "vitest";
import { coreOnly, PROFILES, REFERENCE_DATA } from "./profiles";

const SH = "http://www.w3.org/ns/shacl#";

/** Just enough of a quad for a filter on its predicate. */
const withPredicate = (predicate: string, id: string) =>
  ({ id, predicate: { value: predicate } }) as unknown as Quad;

describe("coreOnly", () => {
  it("drops SPARQL-based constraints and keeps everything else", () => {
    const target = withPredicate(`${SH}targetClass`, "target");
    const message = withPredicate(`${SH}message`, "message");
    const sparql = withPredicate(`${SH}sparql`, "sparql");
    expect(coreOnly([target, sparql, message])).toEqual([target, message]);
  });
});

describe("PROFILES", () => {
  it("names vendored files under the site's vendor/, and the reference data as documents of the vocabulary", () => {
    for (const path of Object.values(PROFILES).flat()) expect(path).toMatch(/^[\w-]+\/[\w./-]+\.ttl$/);
    for (const path of REFERENCE_DATA) expect(path).toMatch(/^[a-z0-9-]+\.ttl$/);
  });
});
