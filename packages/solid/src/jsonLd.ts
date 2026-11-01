// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad, Term } from "@rdfjs/types";
import { AppError } from "@solid-memo/domain/appError";
import { MAX_BASE_CHARACTERS, plainBase } from "./client/readLimits";

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
 * How many characters the terms and values of a top-level node's
 * contexts may come to together: the prefixes a file this app exports states come to some
 * hundreds. The parser builds a term's IRI from the terms it names, and
 * gives it again at every use of the term, in time growing with its
 * length, so the read limits on the triples bound the time only with the
 * terms bounded too.
 */
const MAX_CONTEXT_CHARACTERS = 8 * MAX_BASE_CHARACTERS;

/** An IRI with a scheme, or a compact IRI: one the parser need not resolve against the base. */
const WITH_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * Refuse JSON-LD that names a context elsewhere (a URL, or `@import`):
 * reading it would fetch that address from the user's browser. A file
 * this app exports states its context in full. Refuse a context anywhere
 * but on a top-level node (the document, or a node of a top-level array),
 * and one that lists more than MAX_CONTEXTS: the parser applies a context
 * inside a term definition (a scoped one) again at every use of the term,
 * and one on a node on top of all the terms it inherits, so a small file
 * of such contexts holds the tab for minutes. A file this app exports
 * states its context once, at the top. Refuse a context that is not
 * terms and keywords each given as a string (an IRI, a prefix's, or a
 * keyword's value such as `@vocab`): a term defined by an object may say
 * how its values are read, and the parser reads some of those (a `@graph`
 * container) in time growing with the square of the values. A file this
 * app exports states prefixes alone. Refuse a base or a vocabulary
 * (`@base`, `@vocab`) past what a Turtle text read under limits may
 * declare (readLimits.ts): one whose path is not plain (plainBase), or
 * those of a node's contexts, which each resolve against the one before,
 * of more than MAX_BASE_CHARACTERS together. The parser walks the whole
 * base for each relative IRI it resolves, and the IRIs it gives can be
 * far shorter than the base, so the read limits on the triples bound the
 * time only with the base bounded too. A file this app exports declares
 * neither. The document's own base (`baseUrl`) counts toward the bound
 * as in Turtle. Refuse a term or prefix defined as an IRI that is
 * relative, not plain or longer than MAX_BASE_CHARACTERS (plainTerm), or
 * through a term of the node's contexts (chained), and contexts of
 * more than MAX_CONTEXT_CHARACTERS: the parser gives a term's IRI again
 * at every use, and resolves a relative one against the base, so a long
 * one costs its length at every use for an IRI that may be short. A file
 * this app exports states short namespaces with a scheme. Refuse JSON
 * nested deeper than MAX_JSON_DEPTH too, before anything recurses into
 * it, and an RDF-star annotation or triple term (refuseTripleTerms),
 * which the parser is also told not to read. Throws
 * deckFileUnreadable, as for text that is no JSON at all.
 *
 * Gives the document checked, written again: the parser is to read that
 * text, not the file's, so that both see the same document. A key named
 * twice in an object is one key to JSON.parse, which keeps the last; a
 * streaming parser may act on the first. Each object's `@context` comes
 * first in it (written): the parser reads the text as it streams, which
 * it can only with the context before the rest.
 */
export function refuseRemoteContexts(text: string, baseUrl: string): string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new AppError("deckFileUnreadable", { reason: String(error) });
  }
  const topLevel = new Set(Array.isArray(json) ? json : [json]);
  // The terms the contexts alias to `@id`, and the keys given an object (alone or in an array), in the whole
  // document: an `@id` that is an object is a triple.
  const ids = new Set(["@id"]);
  const givenObjects = new Set<string>();
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
      if (key === "@context") {
        for (const alias of refuseContext(child, topLevel.has(value), baseUrl)) ids.add(alias);
      }
      if (key === "@annotation") refuseTripleTerms();
      if (holdsObject(child)) givenObjects.add(key);
      pending.push([child, depth + 1]);
    }
  }
  if ([...ids].some((id) => givenObjects.has(id))) refuseTripleTerms();
  // Only now, the depth known to be within MAX_JSON_DEPTH: written recurses.
  return written(json);
}

/** Whether a value is an object, or an array that holds one. */
function holdsObject(value: unknown): boolean {
  const values = Array.isArray(value) ? value : [value];
  return values.some((one) => typeof one === "object" && one !== null && !Array.isArray(one));
}

/**
 * Throws deckFileUnreadable for an RDF-star annotation or triple term
 * (an `@id` that is an object, or an array holding one): the parser holds each annotation of the
 * top-level nodes to the end, copying all those before it at each, in
 * time growing with their square. A file this app exports holds neither,
 * and the app writes no triple term.
 */
function refuseTripleTerms(): never {
  throw new AppError("deckFileUnreadable", {
    reason: "The file states an RDF-star annotation or triple term.",
  });
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

/**
 * Throws deckFileUnreadable unless a context is stated in full, as
 * strings alone, on a top-level node, in at most MAX_CONTEXTS, with
 * plain bases and vocabularies within MAX_BASE_CHARACTERS (baseLength),
 * plain terms (plainTerm) that name no term of the node's contexts
 * (chained), and at most MAX_CONTEXT_CHARACTERS in all, and none an
 * alias of `@annotation` (refuseTripleTerms). Gives the terms it aliases
 * to `@id`.
 */
function refuseContext(context: unknown, onTopLevelNode: boolean, baseUrl: string): string[] {
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
  if (!contexts.every(ofStrings)) {
    throw new AppError("deckFileUnreadable", {
      reason: "The file defines a JSON-LD term by more than an IRI.",
    });
  }
  const entries = (contexts as Record<string, string>[]).flatMap(Object.entries);
  for (const keyword of ["@base", "@vocab"]) {
    const declared = entries.flatMap(([key, iri]) => (key === keyword ? [iri] : []));
    if (baseLength(baseUrl, declared) > MAX_BASE_CHARACTERS || !declared.every(plainBase)) {
      throw new AppError("deckFileUnreadable", {
        reason: `The file declares a JSON-LD ${keyword} that is not plain, or longer than ${MAX_BASE_CHARACTERS} characters.`,
      });
    }
  }
  const length = entries.reduce((sum, [key, value]) => sum + key.length + value.length, 0);
  if (length > MAX_CONTEXT_CHARACTERS || !entries.every(plainTerm)) {
    throw new AppError("deckFileUnreadable", {
      reason: `The file defines a JSON-LD term by an IRI that is relative, not plain, or longer than ${MAX_BASE_CHARACTERS} characters, or states contexts of more than ${MAX_CONTEXT_CHARACTERS} characters.`,
    });
  }
  const terms = new Set(entries.flatMap(([key]) => (key.startsWith("@") ? [] : [key])));
  if (entries.some(([, value]) => chained(value, terms))) {
    throw new AppError("deckFileUnreadable", {
      reason: "The file defines a JSON-LD term, base or vocabulary through another term.",
    });
  }
  if (entries.some(([, value]) => value === "@annotation")) refuseTripleTerms();
  return entries.flatMap(([key, value]) => (value === "@id" ? [key] : []));
}

/**
 * The longest base (or vocabulary) a node's declarations can come to, as
 * for a Turtle text read under limits (readLimits.ts): the document's
 * own base, or the longest absolute one declared, and each relative one
 * added, as each resolves against the one before.
 */
function baseLength(baseUrl: string, declared: string[]): number {
  let longest = baseUrl.length;
  let added = 0;
  for (const iri of declared) {
    if (WITH_SCHEME.test(iri)) longest = Math.max(longest, iri.length);
    else added += iri.length;
  }
  return longest + added;
}

/**
 * Whether a context's value is a compact IRI whose prefix (the part
 * before the first `:`) is a term of the node's contexts. The parser
 * expands such a value through that term, and that term's through the
 * next, with no bound on how deep, so two terms through each other (or
 * one through itself) build an IRI without end. A file this app exports
 * states its namespaces in full.
 */
function chained(value: string, terms: Set<string>): boolean {
  const colon = value.indexOf(":");
  return colon >= 0 && terms.has(value.slice(0, colon));
}

/**
 * Whether a context's term (or prefix) is defined as a keyword, or as a
 * plain IRI with a scheme (or a compact one) of at most
 * MAX_BASE_CHARACTERS: a relative one, which the parser resolves against
 * the base at every use, is not. A keyword's own value (`@language`, …)
 * is held to the length alone.
 */
function plainTerm([key, value]: [string, string]): boolean {
  if (value.length > MAX_BASE_CHARACTERS) return false;
  if (key.startsWith("@") || value.startsWith("@")) return true;
  return WITH_SCHEME.test(value) && plainBase(value);
}

/** Whether a context gives each of its terms and keywords as a string, defining no term by an object. */
function ofStrings(context: unknown): boolean {
  return (
    typeof context === "object" &&
    context !== null &&
    Object.values(context).every((value) => typeof value === "string")
  );
}

/** Whether a context is one named by its address, or holds one. */
function remote(context: unknown): boolean {
  return (
    typeof context === "string" ||
    (typeof context === "object" && context !== null && "@import" in context)
  );
}
