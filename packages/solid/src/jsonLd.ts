// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad, Term } from "@rdfjs/types";
import { AppError } from "@solid-memo/domain/appError";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

/** What a local name may be, for an IRI to be written as prefix:name: nothing JSON-LD would read otherwise. */
const LOCAL_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

type Value =
  | string
  | { "@id": string }
  | { "@value": string; "@language"?: string; "@type"?: string };

/**
 * Triples as a JSON-LD document of our own writing: flattened, every
 * subject a node of its `@graph` (blank nodes as `_:` ids), its
 * `@context` the prefixes, which the predicates, the types and the IRIs
 * are written with where their local name allows. A plain string is a
 * JSON string; any other literal a value object, with its language or
 * its datatype. Subjects, their keys and their values are sorted, so the
 * same triples are always the same text. No vendor library writes
 * JSON-LD in the browser here (docs/boundaries.md).
 */
export function jsonLdOf(
  quads: Iterable<Quad>,
  prefixes: Readonly<Record<string, string>>,
): string {
  const compact = (iri: string): string => {
    for (const [prefix, namespace] of Object.entries(prefixes)) {
      if (iri.startsWith(namespace) && LOCAL_NAME.test(iri.slice(namespace.length))) {
        return `${prefix}:${iri.slice(namespace.length)}`;
      }
    }
    return iri;
  };
  const nodes = new Map<string, Map<string, Value[]>>();
  for (const { subject, predicate, object } of quads) {
    const id = idOf(subject);
    const node = nodes.get(id) ?? new Map<string, Value[]>();
    nodes.set(id, node);
    const isType = predicate.value === RDF_TYPE && object.termType === "NamedNode";
    const key = isType ? "@type" : compact(predicate.value);
    const value: Value = isType ? compact(object.value) : termValue(object, compact);
    const values = node.get(key);
    if (values === undefined) node.set(key, [value]);
    else values.push(value);
  }
  const graph = [...nodes]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, node]) => ({
      "@id": id,
      ...Object.fromEntries(
        [...node]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([key, values]) => {
            const sorted = values
              .map((value) => JSON.stringify(value))
              .sort()
              .map((text) => JSON.parse(text) as Value);
            return [key, sorted.length === 1 ? sorted[0] : sorted];
          }),
      ),
    }));
  return `${JSON.stringify({ "@context": prefixes, "@graph": graph }, null, 2)}\n`;
}

function idOf(term: Term): string {
  return term.termType === "BlankNode" ? `_:${term.value}` : term.value;
}

function termValue(term: Term, compact: (iri: string) => string): Value {
  if (term.termType !== "Literal")
    return { "@id": term.termType === "BlankNode" ? idOf(term) : compact(term.value) };
  if (term.language !== "") return { "@value": term.value, "@language": term.language };
  if (term.datatype.value === XSD_STRING) return term.value;
  return { "@value": term.value, "@type": compact(term.datatype.value) };
}

/**
 * How deep a deck file's JSON may nest: a file this app exports nests
 * five levels, and the JSON-LD parser takes time far beyond linear in
 * the depth of each value it reads (an array in an array, …), so a file
 * nested some hundreds of levels holds the tab for minutes.
 */
const MAX_JSON_DEPTH = 12;

/**
 * How many contexts a top-level node's `@context` may list: a file this
 * app exports states one. The parser builds each from the one before, a
 * copy of every term so far, so a long list of contexts takes time far
 * beyond linear in its length.
 */
const MAX_CONTEXTS = 8;

/**
 * Refuse JSON-LD that names a context elsewhere (a URL, or `@import`):
 * reading it would fetch that address from the user's browser. A file
 * this app exports states its context in full. Refuse a context anywhere
 * but on a top-level node (the document, or a node of a top-level array),
 * and one that lists more than MAX_CONTEXTS: the parser applies a context
 * inside a term definition (a scoped one) again at every use of the term,
 * and one on a node on top of all the terms it inherits, so a small file
 * of such contexts holds the tab for minutes. A file this app exports
 * states its context once, at the top. Refuse JSON nested deeper than
 * MAX_JSON_DEPTH too, before anything recurses into it. Throws
 * deckFileUnreadable, as for text that is no JSON at all.
 *
 * Gives the document checked, written again: the parser is to read that
 * text, not the file's, so that both see the same document. A key named
 * twice in an object is one key to JSON.parse, which keeps the last; a
 * streaming parser may act on the first. Each object's `@context` comes
 * first in it (written): the parser reads the text as it streams, which
 * it can only with the context before the rest.
 */
export function refuseRemoteContexts(text: string): string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new AppError("deckFileUnreadable", { reason: String(error) });
  }
  const topLevel = new Set(Array.isArray(json) ? json : [json]);
  // A walk of its own, not a recursion, which a file nested deeper than the call stack would end.
  const pending: [value: unknown, depth: number][] = [[json, 0]];
  while (pending.length > 0) {
    const [value, depth] = pending.pop()!;
    if (typeof value !== "object" || value === null) continue;
    if (depth === MAX_JSON_DEPTH) {
      throw new AppError("deckFileUnreadable", {
        reason: `The file nests deeper than ${MAX_JSON_DEPTH} levels.`,
      });
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "@context") refuseContext(child, topLevel.has(value));
      pending.push([child, depth + 1]);
    }
  }
  // Only now, the depth known to be within MAX_JSON_DEPTH: written recurses.
  return written(json);
}

/**
 * JSON as text, each object's `@context` first. JSON.stringify writes an
 * object's keys in their order, but one that reads as an integer before
 * every other.
 */
function written(value: unknown): string {
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(written).join(",")}]`;
  const entries = Object.entries(value).sort(
    ([a], [b]) => Number(b === "@context") - Number(a === "@context"),
  );
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${written(child)}`).join(",")}}`;
}

/** Throws deckFileUnreadable unless a context is stated in full, on a top-level node, in at most MAX_CONTEXTS. */
function refuseContext(context: unknown, onTopLevelNode: boolean): void {
  const contexts = Array.isArray(context) ? context : [context];
  if (contexts.some(remote)) {
    throw new AppError("deckFileUnreadable", {
      reason: "The file names a JSON-LD context elsewhere.",
    });
  }
  if (!onTopLevelNode || contexts.length > MAX_CONTEXTS) {
    throw new AppError("deckFileUnreadable", {
      reason: `The file states a JSON-LD context below its top level, or lists more than ${MAX_CONTEXTS}.`,
    });
  }
}

/** Whether a context is one named by its address, or holds one. */
function remote(context: unknown): boolean {
  return (
    typeof context === "string" ||
    (typeof context === "object" && context !== null && "@import" in context)
  );
}
