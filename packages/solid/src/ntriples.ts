import type { Term } from "@rdfjs/types";
import { parseTurtle } from "./linearDataset";

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

/**
 * A Turtle document as N-Triples lines, its relative IRIs resolved
 * against `url`, in the order the document states them: how the pods
 * kept outside a server (localPod.ts, and the one tests use) store
 * documents, so one written as such a pod serves it is served again
 * byte for byte. Rejects when the Turtle does not parse.
 */
export async function triplesOf(url: string, turtle: string): Promise<Set<string>> {
  const quads = await parseTurtle(turtle, url);
  return new Set(quads.map((q) => `${termOf(q.subject)} ${termOf(q.predicate)} ${termOf(q.object)} .`));
}

/** A term as Solid Memo's PATCH bodies write it (datasets.ts). */
export function termOf(t: Term): string {
  if (t.termType !== "Literal") return t.termType === "BlankNode" ? `_:${t.value}` : `<${t.value}>`;
  const text = `"${t.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
  if (t.language !== "") return `${text}@${t.language}`;
  return t.datatype.value === XSD_STRING ? text : `${text}^^<${t.datatype.value}>`;
}
