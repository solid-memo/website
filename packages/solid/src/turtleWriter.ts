import type { Quad, Term } from "@rdfjs/types";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";

/** What a local name may be, for an IRI to be written as prefix:name: nothing Turtle would read otherwise. */
const LOCAL_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * Triples as a Turtle document of our own writing, as a release is
 * written (docs/deck-library.md): `@base` the document's own address,
 * so its subjects read `<>` and `<#id>`, then the prefixes it uses; a
 * block per subject, in the order given (`order`, the rest after in the
 * order met), its types first; a blank node named once written in place
 * (`[ … ]`). Text is written on one line, its quotes, backslashes and
 * line breaks escaped; integers and booleans bare. No vendor library
 * writes Turtle with a base in the browser (docs/boundaries.md).
 */
export function turtleOf(
  quads: Iterable<Quad>,
  { base, prefixes, order = [] }: { base: string; prefixes: Readonly<Record<string, string>>; order?: readonly string[] },
): string {
  const bySubject = new Map<string, Quad[]>();
  const named = new Map<string, number>();
  const namedBy = new Map<string, string>();
  for (const quad of quads) {
    const key = keyOf(quad.subject);
    const statements = bySubject.get(key);
    if (statements === undefined) bySubject.set(key, [quad]);
    else statements.push(quad);
    if (quad.object.termType === "BlankNode") {
      named.set(quad.object.value, (named.get(quad.object.value) ?? 0) + 1);
      namedBy.set(quad.object.value, key);
    }
  }
  // A blank node another subject names once, reached from a named subject, is written in place; any other by its label.
  const inlined = new Set<string>();
  for (const [label, count] of named) {
    if (count !== 1 || !bySubject.has(`_:${label}`)) continue;
    const seen = new Set([label]);
    let by = namedBy.get(label)!;
    while (by.startsWith("_:") && named.get(by.slice(2)) === 1 && !seen.has(by.slice(2))) {
      seen.add(by.slice(2));
      by = namedBy.get(by.slice(2))!;
    }
    if (!by.startsWith("_:")) inlined.add(label);
  }
  const used = new Set<string>();
  const iri = (value: string): string => {
    if (value === base) return "<>";
    if (value.startsWith(`${base}#`)) return `<${value.slice(base.length)}>`;
    for (const [prefix, namespace] of Object.entries(prefixes)) {
      if (value.startsWith(namespace) && LOCAL_NAME.test(value.slice(namespace.length))) {
        used.add(prefix);
        return `${prefix}:${value.slice(namespace.length)}`;
      }
    }
    return `<${value}>`;
  };
  const object = (term: Term, depth: number): string => {
    if (term.termType === "NamedNode") return iri(term.value);
    if (term.termType === "BlankNode") {
      return inlined.has(term.value) ? `[ ${predicates(bySubject.get(`_:${term.value}`)!, depth + 1).join(" ; ")} ]` : `_:${term.value}`;
    }
    return literal(term as Quad["object"] & { termType: "Literal" }, iri);
  };
  const predicates = (statements: readonly Quad[], depth: number): string[] => {
    const grouped = new Map<string, Quad[]>();
    for (const statement of statements) {
      const same = grouped.get(statement.predicate.value);
      if (same === undefined) grouped.set(statement.predicate.value, [statement]);
      else same.push(statement);
    }
    const keys = [...grouped.keys()].sort((a, b) => Number(b === RDF_TYPE) - Number(a === RDF_TYPE));
    const indent = "    ".repeat(depth + 1);
    return keys.map((predicate) => {
      const objects = grouped.get(predicate)!.map((statement) => object(statement.object, depth));
      const name = predicate === RDF_TYPE ? "a" : iri(predicate);
      return `${name} ${objects.join(` ,\n${indent}${" ".repeat(name.length + 1)}`)}`;
    });
  };
  const keys = [...new Set([...order.filter((key) => bySubject.has(key)), ...bySubject.keys()])];
  const blocks = keys
    .filter((key) => !(key.startsWith("_:") && inlined.has(key.slice(2))))
    .map((key) => `${key.startsWith("_:") ? key : iri(key)}\n    ${predicates(bySubject.get(key)!, 0).join(" ;\n    ")} .`);
  const header = [
    `@base <${base}> .`,
    "",
    ...Object.entries(prefixes)
      .filter(([prefix]) => used.has(prefix))
      .map(([prefix, namespace]) => `@prefix ${prefix}: <${namespace}> .`),
  ];
  return `${header.join("\n")}\n\n${blocks.join("\n\n")}\n`;
}

function keyOf(term: Term): string {
  return term.termType === "BlankNode" ? `_:${term.value}` : term.value;
}

function literal(term: { value: string; language: string; datatype: { value: string } }, iri: (value: string) => string): string {
  const datatype = term.datatype.value;
  if (datatype === `${XSD}integer` && /^[+-]?[0-9]+$/.test(term.value)) return term.value;
  if (datatype === `${XSD}boolean` && (term.value === "true" || term.value === "false")) return term.value;
  const text = `"${term.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
  if (term.language !== "" || datatype === LANG_STRING) return `${text}@${term.language}`;
  return datatype === `${XSD}string` ? text : `${text}^^${iri(datatype)}`;
}
