import type { Quad, Term } from "@rdfjs/types";

/**
 * Whether two documents say the same, statement for statement, however
 * each is written: the order of statements, prefixes, blank node labels,
 * the case of language tags and how a number or a truth value is written
 * (`2.50` and `2.5`, `1` and `true`) make no difference, as a server may
 * change any of them when it rewrites a document. A blank node counts as
 * any other: two documents differing only in how their blank nodes are
 * joined are taken to say the same, which no document an update writes
 * can tell apart from another's change.
 */

const XSD = "http://www.w3.org/2001/XMLSchema#";
const INTEGERS = new Set(
  ["integer", "long", "int", "short", "byte", "nonNegativeInteger", "positiveInteger", "nonPositiveInteger", "negativeInteger"]
    .concat(["unsignedLong", "unsignedInt", "unsignedShort", "unsignedByte"])
    .map((name) => `${XSD}${name}`),
);

/** A literal's value in one spelling of the many its datatype allows. */
function canonicalValue(value: string, datatype: string): string {
  const text = value.trim();
  if (INTEGERS.has(datatype) && /^[+-]?\d+$/.test(text)) return BigInt(text).toString();
  if (datatype === `${XSD}decimal`) {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
    if (match === null) return value;
    const whole = match[2]!.replace(/^0+(?=\d)/, "") || "0";
    const fraction = (match[3] ?? "").replace(/0+$/, "");
    const sign = match[1] === "-" && /[1-9]/.test(whole + fraction) ? "-" : "";
    return `${sign}${whole}.${fraction || "0"}`;
  }
  if (datatype === `${XSD}double` || datatype === `${XSD}float`) {
    const number = Number(text.replace(/^([+-]?)INF$/, "$1Infinity"));
    return Number.isNaN(number) && text !== "NaN" ? value : String(number);
  }
  if (datatype === `${XSD}boolean`) return text === "1" ? "true" : text === "0" ? "false" : text;
  return value;
}

function termOf(term: Term, iri: (value: string) => string): string {
  switch (term.termType) {
    case "NamedNode":
      return `<${iri(term.value)}>`;
    case "Literal":
      return `${JSON.stringify(canonicalValue(term.value, term.datatype.value))}^^<${term.datatype.value}>@${term.language.toLowerCase()}`;
    default:
      return "_:";
  }
}

/** The statements, each a line, sorted, each said once, IRIs mapped by `iri`. */
function statementsOf(quads: Iterable<Quad>, iri: (value: string) => string): string[] {
  return [...new Set([...quads].map((quad) => `${termOf(quad.subject, iri)} ${termOf(quad.predicate, iri)} ${termOf(quad.object, iri)}`))].sort();
}

/** Whether `a` and `b` say the same, `b`'s IRIs read as `toA` maps them. */
export function sameStatements(a: Iterable<Quad>, b: Iterable<Quad>, toA: (iri: string) => string = (iri) => iri): boolean {
  return statementsOf(a, (iri) => iri).join("\n") === statementsOf(b, toA).join("\n");
}
