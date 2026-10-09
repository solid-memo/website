import { getSolidDataset, toRdfJsDataset } from "@inrupt/solid-client";
import type { Quad, Term } from "@rdfjs/types";

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

/**
 * A Turtle document as N-Triples lines, its relative IRIs resolved
 * against `url`: how the pods kept outside a server (localPod.ts, and
 * the one tests use) store documents. Rejects when the Turtle does not
 * parse.
 */
export async function triplesOf(url: string, turtle: string): Promise<Set<string>> {
  const fetch = (async () => {
    const response = new Response(turtle, { headers: { "Content-Type": "text/turtle" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  }) as unknown as typeof globalThis.fetch;
  const quads = [...toRdfJsDataset(await getSolidDataset(url, { fetch }))] as Quad[];
  return new Set(quads.map((q) => `${termOf(q.subject)} ${termOf(q.predicate)} ${termOf(q.object)} .`));
}

/** A term as Solid Memo's PATCH bodies write it (datasets.ts). */
export function termOf(t: Term): string {
  if (t.termType !== "Literal") return t.termType === "BlankNode" ? `_:${t.value}` : `<${t.value}>`;
  const text = `"${t.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
  if (t.language !== "") return `${text}@${t.language}`;
  return t.datatype.value === XSD_STRING ? text : `${text}^^<${t.datatype.value}>`;
}
