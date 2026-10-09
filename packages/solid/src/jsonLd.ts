import type { Quad, Term } from "@rdfjs/types";
import { AppError } from "@solid-memo/domain/appError";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

/** What a local name may be, for an IRI to be written as prefix:name: nothing JSON-LD would read otherwise. */
const LOCAL_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

type Value = string | { "@id": string } | { "@value": string; "@language"?: string; "@type"?: string };

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
export function jsonLdOf(quads: Iterable<Quad>, prefixes: Readonly<Record<string, string>>): string {
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
    const value: Value = isType ? compact(object.value) : valueOf(object, compact);
    node.set(key, [...(node.get(key) ?? []), value]);
  }
  const graph = [...nodes]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, node]) => ({
      "@id": id,
      ...Object.fromEntries(
        [...node]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([key, values]) => {
            const sorted = values.map((value) => JSON.stringify(value)).sort().map((text) => JSON.parse(text) as Value);
            return [key, sorted.length === 1 ? sorted[0] : sorted];
          }),
      ),
    }));
  return `${JSON.stringify({ "@context": prefixes, "@graph": graph }, null, 2)}\n`;
}

function idOf(term: Term): string {
  return term.termType === "BlankNode" ? `_:${term.value}` : term.value;
}

function valueOf(term: Term, compact: (iri: string) => string): Value {
  if (term.termType !== "Literal") return { "@id": term.termType === "BlankNode" ? idOf(term) : compact(term.value) };
  if (term.language !== "") return { "@value": term.value, "@language": term.language };
  if (term.datatype.value === XSD_STRING) return term.value;
  return { "@value": term.value, "@type": compact(term.datatype.value) };
}

/**
 * Refuse JSON-LD that names a context elsewhere (a URL, or `@import`):
 * reading it would fetch that address from the user's browser. A file
 * this app exports states its context in full. Throws
 * deckFileUnreadable, as for text that is no JSON at all.
 */
export function refuseRemoteContexts(text: string): void {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new AppError("deckFileUnreadable", { reason: String(error) });
  }
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "@context" && remote(child)) {
        throw new AppError("deckFileUnreadable", { reason: "The file names a JSON-LD context elsewhere." });
      }
      visit(child);
    }
  };
  visit(json);
}

/** Whether a context is, or holds, one named by its address. */
function remote(context: unknown): boolean {
  const contexts = Array.isArray(context) ? context : [context];
  return contexts.some((one) => typeof one === "string" || (typeof one === "object" && one !== null && "@import" in one));
}
