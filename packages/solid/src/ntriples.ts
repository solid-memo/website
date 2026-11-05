// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { pathKeys } from "@solid-memo/domain/pathKeys";
import type { Quad, Term } from "@rdfjs/types";
import { toRdfJsDataset } from "./client/rdf";
import { MAX_TERM_CHARACTERS } from "./client/readLimits";
import { getSolidDatasetLinear } from "./client/resources";

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

/**
 * A Turtle document as N-Triples lines, its relative IRIs resolved
 * against `url`: how the pods kept outside a server (localPod.ts, and
 * the one tests use) store documents, built in one pass (client/linearDataset.ts),
 * so a large document is stored in time linear in its size. Each line is
 * there once (TripleLines). Rejects when the Turtle does not parse.
 */
export async function triplesOf(url: string, turtle: string): Promise<TripleLines> {
  const fetch = (async () => {
    const response = new Response(turtle, { headers: { "Content-Type": "text/turtle" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  }) as unknown as typeof globalThis.fetch;
  const quads = [...toRdfJsDataset(await getSolidDatasetLinear(url, { fetch }))] as Quad[];
  return new TripleLines(
    quads.map((q) => `${termOf(q.subject)} ${termOf(q.predicate)} ${termOf(q.object)} .`),
  );
}

/**
 * N-Triples lines, each once, in the order each was first added, as a
 * Set of them would hold them. A line joins three terms, so it could be
 * past the bound on a term (MAX_TERM_CHARACTERS), and a Set keyed by
 * many such lines of one length would find one only by comparing it
 * with every other. A line is keyed instead by the path of its pieces,
 * each at most that long (pathKeys), never by the line as one string.
 * A piece of just the bound's length is safe: V8 hashes a string of up
 * to 16,383 characters by its content, not by its length.
 */
export class TripleLines implements Iterable<string> {
  readonly #keyOf = pathKeys();
  readonly #lines = new Map<number, string>();

  constructor(lines: Iterable<string>) {
    for (const line of lines) this.add(line);
  }

  add(line: string): void {
    this.#lines.set(this.#keyOf(piecesOf(line)), line);
  }

  delete(line: string): void {
    this.#lines.delete(this.#keyOf(piecesOf(line)));
  }

  [Symbol.iterator](): Iterator<string> {
    return this.#lines.values();
  }
}

/** The line cut into pieces of at most MAX_TERM_CHARACTERS, in order. */
function piecesOf(line: string): string[] {
  const pieces: string[] = [];
  for (let at = 0; at < line.length; at += MAX_TERM_CHARACTERS)
    pieces.push(line.slice(at, at + MAX_TERM_CHARACTERS));
  return pieces;
}

/** A term as Solid Memo's PATCH bodies write it (datasets.ts). */
export function termOf(t: Term): string {
  if (t.termType !== "Literal") return t.termType === "BlankNode" ? `_:${t.value}` : `<${t.value}>`;
  const text = `"${t.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
  if (t.language !== "") return `${text}@${t.language}`;
  return t.datatype.value === XSD_STRING ? text : `${text}^^<${t.datatype.value}>`;
}
