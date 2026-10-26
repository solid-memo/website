// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  asUrl as libraryAsUrl,
  buildThing as libraryBuildThing,
  createSolidDataset as libraryCreateSolidDataset,
  createThing as libraryCreateThing,
  fromRdfJsDataset as libraryFromRdfJsDataset,
  getBoolean as libraryGetBoolean,
  getDatetime as libraryGetDatetime,
  getDecimal as libraryGetDecimal,
  getInteger as libraryGetInteger,
  getLiteralAll as libraryGetLiteralAll,
  getPropertyAll as libraryGetPropertyAll,
  getStringByLocaleAll as libraryGetStringByLocaleAll,
  getStringNoLocale as libraryGetStringNoLocale,
  getStringNoLocaleAll as libraryGetStringNoLocaleAll,
  getTermAll as libraryGetTermAll,
  getThing as libraryGetThing,
  getThingAll as libraryGetThingAll,
  getUrl as libraryGetUrl,
  getUrlAll as libraryGetUrlAll,
  removeThing as libraryRemoveThing,
  removeUrl as libraryRemoveUrl,
  setThing as librarySetThing,
  type SolidDataset,
  type Thing,
  type ThingPersisted,
  toRdfJsDataset as libraryToRdfJsDataset,
  type WithChangeLog,
  type WithServerResourceInfo,
} from "@inrupt/solid-client";
import type { DatasetCore, Literal, Quad, Quad_Object } from "@rdfjs/types";
import { likeDataset, solidDataset, thing } from "./inrupt";
import type {
  Changes,
  Dataset,
  FetchedDataset,
  NamedSubject,
  PropertyValue,
  Source,
  Subject,
  SubjectBuilder,
} from "./interface";
import { graphsOf } from "./linearDataset";

/**
 * The app's RDF data model: datasets of subjects, read and built with the
 * operations below, of the types in interface.ts. A thin layer over
 * @inrupt/solid-client, the only implementation so far, so that the rest
 * of the package names no library: a switch of libraries changes this
 * module, not its callers. The operations keep the names the library
 * gives them; their types are the app's own, and every dataset and
 * subject they give is one the library made (inrupt.ts).
 *
 * What the app relies on of them, beyond their names, a second
 * implementation must do alike (rdf.test.ts holds each to the library):
 *
 * - getThingAll leaves out subjects that are blank nodes; getThing finds
 *   one by its `_:label`.
 * - getThing resolves the IRI of a subject made with createThing({ name })
 *   against the URL the dataset was read from: `#name` in that document.
 * - getDatetime reads any literal its unanchored pattern finds a date-time
 *   in, so it throws on some ("T2026-01-01T00:00:00Z") and gives an
 *   invalid date for one past what a JavaScript date holds; records.ts
 *   readDatetime makes both null.
 * - Language tags are lower case wherever a value is read with one
 *   (getStringByLocaleAll, getLiteralAll), however the document spells it.
 * - getDecimal reads a decimal as parseFloat does (`2.50` is 2.5, a value
 *   that is no number null); addDecimal writes a number as JavaScript
 *   spells it (`1`, not `1.0`).
 */

export type {
  Dataset,
  FetchedDataset,
  NamedSubject,
  SourcedDataset,
  Subject,
  SubjectBuilder,
} from "./interface";

/**
 * The changes made to a dataset, as setThing and removeThing record
 * them; undefined for a dataset no change was ever made to.
 */
export function changesOf(dataset: Dataset): Changes | undefined {
  return (dataset as Partial<WithChangeLog>).internal_changeLog;
}

/**
 * An empty dataset of the document at `url`, as a read of it as
 * `contentType` begins: sourceOf names the document, and subjects made
 * by name resolve against it. A parser is handed one to resolve the
 * text's relative IRIs against `url` (resources.ts parseQuads).
 */
export function datasetAt(url: string, contentType = "text/turtle"): FetchedDataset {
  const dataset: SolidDataset & WithServerResourceInfo = {
    ...libraryCreateSolidDataset(),
    internal_resourceInfo: { sourceIri: url, isRawData: false, contentType, linkedResources: {} },
  };
  return dataset as unknown as FetchedDataset;
}

/** Where a dataset came from; undefined for one built here and never saved. */
export function sourceOf(dataset: object): Source | undefined {
  const info = (dataset as Partial<WithServerResourceInfo>).internal_resourceInfo;
  return info === undefined ? undefined : { url: info.sourceIri, key: info };
}

/** A dataset of `quads` and nothing else, built in one pass (linearDataset.ts). */
export function datasetFromQuads(quads: Iterable<Quad>): Dataset {
  return Object.freeze({ ...libraryCreateSolidDataset(), graphs: graphsOf(quads) });
}

/**
 * The dataset holding `quads` instead of what it held, from the same
 * document (sourceOf), with no changes: saved, it is written whole.
 */
export function withQuads<T extends Dataset>(dataset: T, quads: Iterable<Quad>): T {
  return likeDataset(
    dataset,
    Object.freeze({
      ...solidDataset(dataset),
      graphs: graphsOf(quads),
      internal_changeLog: { additions: [], deletions: [] },
    }),
  );
}

/** Whether a dataset says nothing of any subject. */
export function isEmptyDataset(dataset: Dataset): boolean {
  return Object.keys(solidDataset(dataset).graphs.default).length === 0;
}

/** Every property of a subject with its values: IRIs first, then literals, language strings and blank nodes. */
export function propertiesOf(subject: Subject): { predicate: string; values: PropertyValue[] }[] {
  return Object.entries(thing(subject).predicates).map(([predicate, objects]) => ({
    predicate,
    values: valuesOf(objects),
  }));
}

function valuesOf(objects: Thing["predicates"][string]): PropertyValue[] {
  const values: PropertyValue[] = [];
  for (const iri of objects.namedNodes ?? []) {
    values.push({ type: "iri", value: iri });
  }
  for (const [dataType, literals] of Object.entries(objects.literals ?? {})) {
    for (const literal of literals) {
      values.push({ type: "literal", value: literal, dataType });
    }
  }
  for (const [language, strings] of Object.entries(objects.langStrings ?? {})) {
    for (const value of strings) {
      values.push({ type: "langString", value, language });
    }
  }
  for (const blankNode of objects.blankNodes ?? []) {
    values.push({
      type: "blankNode",
      value: typeof blankNode === "string" ? blankNode : "[blank node]",
    });
  }
  return values;
}

/** Where the library names a subject that has no URL yet: `<#name>` in the document it is saved to. */
const LOCAL_NODE = "https://inrupt.com/.well-known/sdk-local-node/";

/**
 * The name of a subject made with createThing({ name }) and not saved
 * yet, as a quad of a change names it (`#name` in the document it is
 * saved to); undefined for any other IRI.
 */
export function localNameOf(iri: string): string | undefined {
  return iri.startsWith(LOCAL_NODE) ? iri.slice(LOCAL_NODE.length) : undefined;
}

/** An empty dataset, of no document. */
export function createSolidDataset(): Dataset {
  return libraryCreateSolidDataset();
}

/** The dataset's subject at `url` (a `_:label` for a blank node); null when it says nothing of it. */
export function getThing(dataset: Dataset, url: string): NamedSubject | null {
  return libraryGetThing(solidDataset(dataset), url);
}

/** Every subject of a dataset that has an IRI, blank nodes left out. */
export function getThingAll(dataset: Dataset): NamedSubject[] {
  return libraryGetThingAll(solidDataset(dataset));
}

/** The dataset with `subject` in place of what it said of the same subject, the change recorded (changesOf). */
export function setThing<T extends Dataset>(dataset: T, subject: Subject): T {
  return likeDataset(dataset, librarySetThing(solidDataset(dataset), thing(subject)));
}

/** The dataset without what it said of `subject`, the change recorded (changesOf). */
export function removeThing<T extends Dataset>(dataset: T, subject: string | Subject): T {
  return likeDataset(
    dataset,
    libraryRemoveThing(
      solidDataset(dataset),
      typeof subject === "string" ? subject : thing(subject),
    ),
  );
}

/**
 * A subject that says nothing yet: at `url`, or by `name` in the
 * document it is saved to, or local to the dataset it is set in.
 */
export function createThing(options?: { url: string } | { name?: string }): NamedSubject {
  return libraryCreateThing(options);
}

/**
 * A builder of a subject's triples, starting from what `subject` says.
 * The library's builder takes its own subjects as values, which every
 * subject here is (inrupt.ts).
 */
export function buildThing(subject: Subject): SubjectBuilder {
  return libraryBuildThing(thing(subject) as ThingPersisted) as unknown as SubjectBuilder;
}

/** A subject's IRI; throws for one made by name and not saved yet, which has none. */
export function asUrl(subject: Subject): string {
  return libraryAsUrl(thing(subject) as ThingPersisted);
}

/** Every IRI the subject has for the property. */
export function getUrlAll(subject: Subject, property: string): string[] {
  return libraryGetUrlAll(thing(subject), property);
}

/** An IRI the subject has for the property; null when it has none. */
export function getUrl(subject: Subject, property: string): string | null {
  return libraryGetUrl(thing(subject), property);
}

/** The subject without the IRI `value` for the property. */
export function removeUrl(subject: Subject, property: string, value: string): NamedSubject {
  return libraryRemoveUrl(thing(subject), property, value);
}

/** A string without a language the subject has for the property; null when it has none. */
export function getStringNoLocale(subject: Subject, property: string): string | null {
  return libraryGetStringNoLocale(thing(subject), property);
}

/** Every string without a language the subject has for the property. */
export function getStringNoLocaleAll(subject: Subject, property: string): string[] {
  return libraryGetStringNoLocaleAll(thing(subject), property);
}

/** The subject's strings with a language for the property, by their language in lower case. */
export function getStringByLocaleAll(subject: Subject, property: string): Map<string, string[]> {
  return libraryGetStringByLocaleAll(thing(subject), property);
}

/** An integer the subject has for the property; null when it has none. */
export function getInteger(subject: Subject, property: string): number | null {
  return libraryGetInteger(thing(subject), property);
}

/** A decimal the subject has for the property, read as parseFloat does; null when it has none. */
export function getDecimal(subject: Subject, property: string): number | null {
  return libraryGetDecimal(thing(subject), property);
}

/** A boolean the subject has for the property; null when it has none. */
export function getBoolean(subject: Subject, property: string): boolean | null {
  return libraryGetBoolean(thing(subject), property);
}

/** A date-time the subject has for the property; null when it has none (see the list above). */
export function getDatetime(subject: Subject, property: string): Date | null {
  return libraryGetDatetime(thing(subject), property);
}

/** Every literal the subject has for the property, language tags in lower case. */
export function getLiteralAll(subject: Subject, property: string): Literal[] {
  return libraryGetLiteralAll(thing(subject), property);
}

/** Every value the subject has for the property, as RDF/JS terms. */
export function getTermAll(subject: Subject, property: string): Quad_Object[] {
  return libraryGetTermAll(thing(subject), property);
}

/** Every property the subject has a value for. */
export function getPropertyAll(subject: Subject): string[] {
  return libraryGetPropertyAll(thing(subject));
}

/** The dataset's triples, as an RDF/JS dataset. */
export function toRdfJsDataset(dataset: Dataset): DatasetCore {
  return libraryToRdfJsDataset(solidDataset(dataset));
}

/** A dataset of an RDF/JS dataset's triples. */
export function fromRdfJsDataset(dataset: DatasetCore): Dataset {
  return libraryFromRdfJsDataset(dataset);
}
