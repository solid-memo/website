// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * What a Solid client gives for rdf: declarations alone, with no
 * body, which solid and the app are typechecked against. An import of
 * this module resolves to the module of the same name in the client
 * SOLID_CLIENT names (scripts/solidClient.ts): inrupt-client, the
 * default, or solid-memo-client. Both pass the contract in
 * packages/solid/src/testing/contract/rdf.ts, and are checked to
 * give every declaration here with its type (clientTypes.test.ts in
 * each). Where a description names "the library", it is the one the
 * default client is built on, whose behavior the app relies on.
 */

import type { DatasetCore, Literal, Quad, Quad_Object } from "@rdfjs/types";
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
/**
 * The app's RDF data model: datasets of subjects, read and built with the
 * operations below, of the types in interface.ts. The operations keep
 * the names @inrupt/solid-client gives them; their types are the app's
 * own.
 *
 * What the app relies on of them, beyond their names, a second
 * implementation must do alike (the contract in
 * packages/solid/src/testing/contract/rdf.ts):
 *
 * - getThingAll leaves out subjects that are blank nodes; getThing finds
 *   one by its `_:label`.
 * - getThing resolves the IRI of a subject made with createThing({ name })
 *   against the URL the dataset was read from: `#name` in that document.
 * - A read leaves out a quad that names an IRI of the kind such a subject
 *   has, which asUrl throws on: no document can state one, so no subject,
 *   value or property read from a pod has one, and a subject made by name
 *   is the only one that does.
 * - getDatetime reads any literal its unanchored pattern finds a date-time
 *   in, so it throws on some ("T2026-01-01T00:00:00Z") and gives an
 *   invalid date for one past what a JavaScript date holds; records.ts
 *   readDatetime makes both null. That pattern takes time that grows
 *   with the square of a long literal's length, so readDatetime passes
 *   it only a short literal that is wholly a date-time.
 * - Language tags are lower case wherever a value is read with one
 *   (eachStringByLocale, getLiteralAll), however the document spells it.
 * - getDecimal reads a decimal as parseFloat does (`2.50` is 2.5, a value
 *   that is no number null).
 * - A literal with a base direction (RDF 1.2, `"…"@ar--rtl`) is kept with
 *   its language and direction, and written back as it was read. It is
 *   no language text: eachStringByLocale and setStringAll leave it be,
 *   and propertiesOf gives it as a literal of its datatype
 *   (rdf:dirLangString); getLiteralAll and getTermAll give it whole.
 */
export type {
  Dataset,
  FetchedDataset,
  LanguageString,
  NamedSubject,
  SourcedDataset,
  Subject,
  SubjectBuilder,
} from "./interface";
/**
 * The changes made to a dataset, as setThings and removeThings record
 * them; undefined for a dataset no change was ever made to.
 */
export declare function changesOf(dataset: Dataset): Changes | undefined;
/**
 * An empty dataset of the document at `url`, as a read of it as
 * `contentType` begins: sourceOf names the document, and subjects made
 * by name resolve against it. A parser is handed one to resolve the
 * text's relative IRIs against `url` (resources.ts parseQuads).
 */
export declare function datasetAt(url: string, contentType?: string): FetchedDataset;
/** Where a dataset came from; undefined for one built here and never saved. */
export declare function sourceOf(dataset: object): Source | undefined;
/** A dataset of `quads` and nothing else, built in one pass (linearDataset.ts). */
export declare function datasetFromQuads(quads: Iterable<Quad>): Dataset;
/**
 * The dataset holding `quads` instead of what it held, from the same
 * document (sourceOf), with no changes: saved, it is written whole.
 */
export declare function withQuads<T extends Dataset>(dataset: T, quads: Iterable<Quad>): T;
/** Whether a dataset says nothing of any subject. */
export declare function isEmptyDataset(dataset: Dataset): boolean;
/** Every property of a subject with its values: IRIs first, then literals, language strings and blank nodes. */
export declare function propertiesOf(subject: Subject): {
  predicate: string;
  values: PropertyValue[];
}[];
/**
 * The name of a subject made with createThing({ name }) and not saved
 * yet, as a quad of a change names it (`#name` in the document it is
 * saved to); undefined for any other IRI.
 */
export declare function localNameOf(iri: string): string | undefined;
/** An empty dataset, of no document. */
export declare function createSolidDataset(): Dataset;
/**
 * The dataset's subject at `url` (a `_:label` for a blank node); null
 * when it says nothing of it, as for an IRI that is no URL, which the
 * library throws on: such an IRI can be named in data read from a pod,
 * and no subject the app reads is at one.
 */
export declare function getThing(dataset: Dataset, url: string): NamedSubject | null;
/** Every subject of a dataset that has an IRI, blank nodes left out. */
export declare function getThingAll(dataset: Dataset): NamedSubject[];
/**
 * The dataset with `subject` in place of what it said of the same
 * subject, the change recorded (changesOf): as the library's setThing,
 * in time that grows with the subject's values, not their square
 * (setThings).
 */
export declare function setThing<T extends Dataset>(dataset: T, subject: Subject): T;
/**
 * The dataset with each of `subjects` set in turn, as setThing sets one,
 * each change recorded (changesOf). The library's setThing copies the
 * whole dataset and searches its changes so far at each subject and at
 * each of its triples, so a subject at a time takes time in the square
 * of the subjects, and of one subject's values; here the dataset is
 * copied once and the changes are kept by their quads' keys.
 */
export declare function setThings<T extends Dataset>(dataset: T, subjects: Iterable<Subject>): T;
/**
 * The dataset without what it said of each of `subjects`, each change
 * recorded (changesOf), as the library's removeThing removes one: in
 * time that grows with the subjects and the dataset, not their product
 * (setThings).
 */
export declare function removeThings<T extends Dataset>(
  dataset: T,
  subjects: Iterable<string | Subject>,
): T;
/**
 * A subject that says nothing yet: at `url`, or by `name` in the
 * document it is saved to, or local to the dataset it is set in.
 */
export declare function createThing(
  options?:
    | {
        url: string;
      }
    | {
        name?: string;
      },
): NamedSubject;
/**
 * A builder of a subject's triples, starting from what `subject` says.
 * Each call is the library's own (its buildThing makes the same calls),
 * but setIriAll, setStringAll, removeLiteralAll and addAll, which it has
 * none of: there the property's values, and for addAll the subject's
 * properties, are made once, where the library's adds copy them at
 * every value. The library takes its own subjects as values.
 */
export declare function buildThing(subject: Subject): SubjectBuilder;
/** A subject's IRI; throws for one made by name and not saved yet, which has none. */
export declare function asUrl(subject: Subject): string;
/** Every IRI the subject has for the property. */
export declare function getUrlAll(subject: Subject, property: string): string[];
/**
 * The subject's IRIs for the property one at a time, in the order
 * getUrlAll gives them, each made only when it is asked for: a reader
 * that takes a few of many builds no list of them all (records.ts).
 */
export declare function eachUrl(subject: Subject, property: string): Generator<string>;
/** The subject's strings without a language for the property one at a time, in stored order (eachUrl). */
export declare function eachStringNoLocale(subject: Subject, property: string): Generator<string>;
/**
 * The subject's strings with a language for the property one at a time,
 * each with its language in lower case, however the document spells
 * it: the strings of one language in their order, none with a base
 * direction, which is no language text (isDirectional, eachUrl).
 */
export declare function eachStringByLocale(
  subject: Subject,
  property: string,
): Generator<[language: string, value: string]>;
/** An IRI the subject has for the property; null when it has none. */
export declare function getUrl(subject: Subject, property: string): string | null;
/** The subject without the IRI `value` for the property. */
export declare function removeUrl(subject: Subject, property: string, value: string): NamedSubject;
/** A string without a language the subject has for the property; null when it has none. */
export declare function getStringNoLocale(subject: Subject, property: string): string | null;
/** An integer the subject has for the property; null when it has none. */
export declare function getInteger(subject: Subject, property: string): number | null;
/** A decimal the subject has for the property, read as parseFloat does; null when it has none. */
export declare function getDecimal(subject: Subject, property: string): number | null;
/** A boolean the subject has for the property; null when it has none. */
export declare function getBoolean(subject: Subject, property: string): boolean | null;
/** A date-time the subject has for the property; null when it has none (see the list above). */
export declare function getDatetime(subject: Subject, property: string): Date | null;
/**
 * Every literal the subject has for the property, language tags in
 * lower case, as the library gives them, in one pass (literalsOf).
 */
export declare function getLiteralAll(subject: Subject, property: string): Literal[];
/**
 * Every value the subject has for the property, as RDF/JS terms: IRIs,
 * then literals, then blank nodes, as the library gives them, in one
 * pass (literalsOf).
 */
export declare function getTermAll(subject: Subject, property: string): Quad_Object[];
/** Every property the subject has a value for. */
export declare function getPropertyAll(subject: Subject): string[];
/** The dataset's triples, as an RDF/JS dataset. */
export declare function toRdfJsDataset(dataset: Dataset): DatasetCore;
/**
 * A dataset of an RDF/JS dataset's triples, built in one pass as a read
 * builds one (datasetFromQuads), a literal with a base direction kept
 * whole.
 */
export declare function fromRdfJsDataset(dataset: DatasetCore): Dataset;
