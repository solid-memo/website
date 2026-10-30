// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DatasetCore, Literal, Quad, Quad_Object } from "@rdfjs/types";
import { DataFactory, Store } from "n3";
import type {
  Changes,
  Dataset,
  FetchedDataset,
  LanguageString,
  NamedSubject,
  PropertyValue,
  Source,
  Subject,
  SubjectBuilder,
} from "@solid-memo/solid/client/interface";
import {
  allQuads,
  clientDataset,
  clientSubject,
  changesOfLog,
  datasetOf,
  grouped,
  isLangString,
  localIri,
  localName,
  NO_CHANGES,
  parseDatetime,
  partsOf,
  quadsOf,
  record,
  storedIri,
  subjectOf,
  type Value,
  withEdit,
  XSD,
  XSD_STRING,
} from "./dataset";

/**
 * The app's RDF data model (client/rdf.ts), without a Solid client
 * library: datasets and subjects of this client's own (dataset.ts),
 * over n3's RDF/JS terms. It exports what client/rdf.ts exports, under
 * the same names, and passes the same contract
 * (src/testing/contract/rdf.ts, run by rdf.test.ts): blank-node
 * subjects left out of getThingAll, subjects made by name resolved
 * against the document read, getDatetime's unanchored pattern, language
 * tags in lower case, decimals read as parseFloat reads them.
 */

export type {
  Dataset,
  FetchedDataset,
  LanguageString,
  NamedSubject,
  SourcedDataset,
  Subject,
  SubjectBuilder,
} from "@solid-memo/solid/client/interface";

const { literal, namedNode } = DataFactory;

const XSD_BOOLEAN = `${XSD}boolean`;
const XSD_DATETIME = `${XSD}dateTime`;
const XSD_DECIMAL = `${XSD}decimal`;
const XSD_INTEGER = `${XSD}integer`;

/** Throws for a text that is no URL, as an IRI given to these operations must be. */
function expectUrl(value: string, what: string): void {
  if (!URL.canParse(value))
    throw new Error(`Expected a valid URL ${what}, but received: [${value}].`);
}

/**
 * The changes made to a dataset, as setThing and removeThing record
 * them; undefined for a dataset no change was ever made to.
 */
export function changesOf(dataset: Dataset): Changes | undefined {
  const { log } = clientDataset(dataset);
  return log === undefined ? undefined : changesOfLog(log);
}

/**
 * An empty dataset of the document at `url`, as a read of it as
 * `contentType` begins: sourceOf names the document, and subjects made
 * by name resolve against it.
 */
export function datasetAt(url: string, contentType = "text/turtle"): FetchedDataset {
  const dataset = datasetOf({
    subjects: new Map(),
    named: [],
    resource: Object.freeze({ url, contentType }),
    log: undefined,
  });
  return dataset as unknown as FetchedDataset;
}

/** Where a dataset came from; undefined for one built here and never saved. */
export function sourceOf(dataset: object): Source | undefined {
  const { resource } = dataset as Partial<ReturnType<typeof clientDataset>>;
  return resource === undefined ? undefined : { url: resource.url, key: resource };
}

/** A dataset of `quads` and nothing else, built in one pass. */
export function datasetFromQuads(quads: Iterable<Quad>): Dataset {
  return datasetOf({ ...partsOf(quads), resource: undefined, log: undefined });
}

/**
 * The dataset holding `quads` instead of what it held, from the same
 * document (sourceOf), with no changes: saved, it is written whole.
 */
export function withQuads<T extends Dataset>(dataset: T, quads: Iterable<Quad>): T {
  const { resource } = clientDataset(dataset);
  return datasetOf({ ...partsOf(quads), resource, log: NO_CHANGES }) as unknown as T;
}

/** Whether a dataset says nothing of any subject. */
export function isEmptyDataset(dataset: Dataset): boolean {
  return clientDataset(dataset).subjects.size === 0;
}

/** Every property of a subject with its values: IRIs first, then literals, language strings and blank nodes. */
export function propertiesOf(subject: Subject): { predicate: string; values: PropertyValue[] }[] {
  return Object.entries(clientSubject(subject).values).map(([predicate, values]) => ({
    predicate,
    values: valuesOf(values),
  }));
}

function valuesOf(values: readonly Value[]): PropertyValue[] {
  const iris: PropertyValue[] = values
    .filter((value) => value.termType === "NamedNode")
    .map((value) => ({ type: "iri", value: value.value }));
  const literals: PropertyValue[] = [
    ...grouped(typedLiterals(values), (value) => value.datatype.value).values(),
  ]
    .flat()
    .map((value) => ({ type: "literal", value: value.value, dataType: value.datatype.value }));
  const strings: PropertyValue[] = [...stringsByLanguage(values).values()]
    .flat()
    .map((value) => ({ type: "langString", value: value.value, language: value.language }));
  const blankNodes: PropertyValue[] = values
    .filter((value) => value.termType === "BlankNode")
    .map((value) => ({ type: "blankNode", value: `_:${value.value}` }));
  return [...iris, ...literals, ...strings, ...blankNodes];
}

/**
 * The name of a subject made with createThing({ name }) and not saved
 * yet, as a quad of a change names it (`#name` in the document it is
 * saved to); undefined for any other IRI.
 */
export function localNameOf(iri: string): string | undefined {
  return localName(iri);
}

/** An empty dataset, of no document. */
export function createSolidDataset(): Dataset {
  return datasetOf({ subjects: new Map(), named: [], resource: undefined, log: undefined });
}

/** The dataset's subject at `url` (a `_:label` for a blank node); null when it says nothing of it. */
export function getThing(dataset: Dataset, url: string): NamedSubject | null {
  if (!url.startsWith("_:")) expectUrl(url, "to identify a Thing");
  const { subjects, resource } = clientDataset(dataset);
  return subjects.get(storedIri(url, resource)) ?? null;
}

/** Every subject of a dataset that has an IRI, blank nodes left out. */
export function getThingAll(dataset: Dataset): NamedSubject[] {
  return [...clientDataset(dataset).subjects.values()].filter(
    (subject) => !subject.url.startsWith("_:"),
  );
}

/** The dataset with `subject` in place of what it said of the same subject, the change recorded (changesOf). */
export function setThing<T extends Dataset>(dataset: T, subject: Subject): T {
  return setThings(dataset, [subject]);
}

/**
 * The dataset with each of `subjects` set in turn, as setThing sets one,
 * each change recorded: the subjects are copied once, not once a subject.
 */
export function setThings<T extends Dataset>(dataset: T, subjects: Iterable<Subject>): T {
  const data = clientDataset(dataset);
  const edited = new Map(data.subjects);
  let updated = data;
  for (const subject of subjects) {
    const given = clientSubject(subject);
    const iri = storedIri(given.url, data.resource);
    const stored = iri === given.url ? given : subjectOf(iri, given.values);
    const previous = edited.get(iri);
    edited.set(iri, stored);
    updated = withEdit(
      updated,
      edited,
      previous === undefined ? [] : quadsOf(previous, iri),
      quadsOf(stored, iri),
    );
  }
  return updated as unknown as T;
}

/** The dataset without what it said of `subject`, the change recorded (changesOf). */
export function removeThing<T extends Dataset>(dataset: T, subject: string | Subject): T {
  return removeThings(dataset, [subject]);
}

/**
 * The dataset without what it said of each of `subjects`, as removeThing
 * removes one, each change recorded: the subjects are copied once, not
 * once a subject.
 */
export function removeThings<T extends Dataset>(
  dataset: T,
  subjects: Iterable<string | Subject>,
): T {
  const data = clientDataset(dataset);
  const edited = new Map(data.subjects);
  let updated = data;
  for (const subject of subjects) {
    // A subject made by name is looked for by its name's IRI only when given as text, as the library does.
    const iri = typeof subject === "string" ? storedIri(subject, data.resource) : subject.url;
    const previous = edited.get(iri);
    edited.delete(iri);
    updated = withEdit(updated, edited, previous === undefined ? [] : quadsOf(previous, iri), []);
  }
  return updated as unknown as T;
}

/** A random name for a subject made with no name or URL. */
function generatedName(): string {
  return crypto.randomUUID();
}

/**
 * A subject that says nothing yet: at `url`, or by `name` in the
 * document it is saved to, or local to the dataset it is set in.
 */
export function createThing(options?: { url: string } | { name?: string }): NamedSubject {
  if (options !== undefined && "url" in options) {
    expectUrl(options.url, "to identify a Thing");
    return subjectOf(options.url, Object.freeze(record<readonly Value[]>()));
  }
  return subjectOf(
    localIri(options?.name ?? generatedName()),
    Object.freeze(record<readonly Value[]>()),
  );
}

/** The IRI a value given as a subject or as text stands for, as a value of a property. */
function iriValue(value: string | Subject): string {
  if (typeof value === "string") {
    expectUrl(value, "value");
    return value;
  }
  return value.url;
}

/** Builds a subject's values in place, and gives them frozen (build). */
class Builder implements SubjectBuilder {
  readonly #url: string;
  readonly #values: Record<string, Value[]>;

  constructor(subject: Subject) {
    this.#url = subject.url;
    this.#values = record();
    for (const [predicate, values] of Object.entries(clientSubject(subject).values)) {
      this.#values[predicate] = [...values];
    }
  }

  #add(property: string, value: Value): this {
    (this.#values[property] ??= []).push(value);
    return this;
  }

  #keep(property: string, keep: (value: Value) => boolean): this {
    this.#values[property] = (this.#values[property] ?? []).filter(keep);
    return this;
  }

  #literal(property: string, value: string, datatype: string): this {
    return this.#add(property, literal(value, namedNode(datatype)));
  }

  addIri(property: string, value: string | Subject): this {
    return this.#add(property, namedNode(iriValue(value)));
  }

  addUrl(property: string, value: string | Subject): this {
    return this.addIri(property, value);
  }

  addBoolean(property: string, value: boolean): this {
    return this.#literal(property, value ? "true" : "false", XSD_BOOLEAN);
  }

  addDatetime(property: string, value: Date): this {
    return this.#literal(property, value.toISOString(), XSD_DATETIME);
  }

  addDecimal(property: string, value: number): this {
    return this.#literal(property, String(value), XSD_DECIMAL);
  }

  addInteger(property: string, value: number): this {
    return this.#literal(property, String(value), XSD_INTEGER);
  }

  addLiteral(property: string, value: Literal): this {
    if (isLangString(value)) return this.addStringWithLocale(property, value.value, value.language);
    return this.#literal(property, value.value, value.datatype.value);
  }

  addStringNoLocale(property: string, value: string): this {
    return this.#literal(property, value, XSD_STRING);
  }

  addStringWithLocale(property: string, value: string, locale: string): this {
    return this.#add(property, literal(value, locale.toLowerCase()));
  }

  setIri(property: string, value: string | Subject): this {
    return this.removeAll(property).addIri(property, value);
  }

  setInteger(property: string, value: number): this {
    return this.removeAll(property).addInteger(property, value);
  }

  setStringNoLocale(property: string, value: string): this {
    return this.removeAll(property).addStringNoLocale(property, value);
  }

  removeAll(property: string): this {
    delete this.#values[property];
    return this;
  }

  removeLiteral(property: string, value: Literal): this {
    if (isLangString(value)) {
      const language = value.language.toLowerCase();
      return this.#keep(
        property,
        (one) =>
          !(
            one.termType === "Literal" &&
            isLangString(one) &&
            one.language === language &&
            one.value === value.value
          ),
      );
    }
    return this.#keep(
      property,
      (one) =>
        !(
          one.termType === "Literal" &&
          one.datatype.value === value.datatype.value &&
          one.value === value.value
        ),
    );
  }

  removeUrl(property: string, value: string | Subject): this {
    const iri = (typeof value === "string" ? iriValue(value) : asUrl(value)).toLowerCase();
    return this.#keep(
      property,
      (one) => one.termType !== "NamedNode" || one.value.toLowerCase() !== iri,
    );
  }

  setIriAll(property: string, values: readonly string[]): this {
    const iris = new Set(values.map(iriValue));
    this.#keep(property, (one) => one.termType !== "NamedNode");
    for (const iri of iris) this.#add(property, namedNode(iri));
    return this;
  }

  setStringAll(property: string, values: readonly LanguageString[]): this {
    const strings = new Map<string, Value>();
    for (const { value, language } of values) {
      const term =
        language === ""
          ? literal(value, namedNode(XSD_STRING))
          : literal(value, language.toLowerCase());
      strings.set(JSON.stringify([term.language, term.value]), term);
    }
    this.#keep(
      property,
      (one) =>
        !(one.termType === "Literal" && (isLangString(one) || one.datatype.value === XSD_STRING)),
    );
    for (const term of strings.values()) this.#add(property, term);
    return this;
  }

  build(): NamedSubject {
    const values = record<readonly Value[]>();
    for (const [predicate, list] of Object.entries(this.#values)) {
      values[predicate] = Object.freeze([...list]);
    }
    return subjectOf(this.#url, Object.freeze(values));
  }
}

/** A builder of a subject's triples, starting from what `subject` says. */
export function buildThing(subject: Subject): SubjectBuilder {
  return new Builder(subject);
}

/** A subject's IRI; throws for one made by name and not saved yet, which has none. */
export function asUrl(subject: Subject): string {
  if (localName(subject.url) !== undefined) {
    throw new Error(
      "The URL of a Thing that has not been persisted cannot be determined without a base URL.",
    );
  }
  return subject.url;
}

/** The values of a subject's property; none when it has none. */
function valuesAt(subject: Subject, property: string): readonly Value[] {
  return clientSubject(subject).values[property] ?? [];
}

/** An IRI as a value reads: `#name` for a subject made by name and not saved yet. */
function readIri(iri: string): string {
  const name = localName(iri);
  return name === undefined ? iri : `#${name}`;
}

/** The literals of a property that are no language strings. */
function typedLiterals(values: readonly Value[]): Literal[] {
  return values.filter(
    (value): value is Literal => value.termType === "Literal" && !isLangString(value),
  );
}

/** The language strings of a property, by their language. */
function stringsByLanguage(values: readonly Value[]): Map<string, Literal[]> {
  return grouped(
    values.filter((value): value is Literal => isLangString(value)),
    (value) => value.language,
  );
}

/** The lexical forms of a property's literals of `datatype`. */
function lexicalAll(subject: Subject, property: string, datatype: string): string[] {
  return typedLiterals(valuesAt(subject, property))
    .filter((value) => value.datatype.value === datatype)
    .map((value) => value.value);
}

/** The first of a property's literals of `datatype`, read with `read`; null when it has none. */
function firstOf<T>(
  subject: Subject,
  property: string,
  datatype: string,
  read: (text: string) => T | null,
): T | null {
  const text = typedLiterals(valuesAt(subject, property)).find(
    (value) => value.datatype.value === datatype,
  )?.value;
  return text === undefined ? null : read(text);
}

/** Every IRI the subject has for the property. */
export function getUrlAll(subject: Subject, property: string): string[] {
  return valuesAt(subject, property)
    .filter((value) => value.termType === "NamedNode")
    .map((value) => readIri(value.value));
}

/** An IRI the subject has for the property; null when it has none. */
export function getUrl(subject: Subject, property: string): string | null {
  return getUrlAll(subject, property)[0] ?? null;
}

/** The subject without the IRI `value` for the property. */
export function removeUrl(subject: Subject, property: string, value: string): NamedSubject {
  return buildThing(subject).removeUrl(property, value).build();
}

/** A string without a language the subject has for the property; null when it has none. */
export function getStringNoLocale(subject: Subject, property: string): string | null {
  return firstOf(subject, property, XSD_STRING, (text) => text);
}

/** Every string without a language the subject has for the property. */
export function getStringNoLocaleAll(subject: Subject, property: string): string[] {
  return lexicalAll(subject, property, XSD_STRING);
}

/** The subject's strings with a language for the property, by their language in lower case. */
export function getStringByLocaleAll(subject: Subject, property: string): Map<string, string[]> {
  return new Map(
    [...stringsByLanguage(valuesAt(subject, property))].map(([language, values]) => [
      language,
      values.map((value) => value.value),
    ]),
  );
}

/** A number read as `parse` reads it; null where that is no number. */
function numberOf(parse: (text: string) => number): (text: string) => number | null {
  return (text) => {
    const number = parse(text);
    return Number.isNaN(number) ? null : number;
  };
}

/** An integer the subject has for the property; null when it has none. */
export function getInteger(subject: Subject, property: string): number | null {
  return firstOf(
    subject,
    property,
    XSD_INTEGER,
    numberOf((text) => Number.parseInt(text, 10)),
  );
}

/** A decimal the subject has for the property, read as parseFloat does; null when it has none. */
export function getDecimal(subject: Subject, property: string): number | null {
  return firstOf(subject, property, XSD_DECIMAL, numberOf(Number.parseFloat));
}

/** A boolean the subject has for the property; null when it has none. */
export function getBoolean(subject: Subject, property: string): boolean | null {
  return firstOf(subject, property, XSD_BOOLEAN, (text) => {
    if (text === "true" || text === "1") return true;
    if (text === "false" || text === "0") return false;
    return null;
  });
}

/**
 * A date-time the subject has for the property; null when it has none.
 * As @inrupt/solid-client reads one: any literal its unanchored pattern
 * finds a date-time in, read from the literal's start, so it throws on
 * some ("T2026-01-01T00:00:00Z") and gives an invalid date for one past
 * what a JavaScript date holds; records.ts readDatetime makes both null.
 */
export function getDatetime(subject: Subject, property: string): Date | null {
  return firstOf(subject, property, XSD_DATETIME, parseDatetime);
}

/** Every literal the subject has for the property, language tags in lower case: language strings first. */
export function getLiteralAll(subject: Subject, property: string): Literal[] {
  const values = valuesAt(subject, property);
  return [
    ...[...stringsByLanguage(values).values()].flat(),
    ...[...grouped(typedLiterals(values), (value) => value.datatype.value).values()].flat(),
  ];
}

/** Every value the subject has for the property, as RDF/JS terms: IRIs, literals, then blank nodes. */
export function getTermAll(subject: Subject, property: string): Quad_Object[] {
  const values = valuesAt(subject, property);
  return [
    ...getUrlAll(subject, property).map((iri) => namedNode(iri)),
    ...getLiteralAll(subject, property),
    ...values.filter((value) => value.termType === "BlankNode"),
  ];
}

/** Every property the subject has a value for. */
export function getPropertyAll(subject: Subject): string[] {
  return Object.entries(clientSubject(subject).values)
    .filter(([, values]) => values.length > 0)
    .map(([predicate]) => predicate);
}

/** The dataset's triples, as an RDF/JS dataset. */
export function toRdfJsDataset(dataset: Dataset): DatasetCore {
  return new Store(allQuads(clientDataset(dataset)));
}

/** A dataset of an RDF/JS dataset's triples. */
export function fromRdfJsDataset(dataset: DatasetCore): Dataset {
  return datasetFromQuads(dataset);
}
