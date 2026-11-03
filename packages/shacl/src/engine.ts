// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DatasetCore, Quad } from "@rdfjs/types";
import { validators } from "rdf-validate-datatype";
import SHACLValidator from "rdf-validate-shacl";
import environment from "rdf-validate-shacl/src/defaultEnv.js";
import { shown } from "@solid-memo/domain/langText";
import type { Violation } from "@solid-memo/domain/validation";

/**
 * The SHACL engine behind every validation Solid Memo does: one subject
 * checked against one node shape, or a whole graph checked against shapes
 * that pick their own targets (the vendored profiles, DCAT-AP and SKOS;
 * see docs/validation.md). This is the only module that imports
 * rdf-validate-shacl (see docs/boundaries.md); it is loaded lazily by the
 * app so the library ships in its own chunk.
 */

export type { Violation };

/** A result of a whole-graph check: a violation and the node it is about. */
export interface FocusedViolation extends Violation {
  focusNode: string;
}

export interface ShapeEngine {
  /** Every result of checking `focusNode` against `shapeIri`; empty when it conforms. */
  validateNode(data: DatasetCore, focusNode: string, shapeIri: string): Promise<Violation[]>;
  /** Every result of checking the whole of `data` against every targeted shape. */
  validate(data: DatasetCore): Promise<FocusedViolation[]>;
}

const SH = "http://www.w3.org/ns/shacl#";
const XSD = "http://www.w3.org/2001/XMLSchema#";

/** An xsd:decimal: digits with a dot anywhere, or none, and a sign. */
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
/** An xsd:float or xsd:double: a decimal with an exponent, or none; or INF or NaN. */
const FLOATING = /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[+-]?INF|NaN)$/;

// The library checks sh:datatype xsd:decimal, xsd:float and xsd:double
// with patterns in which a run of digits can be split two ways (`\d+\.?\d*`),
// so a literal that does not match takes time quadratic in its length,
// and the data checked may be data another app wrote to the pod or a
// release its publisher wrote. These patterns split a run of digits only
// one way, so a check takes time linear in a literal's length, and
// accept every value the library's do that XSD does (docs/validation.md).
validators.register(environment.namedNode(`${XSD}decimal`), (value) => DECIMAL.test(value));
for (const datatype of ["float", "double"]) {
  validators.register(environment.namedNode(`${XSD}${datatype}`), (value) => FLOATING.test(value));
}
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_SUB_CLASS_OF = "http://www.w3.org/2000/01/rdf-schema#subClassOf";

/**
 * The most rdf:type statements a node of the data checked may have: far
 * more than any Solid Memo or DCAT-AP document gives one. The library
 * goes through all of a node's types each time a constraint asks for its
 * class (sh:class), with no memory of having done so, and every subject
 * linking to the node asks again: many subjects linking to a node with
 * many types would make a check take time growing with the square of
 * the document. A node past this is read as having no types at all,
 * and has one result more, which says so.
 */
const MAX_TYPES_PER_NODE = 32;

/**
 * What a check sees of a document: the data to check, and the nodes of
 * it with too many types (each node's value), whose rdf:type
 * statements the data leaves out.
 */
interface Checked {
  data: DatasetCore;
  overTyped: ReadonlySet<string>;
}

/** Each document's checked form, and the document's size when it was made. */
const checks = new WeakMap<DatasetCore, { size: number; checked: Checked }>();

/**
 * The data a check sees: `data` without its rdfs:subClassOf statements,
 * nor the rdf:type statements of a node with more than
 * MAX_TYPES_PER_NODE of them. The library follows rdfs:subClassOf from
 * a class to its subclasses, for sh:class and sh:targetClass, with no
 * memory of the classes it has been to, so a cycle of them never ends
 * and a few layers of them take exponential time. The data is the
 * document checked, anyone's to write; the reference data checks run
 * beside it states none (docs/validation.md). So a node is an instance
 * of the classes its rdf:type names, and only those, and a node with
 * too many types of none: the rest of the document is checked as
 * usual, a subject asking for that node's class finding it of none.
 *
 * A caller checks the subjects of one document one by one, so the result
 * is kept with the document it was made of, and made again only when the
 * document's size changes: making it once a subject would make a check
 * as slow as the number of subjects times the number of statements.
 */
function checkedData(data: DatasetCore): Checked {
  const kept = checks.get(data);
  if (kept !== undefined && kept.size === data.size) return kept.checked;
  const checked = checkedOf(data);
  checks.set(data, { size: data.size, checked });
  return checked;
}

const termKey = (term: Quad["subject"]) => `${term.termType}:${term.value}`;

function checkedOf(data: DatasetCore): Checked {
  const type = environment.namedNode(RDF_TYPE);
  const counts = new Map<string, { value: string; count: number }>();
  for (const { subject } of data.match(null, type) as Iterable<Quad>) {
    const key = termKey(subject);
    const held = counts.get(key);
    if (held === undefined) counts.set(key, { value: subject.value, count: 1 });
    else held.count++;
  }
  const over = new Set<string>();
  for (const [key, { count }] of counts) if (count > MAX_TYPES_PER_NODE) over.add(key);
  const overTyped = new Set([...over].map((key) => (counts.get(key) as { value: string }).value));
  const subClassOf = environment.namedNode(RDFS_SUB_CLASS_OF);
  if (over.size === 0 && data.match(null, subClassOf).size === 0) return { data, overTyped };
  const kept = (q: Quad) =>
    !q.predicate.equals(subClassOf) && !(q.predicate.equals(type) && over.has(termKey(q.subject)));
  return { data: environment.dataset([...(data as Iterable<Quad>)].filter(kept)), overTyped };
}

/** The result on a node with too many types: its types are not read. */
function overTypedViolation(node: string): Violation {
  return {
    path: RDF_TYPE,
    message: {
      en: `The node <${node}> has more than ${MAX_TYPES_PER_NODE} rdf:type statements, more than Solid Memo checks, so it is checked as having none.`,
    },
    builtIn: true,
    value: node,
    severity: "violation",
    constraint: "MaxCount",
  };
}

/**
 * A dataset with every IRI (subjects, predicates, objects, graphs; not
 * literal datatypes) mapped: a document moved to another container.
 */
export function mapIris(data: DatasetCore, map: (iri: string) => string): DatasetCore {
  const term = <T extends Quad["subject"] | Quad["predicate"] | Quad["object"] | Quad["graph"]>(
    t: T,
  ): T => (t.termType === "NamedNode" ? environment.namedNode(map(t.value)) : t) as T;
  return environment.dataset(
    [...(data as Iterable<Quad>)].map((q) =>
      environment.quad(term(q.subject), term(q.predicate), term(q.object), term(q.graph)),
    ),
  );
}

/**
 * One dataset of the quads of several: a document with the reference
 * data a profile check needs beside it, or a profile's shape files.
 */
export function mergeDatasets(...parts: Iterable<Quad>[]): DatasetCore {
  return environment.dataset(parts.flatMap((part) => [...part]));
}

function localName(iri: string): string {
  return iri.slice(iri.lastIndexOf("#") + 1);
}

type ValidationResult = Awaited<ReturnType<SHACLValidator["validate"]>>["results"][number];

function toViolation(result: ValidationResult): Violation {
  const constraint = localName(result.sourceConstraintComponent.value).replace(
    /ConstraintComponent$/,
    "",
  );
  const path = result.path?.value;
  const value = result.value?.value;
  return {
    ...(path === undefined ? {} : { path }),
    ...messageOf(result, constraint),
    ...(value === undefined ? {} : { value }),
    severity:
      result.severity.value === `${SH}Warning`
        ? "warning"
        : result.severity.value === `${SH}Info`
          ? "info"
          : "violation",
    constraint,
  };
}

/**
 * A result's message by language, English first: the shape's sh:message
 * in each language it gives (tagged literals); else the validator's own
 * English, untagged, or a word on the constraint when it has none either.
 */
function messageOf(
  result: ValidationResult,
  constraint: string,
): Pick<Violation, "message" | "builtIn"> {
  const tagged = result.message.filter(
    (term) => term.termType === "Literal" && term.language !== "",
  );
  if (tagged.length > 0) {
    const tags = tagged.map((term) => (term as { language: string }).language.toLowerCase());
    const ordered = [...new Set(tags)].sort(
      (a, b) => Number(b === "en") - Number(a === "en") || a.localeCompare(b),
    );
    return {
      message: Object.fromEntries(ordered.map((tag) => [tag, tagged[tags.indexOf(tag)].value])),
    };
  }
  const builtIn = result.message.map((term) => term.value).join(" ");
  return {
    message: { en: builtIn === "" ? `${constraint} constraint failed.` : builtIn },
    builtIn: true,
  };
}

function byPathThenMessage(a: Violation, b: Violation): number {
  return (
    (a.path ?? "").localeCompare(b.path ?? "") || shown(a.message).localeCompare(shown(b.message))
  );
}

export function createEngine(shapes: DatasetCore): ShapeEngine {
  const validator = new SHACLValidator(shapes);
  const { namedNode } = validator.factory;
  // The validator keeps one report and one data graph, and a check yields
  // (to load owl:imports) before it runs: two checks at once would share
  // the report, the later one returning the earlier one's results as its
  // own. So an engine runs one check at a time, in the order asked.
  let queue: Promise<unknown> = Promise.resolve();
  function oneAtATime<T>(check: () => Promise<T>): Promise<T> {
    const next = queue.then(check);
    queue = next.catch(() => undefined);
    return next;
  }
  return {
    validateNode: (data, focusNode, shapeIri) =>
      oneAtATime(async () => {
        const checked = checkedData(data);
        // validateNode keeps adding to one report; start each check afresh.
        validator.validationEngine.initReport();
        const report = await validator.validateNode(
          checked.data,
          namedNode(focusNode),
          namedNode(shapeIri),
        );
        const refused = checked.overTyped.has(focusNode) ? [overTypedViolation(focusNode)] : [];
        return [...report.results.map(toViolation), ...refused].sort(byPathThenMessage);
      }),
    validate: (data) =>
      oneAtATime(async () => {
        const checked = checkedData(data);
        validator.validationEngine.initReport();
        const report = await validator.validate(checked.data);
        return [
          ...report.results.map(
            (result): FocusedViolation => ({
              focusNode: result.focusNode.value,
              ...toViolation(result),
            }),
          ),
          ...[...checked.overTyped].map(
            (node): FocusedViolation => ({ focusNode: node, ...overTypedViolation(node) }),
          ),
        ].sort((a, b) => a.focusNode.localeCompare(b.focusNode) || byPathThenMessage(a, b));
      }),
  };
}
