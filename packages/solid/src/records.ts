// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  type NamedSubject,
  type Subject,
  type LanguageString,
  type SubjectBuilder,
  buildThing,
  createThing,
  getBoolean,
  getDatetime,
  getDecimal,
  getInteger,
  getLiteralAll,
  getStringByLocaleAll,
  getStringNoLocale,
  getStringNoLocaleAll,
  getThing,
  getUrl,
  getUrlAll,
  removeThings,
} from "./client/rdf";
import type { DatasetEdit } from "./datasetEdit";
import type { Literal, Term } from "@rdfjs/types";
import {
  LATEST_VERSION,
  type LangText,
  type LangTexts,
  type ShapeName,
  type VersionedRecord,
} from "@solid-memo/vocab/types.generated";
import type { FieldDescriptor, ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { SHAPES } from "@solid-memo/vocab/descriptors.generated";
import { RDF, SM } from "./vocab";
import { AppError } from "@solid-memo/domain/appError";

/**
 * The generic half of every mapper: a subject read into the record its
 * shape describes, and a record written onto a subject. Which predicates,
 * of which kind and how many, comes from the shape's descriptor, so a
 * mapper can only read and write what the shape says (see docs/shapes.md).
 */

type FieldValue = string | number | boolean | readonly string[] | LangText | LangTexts;

/** One field's value; undefined when absent, null when a required one is. */
function readField(thing: Subject, field: FieldDescriptor): FieldValue | null | undefined {
  if (field.cardinality === "many") {
    switch (field.kind) {
      case "iri":
        return getUrlAll(thing, field.predicate);
      case "iriEnum":
        return getUrlAll(thing, field.predicate).filter((v) => field.values!.includes(v));
      case "text":
      case "anyText":
        return readTexts(thing, field.predicate, field.kind === "anyText");
      default:
        return getStringNoLocaleAll(thing, field.predicate);
    }
  }
  const value = readScalar(thing, field);
  if (value === null) return field.cardinality === "one" ? null : undefined;
  return value;
}

function readScalar(
  thing: Subject,
  field: FieldDescriptor,
): string | number | boolean | LangText | null {
  switch (field.kind) {
    case "text":
      return readText(thing, field.predicate);
    case "anyText":
      return readAnyText(thing, field.predicate);
    case "string":
      return getStringNoLocale(thing, field.predicate);
    case "enum": {
      const value = getStringNoLocale(thing, field.predicate);
      return value !== null && field.values!.includes(value) ? value : null;
    }
    case "integer":
      return getInteger(thing, field.predicate);
    case "decimal":
      return getDecimal(thing, field.predicate);
    case "boolean":
      return getBoolean(thing, field.predicate);
    case "dateTime":
      return readDatetime(thing, field.predicate)?.toISOString() ?? null;
    case "iri":
      return getUrl(thing, field.predicate);
    case "iriEnum": {
      const value = getUrl(thing, field.predicate);
      return value !== null && field.values!.includes(value) ? value : null;
    }
  }
}

const XSD_DATETIME = "http://www.w3.org/2001/XMLSchema#dateTime";

/**
 * The longest date-time lexical form read, and the form itself, matched
 * from start to end: an xsd:dateTime, or a year with a sign as
 * toISOString writes one past 9999. The library's own pattern is
 * unanchored and takes time that grows with the square of a long
 * literal's length, so a literal goes to it only once it has this form.
 */
const DATETIME_LENGTH = 64;
const DATETIME_FORM = /^[+-]?\d{4,}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)?$/;

/**
 * A date-time value; null when there is none, or when the library
 * cannot make a date of it: one past what a JavaScript date holds
 * (after 13 September 275760, or before 20 April -271821), which it
 * reads as an invalid date rather than none, or a literal that is
 * longer than DATETIME_LENGTH or not of DATETIME_FORM, such as
 * "T2026-01-01T00:00:00Z", which the library would throw on.
 */
export function readDatetime(thing: Subject, predicate: string): Date | null {
  // The literal getDatetime reads: the first of its datatype.
  const literal = getLiteralAll(thing, predicate).find(
    (one) => one.datatype.value === XSD_DATETIME,
  );
  if (
    literal === undefined ||
    literal.value.length > DATETIME_LENGTH ||
    !DATETIME_FORM.test(literal.value)
  ) {
    return null;
  }
  const date = getDatetime(thing, predicate)!;
  return Number.isNaN(date.getTime()) ? null : date;
}

const PROBE = "https://solid-memo.com/probe";

/** An xsd:dateTime literal of this lexical form, as a subject holds it. */
export function datetimeLiteral(value: string): Literal {
  return {
    termType: "Literal",
    value,
    language: "",
    datatype: { termType: "NamedNode", value: XSD_DATETIME },
  } as Literal;
}

/**
 * Whether a term is an xsd:dateTime that readDatetime does not read as
 * a date: what the instance and release checks name (DateTimeRange),
 * and what a repair of an optional one drops.
 */
export function isUnreadableDatetime(term: Term): boolean {
  if (term.termType !== "Literal" || term.datatype.value !== XSD_DATETIME) return false;
  const probe = buildThing(createThing()).addLiteral(PROBE, datetimeLiteral(term.value)).build();
  return readDatetime(probe, PROBE) === null;
}

/** A subject's values of a predicate that isUnreadableDatetime, in stored order. */
export function unreadableDatetimes(thing: Subject, predicate: string): string[] {
  return getLiteralAll(thing, predicate)
    .filter(isUnreadableDatetime)
    .map((literal) => literal.value);
}

/**
 * A text's language-tagged values, by lower-case language tag (the first
 * value of each language: the shapes allow one); null when there are none.
 * Untagged literals are not part of a text.
 */
export function readText(thing: Subject, predicate: string): LangText | null {
  const text: LangText = Object.fromEntries(
    [...getStringByLocaleAll(thing, predicate)].map(([language, values]) => [
      language.toLowerCase(),
      values[0],
    ]),
  );
  return Object.keys(text).length > 0 ? text : null;
}

/** A text that may also be untagged: the untagged literal under the empty tag. */
function readAnyText(thing: Subject, predicate: string): LangText | null {
  const untagged = getStringNoLocale(thing, predicate);
  const text = readText(thing, predicate) ?? {};
  return untagged === null
    ? Object.keys(text).length > 0
      ? text
      : null
    : { "": untagged, ...text };
}

/**
 * Texts with several values per language (a deck's keywords): every
 * language-tagged value, by lower-case language tag (tags that differ
 * only in case are one language), each once, in stored order; for a
 * field that may also be untagged, the untagged values under the empty
 * tag. Empty ({}) when there are none.
 */
function readTexts(thing: Subject, predicate: string, untagged: boolean): LangTexts {
  // The client reads each tag in lower case (client/rdf.ts), so a tag comes up once.
  const texts = new Map<string, string[]>();
  if (untagged) {
    const values = getStringNoLocaleAll(thing, predicate);
    if (values.length > 0) texts.set("", [...new Set(values)]);
  }
  for (const [language, values] of getStringByLocaleAll(thing, predicate)) {
    texts.set(language, [...new Set(values)]);
  }
  return Object.fromEntries(texts);
}

/**
 * The subject as a record of the shape; null when a required field is
 * missing (or an enum holds a value the shape does not list).
 */
export function readRecord<T>(thing: Subject, descriptor: ShapeDescriptor<T>): T | null {
  const record: Record<string, FieldValue> = {};
  for (const field of descriptor.fields) {
    const value = readField(thing, field);
    if (value === null) return null;
    if (value !== undefined) record[field.name] = value;
  }
  return record as T;
}

/** What a subject says about its format: absent means 1. */
export function storedVersionOf(thing: Subject): number {
  return getInteger(thing, SM.formatVersion) ?? 1;
}

/** Whether the subject has every value the shape fixes (an FSRS-6 state's scheduler). */
function hasFixedValues(thing: Subject, descriptor: ShapeDescriptor): boolean {
  return descriptor.fixedValues.every((fixed) =>
    getUrlAll(thing, fixed.predicate).includes(fixed.value),
  );
}

/**
 * A subject of the given kind, read with the shape of its stored version
 * — or, for a version newer than this app knows, with the latest shape
 * it has, the stored version passing through. Null when the subject's
 * version is below 1, which no shape has, as no shape checks it; when
 * it is not of the kind's class, lacks a value the kind's shape fixes,
 * or does not fit its shape.
 */
export function readVersioned<S extends ShapeName>(
  thing: Subject,
  shape: S,
): { storedVersion: number; record: VersionedRecord[S] } | null {
  const storedVersion = storedVersionOf(thing);
  if (storedVersion < 1) return null;
  const version = Math.min(storedVersion, LATEST_VERSION[shape]);
  const descriptor = (SHAPES[shape] as Record<number, ShapeDescriptor>)[version];
  if (!getUrlAll(thing, RDF.type).includes(descriptor.targetClass)) return null;
  if (!hasFixedValues(thing, descriptor)) return null;
  const data = readRecord(thing, descriptor);
  if (data === null) return null;
  return { storedVersion, record: { version, data } as VersionedRecord[S] };
}

/**
 * Write the record's fields onto the subject, replacing only the
 * predicates the shape owns: an absent optional field removes its
 * triple, a predicate the shape forbids is removed, anything the shape
 * does not mention survives.
 */
export function applyRecord<T>(
  builder: SubjectBuilder,
  descriptor: ShapeDescriptor<T>,
  record: T,
): SubjectBuilder {
  for (const predicate of descriptor.absent) builder.removeAll(predicate);
  for (const field of descriptor.fields) {
    builder.removeAll(field.predicate);
    const value = (record as Record<string, FieldValue | undefined>)[field.name];
    if (value === undefined) continue;
    // A list, or a text in many languages, is written in one call (setIriAll, setStringAll).
    if (field.kind === "text" || field.kind === "anyText") {
      builder.setStringAll(field.predicate, languageStrings(value as LangText | LangTexts));
    } else if (field.cardinality !== "many") {
      addValue(builder, field, value as string | number | boolean);
    } else if (field.kind === "iri" || field.kind === "iriEnum") {
      builder.setIriAll(field.predicate, value as readonly string[]);
    } else {
      const strings = (value as readonly string[]).map((one) => ({ value: one, language: "" }));
      builder.setStringAll(field.predicate, strings);
    }
  }
  return builder;
}

/** A text's strings, one or many in each language (`""` for none), by language. */
function languageStrings(text: LangText | LangTexts): LanguageString[] {
  return Object.keys(text)
    .sort()
    .flatMap((language) => {
      const strings: string | readonly string[] = text[language];
      return (typeof strings === "string" ? [strings] : strings).map((value) => ({
        value,
        language,
      }));
    });
}

function addValue(
  builder: SubjectBuilder,
  field: FieldDescriptor,
  value: string | number | boolean,
): void {
  switch (field.kind) {
    case "string":
    case "enum":
      builder.addStringNoLocale(field.predicate, value as string);
      break;
    case "integer":
      builder.addInteger(field.predicate, value as number);
      break;
    case "decimal":
      builder.addDecimal(field.predicate, value as number);
      break;
    case "boolean":
      builder.addBoolean(field.predicate, value as boolean);
      break;
    case "dateTime":
      builder.addDatetime(field.predicate, new Date(value as string));
      break;
    case "iri":
    case "iriEnum":
      builder.addIri(field.predicate, value as string);
      break;
  }
}

/**
 * The subject as this app writes it: the existing subject (so unknown
 * triples survive) or a new one, typed once with its class and any
 * further types its shape names, with the record applied, the values
 * the shape fixes set and the shape's version stamped.
 *
 * A tab running an older version of the app is stopped here from
 * writing over what a newer one wrote: an existing subject stamped with a
 * version above the one this app writes for its kind is refused
 * (writtenByNewerApp), before anything is sent. Reading it passes it
 * through (readVersioned); only writing would lose what the newer format
 * says. Writes that change or remove a subject without recording it
 * (a position, a completed chapter, a repair, a removal) are refused the
 * same way by unlessNewer.
 */
export function recordThing<T>(
  url: string,
  descriptor: ShapeDescriptor<T>,
  record: T,
  existing: NamedSubject | null,
): NamedSubject {
  if (existing !== null && storedVersionOf(existing) > descriptor.version) {
    throw new AppError("writtenByNewerApp", {
      url,
      version: storedVersionOf(existing),
      writes: descriptor.version,
    });
  }
  const thing = existing ?? createThing({ url });
  const builder = buildThing(thing);
  const types = getUrlAll(thing, RDF.type);
  for (const type of [descriptor.targetClass, ...descriptor.additionalTypes]) {
    if (!types.includes(type)) builder.addIri(RDF.type, type);
  }
  applyRecord(builder, descriptor, record);
  for (const fixed of descriptor.fixedValues) builder.setIri(fixed.predicate, fixed.value);
  return builder.setInteger(SM.formatVersion, descriptor.version).build();
}

/**
 * The subject, unless a newer version of the app wrote it: one stamped
 * with a version above the latest this app writes for its class is
 * refused (writtenByNewerApp), as recordThing refuses it, for the writes
 * that change or remove a subject without recording it. Where a kind's
 * shape fixes values the subject has (an FSRS-6 review state), that
 * kind's latest version counts, not its class's others'. A subject of no
 * class this app writes is not its to judge, and passes.
 */
export function unlessNewer<T extends Subject>(thing: T): T {
  const types = getUrlAll(thing, RDF.type);
  const latest = (Object.keys(LATEST_VERSION) as ShapeName[])
    .map((shape) => (SHAPES[shape] as Record<number, ShapeDescriptor>)[LATEST_VERSION[shape]])
    .filter((d) => types.includes(d.targetClass) && hasFixedValues(thing, d));
  const fixed = latest.filter((d) => d.fixedValues.length > 0);
  const writes = Math.max(0, ...(fixed.length > 0 ? fixed : latest).map((d) => d.version));
  const version = storedVersionOf(thing);
  if (writes > 0 && version > writes)
    throw new AppError("writtenByNewerApp", { url: thing.url, version, writes });
  return thing;
}

/**
 * The subject at `url`, unless it is typed `other` (refused,
 * idTakenInDeck): a card and a distractor are subjects of one cards
 * document, each at its id, so one is never written onto the other.
 */
export function unlessTyped(
  edit: DatasetEdit<Dataset>,
  url: string,
  other: string,
): NamedSubject | null {
  const thing = edit.getThing(url);
  if (thing !== null && getUrlAll(thing, RDF.type).includes(other)) {
    throw new AppError("idTakenInDeck", { url });
  }
  return thing;
}

/** The dataset without the subject, unless a newer version of the app wrote it (unlessNewer). */
export function removeUnlessNewer<D extends Dataset>(dataset: D, url: string): D {
  return removeAllUnlessNewer(dataset, [url]);
}

/**
 * The dataset without each of the subjects, unless a newer version of
 * the app wrote one (unlessNewer): all taken out at once (removeThings),
 * in time that grows with them and the document, not their product.
 */
export function removeAllUnlessNewer<D extends Dataset>(dataset: D, urls: readonly string[]): D {
  for (const url of urls) {
    const thing = getThing(dataset, url);
    if (thing !== null) unlessNewer(thing);
  }
  return removeThings(dataset, urls);
}
