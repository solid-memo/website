// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DatasetCore, Quad, Term } from "@rdfjs/types";
import { validators } from "rdf-validate-datatype";
import SHACLValidator from "rdf-validate-shacl";
import environment from "rdf-validate-shacl/src/defaultEnv.js";
import type { Shape } from "rdf-validate-shacl/src/shapes-graph.js";
import ValidationEngine from "rdf-validate-shacl/src/validation-engine.js";
import { shown } from "@solid-memo/domain/langText";
import { PathMap, TextMap } from "@solid-memo/domain/pathKeys";
import {
  limitResults,
  MAX_RESULTS_PER_CHECK,
  moreSevere,
  type Violation,
} from "@solid-memo/domain/validation";

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

/**
 * A subject's key: an IRI as it is, a blank node with `_:` before its
 * label. A read holds every name a library keys a term by (its id, and
 * its N-Triples form, an IRI in `<>`) to 16,383 characters, which V8
 * hashes by more than their length, so this one is within it too; a
 * longer key, such as one with the term's type before it, would not be.
 */
const termKey = (term: Quad["subject"]) =>
  term.termType === "BlankNode" ? `_:${term.value}` : term.value;

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

/**
 * A term as a path (PathMap): its kind, its text, and a literal's
 * language, direction and datatype. The libraries the app reads with
 * give every literal a direction, "" for none; one a factory left out
 * is "undefined", the worst of which is a node counted apart twice.
 */
function termPath(term: Term): string[] {
  if (term.termType !== "Literal") return [term.termType, term.value];
  return [term.termType, term.value, term.language, String(term.direction), term.datatype.value];
}

/** How many times the library checks a node against one shape at most, as it does by default. */
const MAX_NODE_CHECKS = 50;

type EngineOptions = ConstructorParameters<typeof ValidationEngine>[1];
type Constraint = Parameters<ValidationEngine["createResultFromObject"]>[1];
type Severity = Violation["severity"];

/**
 * The library's engine, counting how many times it has checked a node
 * against a shape by a path of the two terms (PathMap). The library
 * counts them by one string, the JSON of both terms, which is longer
 * than a term may be (MAX_TERM_CHARACTERS in the solid package's
 * readLimits.ts) when the node is about as long as that: V8 hashes such
 * a string by its length alone, so many nodes of one length would make
 * a check take time growing with the square of their number. The
 * library's own count is turned off (maxNodeChecks 0), and this one
 * stops a check at the same number, MAX_NODE_CHECKS.
 *
 * It also makes at most MAX_RESULTS_PER_CHECK results of each severity
 * about one focus node in a check, so that limitResults, which keeps
 * the most severe first, never lacks a violation made after many
 * warnings. A constraint on each value gives a result for each, and one
 * such as sh:closed gives all of a node's at once, so a node with very
 * many values would have as many results made, each with its share of
 * the shapes copied in. Past the limit a result is left out before it
 * is made, and `dropped` keeps the most severe left out of each node,
 * by its value; a result no more severe than that is left out too, as
 * limitResults would leave it, and a constraint that could give none
 * more severe is not run for the node again. The library's own
 * limit (maxErrors) counts only some constraints' results and stops
 * the whole check, every node's, so it is not used.
 *
 * A result left out makes its constraint pass for that call. sh:or,
 * sh:xone and qualified shapes check their members on a clone, with
 * counts of its own, but sh:node runs on this engine, so a node reached
 * twice in one check could pass a shape it names. None of the shapes
 * the app checks against uses sh:node (conformance.test.ts in the solid
 * package says so); one that does needs the limit there first.
 */
class TermKeyedEngine extends ValidationEngine {
  // Set by initReport, which the library's constructor calls: a field
  // with an initializer would be set again after it.
  declare checks: PathMap<number>;
  declare results: PathMap<number>;
  declare dropped: TextMap<Severity>;
  readonly limit: number;

  constructor(context: SHACLValidator, options: EngineOptions, limit = MAX_NODE_CHECKS) {
    super(context, { ...options, maxNodeChecks: 0 });
    this.limit = limit;
  }

  override clone({ recordErrorsLevel }: EngineOptions = {}): ValidationEngine {
    return new TermKeyedEngine(this.context, { recordErrorsLevel }, this.limit);
  }

  override initReport(): void {
    super.initReport();
    this.checks = new PathMap();
    this.results = new PathMap();
    this.dropped = new TextMap();
  }

  override validateNodeAgainstShape(
    focusNode: Term,
    shape: Shape,
    dataGraph: Parameters<ValidationEngine["validateNodeAgainstShape"]>[2],
  ): boolean {
    if (!shape.deactivated) {
      const path = [...termPath(shape.shapeNode), ...termPath(focusNode)];
      const count = this.checks.get(path) ?? 0;
      if (count > this.limit) return false;
      this.checks.set(path, count + 1);
    }
    return super.validateNodeAgainstShape(focusNode, shape, dataGraph);
  }

  override validateValueNodeAgainstConstraint(
    focusNode: Term,
    valueNode: Term | null,
    constraint: Constraint,
  ): boolean {
    const dropped = this.dropped.get(focusNode.value);
    const severity = severityOf(constraint.shape.severity);
    // The node has results left out at least as severe as any this one could add.
    if (dropped !== undefined && moreSevere(dropped, severity) === dropped) return true;
    return super.validateValueNodeAgainstConstraint(focusNode, valueNode, constraint);
  }

  override createResultFromObject(
    validationResult: Parameters<ValidationEngine["createResultFromObject"]>[0],
    constraint: Constraint,
    focusNode: Term,
    valueNode: Term | null,
  ): ReturnType<ValidationEngine["createResultFromObject"]> {
    if (this.normalizeValidationResult(validationResult, valueNode) !== null) {
      const severity = severityOf(constraint.shape.severity);
      const path = [...termPath(focusNode), severity];
      const count = this.results.get(path) ?? 0;
      const dropped = this.dropped.get(focusNode.value);
      // Past the limit of its severity, or of a more severe one, whose results are kept first.
      if (
        count >= MAX_RESULTS_PER_CHECK ||
        (dropped !== undefined && moreSevere(dropped, severity) === dropped)
      ) {
        this.dropped.set(
          focusNode.value,
          dropped === undefined ? severity : moreSevere(dropped, severity),
        );
        // The library leaves out a result of null (its types say otherwise).
        return null as unknown as ReturnType<ValidationEngine["createResultFromObject"]>;
      }
      this.results.set(path, count + 1);
    }
    return super.createResultFromObject(validationResult, constraint, focusNode, valueNode);
  }
}

/** A result's severity by its sh:resultSeverity: sh:Violation unless sh:Warning or sh:Info. */
function severityOf(term: Term): Severity {
  if (term.value === `${SH}Warning`) return "warning";
  if (term.value === `${SH}Info`) return "info";
  return "violation";
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
    severity: severityOf(result.severity),
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
  validator.validationEngine = new TermKeyedEngine(validator, {});
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
  const engine = validator.validationEngine as TermKeyedEngine;
  return {
    validateNode: (data, focusNode, shapeIri) =>
      oneAtATime(async () => {
        const checked = checkedData(data);
        // validateNode keeps adding to one report; start each check afresh.
        engine.initReport();
        const report = await validator.validateNode(
          checked.data,
          namedNode(focusNode),
          namedNode(shapeIri),
        );
        const refused = checked.overTyped.has(focusNode) ? [overTypedViolation(focusNode)] : [];
        return limitResults(
          [...report.results.map(toViolation), ...refused].sort(byPathThenMessage),
          engine.dropped.get(focusNode),
        );
      }),
    validate: (data) =>
      oneAtATime(async () => {
        const checked = checkedData(data);
        engine.initReport();
        const report = await validator.validate(checked.data);
        return limitedByNode(
          [
            ...report.results.map(
              (result): FocusedViolation => ({
                focusNode: result.focusNode.value,
                ...toViolation(result),
              }),
            ),
            ...[...checked.overTyped].map(
              (node): FocusedViolation => ({ focusNode: node, ...overTypedViolation(node) }),
            ),
          ].sort((a, b) => a.focusNode.localeCompare(b.focusNode) || byPathThenMessage(a, b)),
          (node) => engine.dropped.get(node),
        );
      }),
  };
}

/**
 * Results sorted by node, each node's limited (limitResults) with the
 * severity of those of it the engine left out (`dropped`).
 */
function limitedByNode(
  results: readonly FocusedViolation[],
  dropped: (node: string) => Severity | undefined,
): FocusedViolation[] {
  const kept: FocusedViolation[] = [];
  let start = 0;
  while (start < results.length) {
    const node = results[start].focusNode;
    let end = start + 1;
    while (end < results.length && results[end].focusNode === node) end++;
    for (const result of limitResults(results.slice(start, end), dropped(node))) {
      kept.push({ ...result, focusNode: node });
    }
    start = end;
  }
  return kept;
}
