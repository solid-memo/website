// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { BlankNode, Literal, NamedNode, Quad, Quad_Subject } from "@rdfjs/types";
import { DataFactory } from "n3";
import type { Changes, Dataset, Subject } from "@solid-memo/solid/client/interface";

/**
 * This client's data model, behind the interface's Dataset and
 * Subject (interface.ts), for rdf.ts and resources.ts alone. Every
 * term is an RDF/JS term of n3's DataFactory, and every object is frozen:
 * an edit makes a new one, sharing what did not change.
 *
 * - A subject holds its values by property, in the order they were added.
 *   The order the app sees (getLiteralAll, the quads of a change) is made
 *   from that order when it is read, grouped as @inrupt/solid-client
 *   groups them, so that both clients give the same answers.
 * - A dataset holds the subjects of its default graph by IRI (`_:label`
 *   for a blank node), the quads of any named graph as they were read, the
 *   document it came from, and its edits as a chain of steps (setThing,
 *   removeThing), each pointing to the one before: changesOf replays them
 *   when it is asked, so an edit costs only what it changes.
 */

const { blankNode, literal, namedNode, quad: makeQuad, defaultGraph } = DataFactory;

export const XSD = "http://www.w3.org/2001/XMLSchema#";
export const XSD_STRING = `${XSD}string`;
const LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";

/** A value of a property: an IRI, a literal (its language tag in lower case) or a blank node. */
export type Value = NamedNode | Literal | BlankNode;

/** A subject's values, by property; a map with no prototype, so no key reaches Object.prototype. */
export type Values = Readonly<Record<string, readonly Value[]>>;

/** A subject of this client. */
export interface ClientSubject extends Subject {
  readonly values: Values;
}

/** The document a dataset was read from or saved to: the object itself is its Source key (sourceOf). */
export interface Resource {
  readonly url: string;
  readonly contentType: string | undefined;
}

/** One edit of a dataset: what it deleted, then what it added, after the edits before it. */
interface Step {
  readonly previous: Step | undefined;
  readonly deletions: readonly Quad[];
  readonly additions: readonly Quad[];
}

/** A dataset of this client. */
export interface ClientDataset extends Dataset {
  /** The default graph's subjects, by IRI or `_:label`, in the order they were first named. */
  readonly subjects: ReadonlyMap<string, ClientSubject>;
  /** The quads of named graphs, kept as read: no operation but toRdfJsDataset reads them. */
  readonly named: readonly Quad[];
  readonly resource: Resource | undefined;
  /** The last edit; undefined for a dataset no change was ever made to. */
  readonly log: Step | undefined;
}

/** This client's dataset behind one of the interface's. */
export function clientDataset(dataset: Dataset): ClientDataset {
  return dataset as ClientDataset;
}

/** This client's subject behind one of the interface's. */
export function clientSubject(subject: Subject): ClientSubject {
  return subject as ClientSubject;
}

/** An empty map with no prototype. */
export function record<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

export function subjectOf(url: string, values: Values): ClientSubject {
  return Object.freeze({ type: "Subject", url, values });
}

export function datasetOf(parts: Omit<ClientDataset, "type">): ClientDataset {
  return Object.freeze({ type: "Dataset", ...parts });
}

/** The log that starts a dataset written whole: there, but with no change. */
export const NO_CHANGES: Step = Object.freeze({
  previous: undefined,
  deletions: [],
  additions: [],
});

// Subjects made by name and not saved yet.

/** Where a subject made by name has its IRI until it is saved: `<#name>` in the document it is saved to. */
const LOCAL_NODE = "https://solid-memo.invalid/.well-known/local-node/";

export function localIri(name: string): string {
  return `${LOCAL_NODE}${name}`;
}

/** The name of a subject made by name, from its IRI; undefined for any other IRI. */
export function localName(iri: string): string | undefined {
  return iri.startsWith(LOCAL_NODE) ? iri.slice(LOCAL_NODE.length) : undefined;
}

/** `#name` in the document at `documentUrl`. */
function resolveLocal(name: string, documentUrl: string): string {
  const url = new URL(documentUrl);
  url.hash = name;
  return url.href;
}

/** A subject's IRI as stored in a dataset of `resource`: one made by name resolved against its document. */
export function storedIri(iri: string, resource: Resource | undefined): string {
  const name = localName(iri);
  return name === undefined || resource === undefined ? iri : resolveLocal(name, resource.url);
}

// Terms.

function subjectTerm(id: string): NamedNode | BlankNode {
  return id.startsWith("_:") ? blankNode(id.slice(2)) : namedNode(id);
}

function subjectId(term: Quad_Subject): string {
  return term.termType === "BlankNode" ? `_:${term.value}` : term.value;
}

/** A value with its language tag in lower case, as every value read is held. */
function lowerCased(value: Value): Value {
  if (value.termType !== "Literal" || value.language === value.language.toLowerCase()) {
    return value;
  }
  return literal(value.value, value.language.toLowerCase());
}

/** A value's key: two values are the same when their keys are. */
export function valueKey(value: Value): string {
  if (value.termType !== "Literal") return `${value.termType} ${value.value}`;
  return `Literal ${value.datatype.value} ${value.language} ${value.value}`;
}

function quadKey(quad: Quad): string {
  return `${quad.subject.termType} ${quad.subject.value} ${quad.predicate.value} ${valueKey(quad.object as Value)}`;
}

export function isLangString(value: Value): boolean {
  return value.termType === "Literal" && value.datatype.value === LANG_STRING;
}

/** Values grouped by a key, the groups in the order their first value came. */
export function grouped<T extends Value>(
  values: readonly T[],
  keyOf: (value: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [value]);
    else group.push(value);
  }
  return groups;
}

/**
 * A property's values in the order its quads are given: literals by
 * datatype, then language strings by language, then IRIs, then blank
 * nodes, each group in the order its first value came.
 */
function quadOrder(values: readonly Value[]): Value[] {
  const literals: Literal[] = [];
  const strings: Literal[] = [];
  const others: Value[] = [];
  for (const value of values) {
    if (value.termType !== "Literal") others.push(value);
    else if (value.datatype.value === LANG_STRING) strings.push(value);
    else literals.push(value);
  }
  return [
    ...[...grouped(literals, (one) => one.datatype.value).values()].flat(),
    ...[...grouped(strings, (one) => one.language).values()].flat(),
    ...others.filter((one) => one.termType === "NamedNode"),
    ...others.filter((one) => one.termType === "BlankNode"),
  ];
}

/** A subject's quads, under the IRI `id`. */
export function quadsOf(subject: ClientSubject, id = subject.url): Quad[] {
  const term = subjectTerm(id);
  const quads: Quad[] = [];
  for (const [predicate, values] of Object.entries(subject.values)) {
    const predicateTerm = namedNode(predicate);
    for (const value of quadOrder(values)) {
      quads.push(makeQuad(term, predicateTerm, value, defaultGraph()));
    }
  }
  return quads;
}

/** Every quad of a dataset: the default graph's, subject by subject, then the named graphs'. */
export function allQuads(dataset: ClientDataset): Quad[] {
  const quads: Quad[] = [];
  for (const [id, subject] of dataset.subjects) quads.push(...quadsOf(subject, id));
  quads.push(...dataset.named);
  return quads;
}

/**
 * The default graph's subjects and the named graphs' quads of `quads`,
 * built in one pass: each quad once, language tags in lower case.
 */
export function partsOf(quads: Iterable<Quad>): Pick<ClientDataset, "subjects" | "named"> {
  const building = new Map<string, Record<string, Value[]>>();
  const named: Quad[] = [];
  const seen = new Set<string>();
  for (const quad of quads) {
    if (quad.graph.termType !== "DefaultGraph") {
      named.push(quad);
      continue;
    }
    const { object } = quad;
    if (
      object.termType !== "NamedNode" &&
      object.termType !== "Literal" &&
      object.termType !== "BlankNode"
    ) {
      throw new Error(`Objects of type [${object.termType}] are not supported.`);
    }
    const value = lowerCased(object);
    const id = subjectId(quad.subject);
    const key = `${id} ${quad.predicate.value} ${valueKey(value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let values = building.get(id);
    if (values === undefined) {
      values = record();
      building.set(id, values);
    }
    (values[quad.predicate.value] ??= []).push(value);
  }
  const subjects = new Map<string, ClientSubject>();
  for (const [id, values] of building) {
    for (const list of Object.values(values)) Object.freeze(list);
    subjects.set(id, subjectOf(id, Object.freeze(values)));
  }
  return { subjects, named: Object.freeze(named) };
}

// The change log.

/**
 * The dataset with an edit recorded: `deletions`, then `additions`. Quads
 * with a blank node are left out of it, as the patch it becomes cannot
 * name them; an edit of nothing else is no step, so that a dataset edited
 * to no effect equals what it was.
 */
export function withEdit(
  dataset: ClientDataset,
  subjects: ReadonlyMap<string, ClientSubject>,
  deletions: readonly Quad[],
  additions: readonly Quad[],
): ClientDataset {
  const named = (quad: Quad) =>
    quad.subject.termType !== "BlankNode" && quad.object.termType !== "BlankNode";
  const step = { deletions: deletions.filter(named), additions: additions.filter(named) };
  const log =
    step.deletions.length === 0 && step.additions.length === 0
      ? (dataset.log ?? NO_CHANGES)
      : { previous: dataset.log, ...step };
  return datasetOf({ ...dataset, subjects, log });
}

const CHANGES = new WeakMap<Step, Changes>();

/**
 * What a dataset's edits come to: a quad added and then deleted (or
 * deleted and then added again) is no change. Replayed once per log.
 */
export function changesOfLog(log: Step): Changes {
  const known = CHANGES.get(log);
  if (known !== undefined) return known;
  const steps: Step[] = [];
  for (let step: Step | undefined = log; step !== undefined; step = step.previous) {
    steps.push(step);
  }
  const additions = new Map<string, Quad>();
  const deletions = new Map<string, Quad>();
  for (const step of steps.reverse()) {
    for (const quad of step.deletions) {
      const key = quadKey(quad);
      if (!additions.delete(key)) deletions.set(key, quad);
    }
    for (const quad of step.additions) {
      const key = quadKey(quad);
      if (!deletions.delete(key)) additions.set(key, quad);
    }
  }
  const changes: Changes = Object.freeze({
    additions: Object.freeze([...additions.values()]),
    deletions: Object.freeze([...deletions.values()]),
  });
  CHANGES.set(log, changes);
  return changes;
}

// Values of literals.

/** A date-time literal's value: see rdf.ts getDatetime. */
export function parseDatetime(text: string): Date | null {
  // Found anywhere in the text, as @inrupt/solid-client finds it; the text is then read from its start.
  // Its pattern, -?\d{4,}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|(\+|-)\d\d:\d\d)?, finds a
  // date-time where this one does, but takes time that grows with the square of a long run of digits.
  if (!/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(text)) return null;
  const [signedDate = "", rest = ""] = text.split("T");
  const negative = signedDate.startsWith("-");
  const [year, month, day] = (negative ? signedDate.slice(1) : signedDate).split("-");
  const [time, zone] = splitZone(rest);
  const [hours, minutes, secondsAndFraction] = time.split(":");
  if (secondsAndFraction === undefined) {
    throw new Error(`[${text}] does not start with a date-time.`);
  }
  const [seconds, fraction] = secondsAndFraction.split(".");
  const [zoneHours, zoneMinutes] = zone === undefined ? [0, 0] : zoneOffset(zone);
  // The offset is added, not taken away as XSD says, as @inrupt/solid-client
  // adds it: so a time read here is the time the current client reads.
  const fullYear = Number.parseInt(year!, 10) * (negative ? -1 : 1);
  const date = new Date(
    Date.UTC(
      fullYear,
      Number.parseInt(month!, 10) - 1,
      Number.parseInt(day!, 10),
      Number.parseInt(hours!, 10) + zoneHours,
      Number.parseInt(minutes!, 10) + zoneMinutes,
      Number.parseInt(seconds!, 10),
      fraction === undefined ? 0 : Number.parseInt(fraction, 10),
    ),
  );
  // Date.UTC reads the years 0 to 99 as 1900 to 1999.
  if (fullYear >= 0 && fullYear < 100) date.setUTCFullYear(date.getUTCFullYear() - 1900);
  return date;
}

function splitZone(time: string): [string, string | undefined] {
  if (time.endsWith("Z")) return [time.slice(0, -1), "Z"];
  const plus = time.split("+");
  const minus = time.split("-");
  if (plus.length === 1 && minus.length === 1) return [time, undefined];
  return plus.length > minus.length ? [plus[0]!, `+${plus[1]}`] : [minus[0]!, `-${minus[1]}`];
}

function zoneOffset(zone: string): [number, number] {
  if (zone === "Z") return [0, 0];
  const sign = zone.startsWith("+") ? 1 : -1;
  const [hours, minutes] = zone.slice(1).split(":");
  return [Number.parseInt(hours!, 10) * sign, Number.parseInt(minutes!, 10) * sign];
}
