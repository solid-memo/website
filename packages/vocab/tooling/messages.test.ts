import { describe, expect, it } from "vitest";
import { parseTurtle } from "@solid-memo/turtle/rdf";
import { readShapeTree, SHAPES_BASE } from "./sources.ts";

const SH_MESSAGE = "http://www.w3.org/ns/shacl#message";

/**
 * The app shows a shape's sh:message to the user in their language (see
 * docs/validation.md), so every message comes in English and Swedish,
 * each tagged, one of each.
 */
describe("the shapes' messages", () => {
  it("are each in English and Swedish, tagged", async () => {
    const wrong: string[] = [];
    for (const { path, turtle } of await readShapeTree()) {
      const bySubject = new Map<string, string[]>();
      for (const q of parseTurtle(turtle, `${SHAPES_BASE}${path}`)) {
        if (q.predicate.value !== SH_MESSAGE) continue;
        const tag = q.object.termType === "Literal" ? q.object.language : "";
        bySubject.set(q.subject.value, [...(bySubject.get(q.subject.value) ?? []), tag || "(untagged)"]);
      }
      for (const [subject, tags] of bySubject) {
        if (tags.sort().join(",") !== "en,sv") wrong.push(`${path} <${subject}>: ${tags.join(", ")}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
