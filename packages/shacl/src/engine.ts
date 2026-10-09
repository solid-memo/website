import type { DatasetCore, Quad } from "@rdfjs/types";
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
  validateNode(
    data: DatasetCore,
    focusNode: string,
    shapeIri: string,
  ): Promise<Violation[]>;
  /** Every result of checking the whole of `data` against every targeted shape. */
  validate(data: DatasetCore): Promise<FocusedViolation[]>;
}

const SH = "http://www.w3.org/ns/shacl#";

/**
 * A dataset with every IRI (subjects, predicates, objects, graphs; not
 * literal datatypes) mapped: a document moved to another container.
 */
export function mapIris(data: DatasetCore, map: (iri: string) => string): DatasetCore {
  const term = <T extends Quad["subject"] | Quad["predicate"] | Quad["object"] | Quad["graph"]>(t: T): T =>
    (t.termType === "NamedNode" ? environment.namedNode(map(t.value)) : t) as T;
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

type ValidationResult = Awaited<
  ReturnType<SHACLValidator["validate"]>
>["results"][number];

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
function messageOf(result: ValidationResult, constraint: string): Pick<Violation, "message" | "builtIn"> {
  const tagged = result.message.filter((term) => term.termType === "Literal" && term.language !== "");
  if (tagged.length > 0) {
    const tags = tagged.map((term) => (term as { language: string }).language.toLowerCase());
    const ordered = [...new Set(tags)].sort((a, b) => Number(b === "en") - Number(a === "en") || a.localeCompare(b));
    return { message: Object.fromEntries(ordered.map((tag) => [tag, tagged[tags.indexOf(tag)].value])) };
  }
  const builtIn = result.message.map((term) => term.value).join(" ");
  return { message: { en: builtIn === "" ? `${constraint} constraint failed.` : builtIn }, builtIn: true };
}

function byPathThenMessage(a: Violation, b: Violation): number {
  return (a.path ?? "").localeCompare(b.path ?? "") || shown(a.message).localeCompare(shown(b.message));
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
        // validateNode keeps adding to one report; start each check afresh.
        validator.validationEngine.initReport();
        const report = await validator.validateNode(
          data,
          namedNode(focusNode),
          namedNode(shapeIri),
        );
        return report.results.map(toViolation).sort(byPathThenMessage);
      }),
    validate: (data) =>
      oneAtATime(async () => {
        validator.validationEngine.initReport();
        const report = await validator.validate(data);
        return report.results
          .map((result): FocusedViolation => ({
            focusNode: result.focusNode.value,
            ...toViolation(result),
          }))
          .sort(
            (a, b) => a.focusNode.localeCompare(b.focusNode) || byPathThenMessage(a, b),
          );
      }),
  };
}
