// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  createSolidDataset,
  type SolidDataset,
  type Thing,
  type ThingBuilder,
  type ThingPersisted,
  type WithChangeLog,
  type WithResourceInfo,
  type WithServerResourceInfo,
} from "@inrupt/solid-client";
import type { Quad } from "@rdfjs/types";
import { graphsOf } from "./linearDataset";

/**
 * The app's RDF data model: datasets of subjects, read and built with the
 * operations below. A thin layer over @inrupt/solid-client, the only
 * implementation so far, so that the rest of the package names no
 * library: a switch of libraries changes this module, not its callers.
 * The operations keep the names the library gives them.
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

/** A document's triples, as read from a pod or built to be written. */
export type Dataset = SolidDataset;

/** The triples of one subject of a dataset, by a URL or local to it. */
export type Subject = Thing;

/** A subject with a URL of its own. */
export type NamedSubject = ThingPersisted;

/** Adds a subject's triples one call at a time (buildThing). */
export type SubjectBuilder = ThingBuilder<ThingPersisted>;

/** A dataset that knows the document it came from (getSourceUrl). */
export type SourcedDataset = Dataset & WithResourceInfo;

/** A dataset as read from a pod, with what the server said of it. */
export type FetchedDataset = Dataset & WithServerResourceInfo;

/** What has changed in a dataset since it was read or built, to be written as a patch. */
export interface Changes {
  readonly additions: readonly Quad[];
  readonly deletions: readonly Quad[];
}

/**
 * The changes made to a dataset, as setThing and removeThing record
 * them; undefined for a dataset no change was ever made to.
 */
export function changesOf(dataset: Dataset): Changes | undefined {
  return (dataset as Partial<WithChangeLog>).internal_changeLog;
}

/** The document a dataset was read from, or saved to. */
export interface Source {
  /** The document's URL. */
  readonly url: string;
  /** The same object for the dataset and every edit of it, and for no other: a key to keep what is known of the read (an ETag). */
  readonly key: object;
}

/** Where a dataset came from; undefined for one built here and never saved. */
export function sourceOf(dataset: object): Source | undefined {
  const info = (dataset as Partial<WithServerResourceInfo>).internal_resourceInfo;
  return info === undefined ? undefined : { url: info.sourceIri, key: info };
}

/** A dataset of `quads` and nothing else, built in one pass (linearDataset.ts). */
export function datasetFromQuads(quads: Iterable<Quad>): Dataset {
  return Object.freeze({ ...createSolidDataset(), graphs: graphsOf(quads) });
}

/**
 * The dataset holding `quads` instead of what it held, from the same
 * document (sourceOf), with no changes: saved, it is written whole.
 */
export function withQuads<T extends Dataset>(dataset: T, quads: Iterable<Quad>): T {
  return Object.freeze({
    ...dataset,
    graphs: graphsOf(quads),
    internal_changeLog: { additions: [], deletions: [] },
  });
}

/** Whether a dataset says nothing of any subject. */
export function isEmptyDataset(dataset: Dataset): boolean {
  return Object.keys(dataset.graphs.default).length === 0;
}

/** A value of a subject's property, by its kind: what a WebID document shows. */
export type PropertyValue =
  | { type: "iri"; value: string }
  | { type: "literal"; value: string; dataType: string }
  | { type: "langString"; value: string; language: string }
  | { type: "blankNode"; value: string };

/** Every property of a subject with its values: IRIs first, then literals, language strings and blank nodes. */
export function propertiesOf(subject: Subject): { predicate: string; values: PropertyValue[] }[] {
  return Object.entries(subject.predicates).map(([predicate, objects]) => ({
    predicate,
    values: valuesOf(objects),
  }));
}

function valuesOf(objects: Subject["predicates"][string]): PropertyValue[] {
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

export {
  asUrl,
  buildThing,
  createSolidDataset,
  createThing,
  fromRdfJsDataset,
  getBoolean,
  getDatetime,
  getDecimal,
  getInteger,
  getLiteralAll,
  getPropertyAll,
  getStringByLocaleAll,
  getStringNoLocale,
  getStringNoLocaleAll,
  getTermAll,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  removeThing,
  removeUrl,
  setThing,
  toRdfJsDataset,
} from "@inrupt/solid-client";
