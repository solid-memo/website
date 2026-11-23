// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  type NamedSubject,
  type Subject,
  type LanguageString,
  type SubjectBuilder,
  asUrl,
  buildThing,
  createThing,
  eachStringByLocale,
  eachStringNoLocale,
  eachUrl,
  getBoolean,
  getDatetime,
  getDecimal,
  getInteger,
  getLiteralAll,
  getPropertyAll,
  getStringNoLocale,
  getTermAll,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  removeThings,
} from "./client/rdf";
import type { DatasetEdit } from "./datasetEdit";
import { isTermTooLong, MAX_TERM_CHARACTERS } from "./client/readLimits";
import type { Literal, NamedNode, Quad_Object, Term } from "@rdfjs/types";
import {
  LATEST_VERSION,
  type LangText,
  type LangTexts,
  type LatestRecord,
  type ShapeName,
  type VersionedRecord,
} from "@solid-memo/vocab/types.generated";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import type {
  FieldDescriptor,
  ShapeDescriptor,
  TermsDescriptor,
} from "@solid-memo/vocab/shapeDescriptor";
import { ALL_SHAPES, SHAPES } from "@solid-memo/vocab/descriptors.generated";
import { DCAT_AP_SHAPED_CLASSES } from "@solid-memo/shacl/profiles";
import { RDF, SM } from "./vocab";
import { AppError } from "@solid-memo/domain/appError";
import { isHttpUrl } from "@solid-memo/domain/webId";
import { subjectOfDocument } from "@solid-memo/domain/instanceLayout";
import { documentUrlOf, fragmentIdOf, isDocumentSubject } from "@solid-memo/domain/subjectUrl";

/**
 * The generic half of every mapper: a subject read into the record its
 * shape describes, and a record written onto a subject. Which predicates,
 * of which kind and how many, comes from the shape's descriptor, so a
 * mapper can only read and write what the shape says (see docs/shapes.md).
 */

type FieldValue = string | number | boolean | readonly string[] | LangText | LangTexts;

/**
 * At most `max` of the subject's IRIs for the property that its rule
 * reads, in stored order: http(s) URLs, or for a mailbox (foaf:mbox,
 * whose bounds state "^mailto:") its mailto: URLs. n3 reads an IRI
 * that `new URL` refuses, such as `<http://[x>` or `<http://a:99999/x>`,
 * and the client library writes no such IRI (addIri, setIri), so a value
 * read with one would make every later write of the subject fail. An IRI
 * of another scheme, such as `<rdf:type>` or `<sm:Deck>`, names nothing
 * the app knows, yet a later write of the document may write it as the
 * prefixed name it looks like, which means another IRI, and the deck's
 * export refuses it: the rule carriedTo copies by (isCarried,
 * GHSA-6555-2gvc-c7f4). Neither is read: what is read of a subject can
 * always be written back (docs/data-model.md "Write discipline").
 */
function readIris(thing: Subject, predicate: string, rule: IriRule, max: number): string[] {
  return [...firstOf(passing(eachUrl(thing, predicate), isReadIri(rule)), max)];
}

/** Which IRIs a field reads (FieldDescriptor.iri): http(s) URLs (isHttpUrl) or, for a mailbox, mailto: ones. */
type IriRule = NonNullable<FieldDescriptor["iri"]>;

function isReadIri(rule: IriRule): (iri: string) => boolean {
  return rule === "mailbox" ? isMailbox : isHttpUrl;
}

/** A mailbox (foaf:mbox): an email's `mailto:` URL. */
function isMailbox(iri: string): boolean {
  return iri.startsWith("mailto:") && URL.canParse(iri);
}

/** The first `max` of `values`, each taken only as it is asked for: no more are read. */
function* firstOf<T>(values: Iterable<T>, max: number): Generator<T> {
  // A bound is 1 or more (ns/bounds/): the next value is never asked for once it is reached.
  let taken = 0;
  for (const value of values) {
    yield value;
    if (++taken === max) return;
  }
}

/** The values that pass `test`, each taken only as it is asked for. */
function* passing<T>(values: Iterable<T>, test: (value: T) => boolean): Generator<T> {
  for (const value of values) if (test(value)) yield value;
}

/** Whether a string fits a field: no longer than its maxLength, a term's length when it states none. */
function fits(field: FieldDescriptor): (value: string) => boolean {
  const max = field.maxLength ?? MAX_TERM_CHARACTERS;
  return (value) => value.length <= max;
}

/**
 * One field's value, read within its bounds (ns/bounds/): at most its
 * maxCount values, taken in stored order as they are read, so a longer
 * list is never built; each string or text no longer than its
 * maxLength, and each IRI one its rule reads (readIris), any other not
 * read at all; a string longer than that in a list, which would then
 * say less than the subject does, leaves none of it read (readStrings).
 * Undefined when absent; null when a required one is, or a list can't
 * be read.
 */
function readField(thing: Subject, field: FieldDescriptor): FieldValue | null | undefined {
  if (field.cardinality === "many") {
    switch (field.kind) {
      case "iri":
        return readIris(thing, field.predicate, field.iri!, field.maxCount);
      case "iriEnum":
        return [
          ...firstOf(
            passing(eachUrl(thing, field.predicate), (v) => field.values!.includes(v)),
            field.maxCount,
          ),
        ];
      case "text":
      case "anyText":
        return readTexts(thing, field, field.kind === "anyText");
      default:
        return readStrings(thing, field);
    }
  }
  const value = readScalar(thing, field);
  if (value === null) return field.cardinality === "one" ? null : undefined;
  return value;
}

/**
 * At most a field's maxCount strings, in stored order; null when one of
 * them is longer than its maxLength, as a list missing a value would
 * say something else than the subject does (a deck schedule's due days).
 */
function readStrings(thing: Subject, field: FieldDescriptor): string[] | null {
  const read: string[] = [];
  const fit = fits(field);
  for (const value of eachStringNoLocale(thing, field.predicate)) {
    if (read.length === field.maxCount) break;
    if (!fit(value)) return null;
    read.push(value);
  }
  return read;
}

function readScalar(
  thing: Subject,
  field: FieldDescriptor,
): string | number | boolean | LangText | null {
  switch (field.kind) {
    case "text":
      return readLanguages(thing, field, {});
    case "anyText":
      return readAnyText(thing, field);
    case "string": {
      const value = getStringNoLocale(thing, field.predicate);
      return value !== null && fits(field)(value) ? value : null;
    }
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
      return readIris(thing, field.predicate, field.iri!, 1)[0] ?? null;
    case "iriEnum": {
      const value = getUrl(thing, field.predicate);
      return value !== null && field.values!.includes(value) ? value : null;
    }
  }
}

/** The datatype of an xsd:dateTime literal. */
export const XSD_DATETIME = "http://www.w3.org/2001/XMLSchema#dateTime";

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
 * An instant in xsd:dateTime's lexical form: as toISOString writes it,
 * but for a year past 9999 or before 0, which toISOString writes with a
 * sign and six digits (`+012345`, `-000001`). XSD's year has no plus
 * sign and no leading zeros beyond four digits (`12345`, `-0001`), and
 * the write check refuses any other spelling. A date reads the same
 * either way, so what was read is kept.
 */
function xsdDatetime(instant: string): string {
  return new Date(instant).toISOString().replace(/^\+?(-?)0*(\d{4,}-)/, "$1$2");
}

const XSD_INTEGER = "http://www.w3.org/2001/XMLSchema#integer";
const XSD_DECIMAL = "http://www.w3.org/2001/XMLSchema#decimal";

/** An xsd:integer or xsd:decimal literal of a number, spelled as plainNumeral spells it. */
function numberLiteral(value: number, datatype: string): Literal {
  return {
    termType: "Literal",
    value: plainNumeral(value),
    language: "",
    datatype: { termType: "NamedNode", value: datatype },
  } as Literal;
}

/**
 * A number as JavaScript spells it, but without an exponent, which no
 * xsd:integer or xsd:decimal lexical form has: `1e+23` is
 * `100000000000000000000000` and `1e-7` is `0.0000001`. JavaScript
 * spells a number with one only from 1e21 up and below 1e-6, where
 * every digit is before the point or after it. A number that is not
 * finite stays as it is spelled, which the write check refuses.
 */
function plainNumeral(value: number): string {
  const spelled = String(value);
  const parts = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(spelled);
  if (parts === null) return spelled;
  const [, sign, first, rest = "", exponent] = parts;
  const digits = `${first}${rest}`;
  const point = 1 + Number(exponent);
  return point > 0
    ? `${sign}${digits.padEnd(point, "0")}`
    : `${sign}0.${"0".repeat(-point)}${digits}`;
}

/** The date an xsd:dateTime literal holds, as readDatetime reads it; null when it holds none. */
export function datetimeOf(term: Literal): Date | null {
  const probe = buildThing(createThing()).addLiteral(PROBE, datetimeLiteral(term.value)).build();
  return readDatetime(probe, PROBE);
}

/**
 * Whether a term is an xsd:dateTime that readDatetime does not read as
 * a date: what the instance and release checks name (DateTimeRange).
 */
export function isUnreadableDatetime(term: Term): boolean {
  if (term.termType !== "Literal" || term.datatype.value !== XSD_DATETIME) return false;
  return datetimeOf(term as Literal) === null;
}

/** A subject's values of a predicate that isUnreadableDatetime, in stored order. */
export function unreadableDatetimes(thing: Subject, predicate: string): string[] {
  return getLiteralAll(thing, predicate)
    .filter(isUnreadableDatetime)
    .map((literal) => literal.value);
}

/**
 * A text's language-tagged values after `text` (a text's untagged value,
 * when it may have one), by lower-case language tag: the first value of
 * each language (the shapes allow one), in at most the field's maxCount
 * languages in all, each no longer than its maxLength; a language whose
 * first value is longer is not read. Null when there are none. Untagged
 * literals are not part of a text.
 */
function readLanguages(thing: Subject, field: FieldDescriptor, text: LangText): LangText | null {
  const read: Record<string, string> = { ...text };
  const fit = fits(field);
  const seen = new Set<string>();
  let count = Object.keys(read).length;
  for (const [language, value] of eachStringByLocale(thing, field.predicate)) {
    if (count === field.maxCount) break;
    if (seen.has(language)) continue;
    seen.add(language);
    if (!fit(value)) continue;
    read[language] = value;
    count++;
  }
  return count > 0 ? read : null;
}

/** A text that may also be untagged: the untagged literal under the empty tag, one of its values. */
function readAnyText(thing: Subject, field: FieldDescriptor): LangText | null {
  const untagged = getStringNoLocale(thing, field.predicate);
  const read = untagged !== null && fits(field)(untagged);
  return readLanguages(thing, field, read ? { "": untagged } : {});
}

/**
 * Texts with several values per language (a deck's keywords): the
 * language-tagged values, by lower-case language tag (tags that differ
 * only in case are one language), each once, in stored order; for a
 * field that may also be untagged, the untagged values under the empty
 * tag first. At most the field's maxCount values in all, each no longer
 * than its maxLength. Empty ({}) when there are none.
 */
function readTexts(thing: Subject, field: FieldDescriptor, untagged: boolean): LangTexts {
  // The client reads each tag in lower case (client/rdf.ts), so a tag comes up once.
  const texts = new Map<string, Set<string>>();
  const fit = fits(field);
  let count = 0;
  for (const [language, value] of textValues(thing, field.predicate, untagged)) {
    if (count === field.maxCount) break;
    if (!fit(value)) continue;
    const values = texts.get(language) ?? new Set<string>();
    texts.set(language, values);
    if (values.has(value)) continue;
    values.add(value);
    count++;
  }
  return Object.fromEntries([...texts].map(([language, values]) => [language, [...values]]));
}

/** A text's values one at a time, with their language: the untagged ones first ("") when it may have them, then the tagged ones. */
function* textValues(
  thing: Subject,
  predicate: string,
  untagged: boolean,
): Generator<[language: string, value: string]> {
  if (untagged) for (const value of eachStringNoLocale(thing, predicate)) yield ["", value];
  yield* eachStringByLocale(thing, predicate);
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

/**
 * The terms a small shape of ns/bounds/ names (a deck entry's completed
 * chapters, a WebID profile's storages), read as a record's fields are,
 * within their bounds: a missing one is absent, and a missing list, or
 * one that can't be read (readStrings), empty.
 */
export function readTerms<T>(thing: Subject, descriptor: TermsDescriptor<T>): T {
  const terms: Record<string, FieldValue> = {};
  for (const field of descriptor.fields) {
    const value = readField(thing, field);
    if (value !== null && value !== undefined) terms[field.name] = value;
    else if (field.cardinality === "many") terms[field.name] = [];
  }
  return terms as T;
}

/**
 * Whether the subject states `iri` as a value of the property. A test
 * of one value reads the values one at a time and keeps none of them,
 * so it gives the same answer however many values the subject has, and
 * needs no bound.
 */
export function hasIri(thing: Subject, predicate: string, iri: string): boolean {
  return someIri(thing, predicate, (value) => value === iri);
}

/** Whether the subject is of the class: states it as a value of rdf:type (hasIri). */
export function hasClass(thing: Subject, type: string): boolean {
  return hasIri(thing, RDF.type, type);
}

/** Whether one of the subject's IRIs for the property passes `test`, read as hasIri reads them. */
export function someIri(
  thing: Subject,
  predicate: string,
  test: (iri: string) => boolean,
): boolean {
  for (const value of eachUrl(thing, predicate)) if (test(value)) return true;
  return false;
}

/**
 * One field of a shape's descriptor read from the subject within its
 * bounds, as readRecord reads it, whether or not the subject fits the
 * shape: undefined when it has none (or none that is read). For one
 * field read alone, such as the datasets a catalog lists as a write
 * adds one.
 */
export function readFieldOf<T, K extends keyof T & string>(
  thing: Subject,
  descriptor: ShapeDescriptor<T>,
  name: K,
): T[K] | undefined {
  const field = descriptor.fields.find((one) => one.name === name)!;
  return (readField(thing, field) ?? undefined) as T[K] | undefined;
}

/**
 * How many values of a field of strings or IRIs the subject states that
 * the field would read, past its maxCount too: for a listing that says
 * how many more there are than it shows. They're counted as they're
 * read, and none is kept.
 */
export function countOf<T>(
  thing: Subject,
  descriptor: ShapeDescriptor<T>,
  name: keyof T & string,
): number {
  const field = descriptor.fields.find((one) => one.name === name)!;
  const values =
    field.kind === "iri"
      ? passing(eachUrl(thing, field.predicate), isReadIri(field.iri!))
      : passing(eachStringNoLocale(thing, field.predicate), fits(field));
  let count = 0;
  for (const _ of values) count++;
  return count;
}

/** What a subject says about its format: absent means 1. */
export function storedVersionOf(thing: Subject): number {
  return getInteger(thing, SM.formatVersion) ?? 1;
}

/** Whether the subject has every value the shape fixes (an FSRS-6 state's scheduler). */
function hasFixedValues(thing: Subject, descriptor: ShapeDescriptor): boolean {
  return descriptor.fixedValues.every((fixed) => hasIri(thing, fixed.predicate, fixed.value));
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
  if (!hasClass(thing, descriptor.targetClass)) return null;
  if (!hasFixedValues(thing, descriptor)) return null;
  const data = readRecord(thing, descriptor);
  if (data === null) return null;
  return { storedVersion, record: { version, data } as VersionedRecord[S] };
}

/**
 * A record read (readVersioned) brought to its shape's latest format
 * (migrate), or null when the chain made a term longer than a term may
 * be (isTermTooLong), measured as a write would write it: an address it
 * builds from the subject, such as a deck's distribution or a release's
 * series, or a text it tags, such as an untagged title written in
 * English from format 4 on, its language tag after it. No write of such
 * a record would be accepted, so it is read as a subject that does not
 * fit its shape. The text the chain writes itself is kept within the
 * bound (defaultDeckDescription). Its creators' agents are not held to
 * it here: a deck from before format 3 names its authors, whose agents
 * a write names anew and refuses past the bound (GHSA-4mgg-5xpp-3jx5),
 * and only its first are read (its bounds, ns/bounds/).
 */
export function migrateWithinBound<S extends ShapeName>(
  shape: S,
  record: VersionedRecord[S],
  context: Parameters<typeof migrate>[2],
): LatestRecord[S] | null {
  const data = migrate(shape, record, context);
  const descriptor = (SHAPES[shape] as Record<number, ShapeDescriptor>)[LATEST_VERSION[shape]];
  return writesPastBound(descriptor, data) ? null : data;
}

/** Whether a record, written as applyRecord writes it, has a term past the bound, its creators aside. */
function writesPastBound(descriptor: ShapeDescriptor, record: unknown): boolean {
  const fields = descriptor.fields.filter((field) => field.name !== "creator");
  const written = applyRecord(buildThing(createThing()), { ...descriptor, fields }, record).build();
  return fields.some((field) => getTermAll(written, field.predicate).some(isTermTooLong));
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
    } else if (field.kind === "iri" || field.kind === "iriEnum") {
      // As setIriAll writes them: a value the subject had stays as it is.
      const iris = field.cardinality === "many" ? (value as readonly string[]) : [value as string];
      builder.setIriAll(field.predicate, iris);
    } else if (field.cardinality !== "many") {
      addValue(builder, field, value as string | number | boolean);
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
      builder.addLiteral(field.predicate, numberLiteral(value as number, XSD_INTEGER));
      break;
    case "decimal":
      builder.addLiteral(field.predicate, numberLiteral(value as number, XSD_DECIMAL));
      break;
    case "boolean":
      builder.addBoolean(field.predicate, value as boolean);
      break;
    case "dateTime":
      builder.addLiteral(field.predicate, datetimeLiteral(xsdDatetime(value as string)));
      break;
  }
}

/**
 * The classes a shape asks something of: Solid Memo's own shapes' and
 * the standard ones it writes (foaf:Agent, dcat:Catalog, ...), and each
 * class a shape of the DCAT-AP profile holds to properties
 * (DCAT_AP_SHAPED_CLASSES: dcat:Dataset, dcat:DataService, ...). The
 * write check holds a subject to the shape of every such class it has,
 * so a subject of another kind that kept one could never be written
 * again (GHSA-6wqw-rpq8-v2cq, GHSA-h3xx-5m22-28jw).
 */
const SHAPED_CLASSES: ReadonlySet<string> = new Set([
  ...ALL_SHAPES.map((d) => d.targetClass),
  ...DCAT_AP_SHAPED_CLASSES,
]);

/**
 * The most classes the write check reads a subject by: one with more
 * is checked as having none, which no write of it passes
 * (MAX_TYPES_PER_NODE in packages/shacl/src/engine.ts).
 */
export const MAX_CLASSES = 32;

/**
 * The subject with each class a shape asks something of that another
 * app gave it dropped (SHAPED_CLASSES), unless it is one of the
 * descriptor's own: what this app writes of the subject is held to its
 * own shapes alone. A class no shape asks anything of (a foaf:Document)
 * stays, as long as the subject, with its own classes, has no more
 * than the write check reads it by (MAX_CLASSES); the ones past that
 * are dropped too, and so is a value of rdf:type that is no IRI.
 */
export function withoutForeignShapedClasses(
  thing: NamedSubject,
  descriptor: ShapeDescriptor,
): NamedSubject {
  const kept = keptClasses(
    [descriptor.targetClass, ...descriptor.additionalTypes],
    getUrlAll(thing, RDF.type),
  );
  // A value of rdf:type that is no IRI (a literal, a blank node) names
  // no class, yet the check counts it against MAX_CLASSES: it goes too.
  return buildThing(thing).removeAll(RDF.type).setIriAll(RDF.type, kept).build();
}

/**
 * Of the classes a subject states (`classes`, IRIs in the order it
 * states them), the ones it keeps when its own are `own`: each of its
 * own, and each class no shape asks anything of (SHAPED_CLASSES) while
 * the subject, its own classes first, stays within the most the write
 * check reads it by (MAX_CLASSES). The rule withoutForeignShapedClasses
 * writes a subject by, for a writer that keeps a subject's classes as
 * statements of its own (a release draft's).
 */
export function keptClasses(own: Iterable<string>, classes: Iterable<string>): string[] {
  const owned = new Set(own);
  let room = MAX_CLASSES - owned.size;
  const kept: string[] = [];
  for (const type of new Set(classes)) {
    if (owned.has(type)) kept.push(type);
    else if (!SHAPED_CLASSES.has(type) && room > 0) {
      kept.push(type);
      room--;
    }
  }
  return kept;
}

/**
 * The subject as this app writes it: the existing subject (so unknown
 * triples survive) or a new one, typed once with its class and any
 * further types its shape names, with the record applied, the values
 * the shape fixes set and the shape's version stamped. A class a shape
 * asks something of that another app gave the subject is dropped,
 * unless it is the subject's own, and so is any other class past the
 * most the write check reads (withoutForeignShapedClasses).
 *
 * A tab running an older version of the app is stopped here from
 * writing over what a newer one wrote: an existing subject stamped with a
 * version above the one this app writes for its kind is refused
 * (writtenByNewerApp), before anything is sent. Reading it passes it
 * through (readVersioned); only writing would lose what the newer format
 * says. Writes that change or remove a subject without recording it
 * (a position, a completed chapter, a removal) are refused the
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
  const thing =
    existing === null ? createThing({ url }) : withoutForeignShapedClasses(existing, descriptor);
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
 * A subject at `url` that says what `source` says, but for the
 * properties in `without`: what a copy of a subject in another document
 * starts from (recordThing's `existing`), so what its source says beyond
 * what this app knows of it goes with it. This app then writes what it
 * knows over it, and refuses a source a newer version wrote, as it would
 * in place. Each value is carried as it is. A value that is a blank
 * node is left out, as what it says stays in the source's document, and
 * so is an IRI that is no http(s) URL, as a value, a literal's datatype
 * (isCarried) or a property.
 */
export function carriedTo(
  source: Subject,
  url: string,
  without: readonly string[] = [],
): NamedSubject {
  // Every value gathered first and added in one call (addAll), as an
  // add at each value takes time in the square of the subject's values.
  const values = new Map<string, (Literal | NamedNode)[]>();
  for (const predicate of getPropertyAll(source)) {
    if (without.includes(predicate) || !isHttpUrl(predicate)) continue;
    values.set(predicate, getTermAll(source, predicate).filter(isCarried));
  }
  return buildThing(createThing({ url })).addAll(values).build();
}

/**
 * Whether carriedTo carries a value: an http(s) IRI, or a literal whose
 * datatype is one. An IRI of another scheme stays behind, as a value, a
 * literal's datatype or a property: one such as `sm:Deck` names no term
 * of the app, yet a JSON-LD file would read it as one, and the deck's
 * export refuses it (GHSA-gxjp-m253-f2pj, GHSA-636q-3g97-fhhw).
 */
function isCarried(term: Quad_Object): term is Literal | NamedNode {
  if (term.termType === "Literal") return isHttpUrl(term.datatype.value);
  return term.termType === "NamedNode" && isHttpUrl(term.value);
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
  const newer = newerThanWritten(thing);
  if (newer !== null) throw new AppError("writtenByNewerApp", { url: thing.url, ...newer });
  return thing;
}

/**
 * Whether a newer version of the app wrote the subject, as unlessNewer
 * judges it: for the writes that may pass such a subject by, and leave
 * it as it is, where it is no subject the write is of.
 */
export function isWrittenByNewer(thing: Subject): boolean {
  return newerThanWritten(thing) !== null;
}

/** The subject's stored version and the latest this app writes for it, when the one is above the other (unlessNewer); else null. */
function newerThanWritten(thing: Subject): { version: number; writes: number } | null {
  const types = getUrlAll(thing, RDF.type);
  const latest = (Object.keys(LATEST_VERSION) as ShapeName[])
    .map((shape) => (SHAPES[shape] as Record<number, ShapeDescriptor>)[LATEST_VERSION[shape]])
    .filter((d) => types.includes(d.targetClass) && hasFixedValues(thing, d));
  const fixed = latest.filter((d) => d.fixedValues.length > 0);
  const writes = Math.max(0, ...(fixed.length > 0 ? fixed : latest).map((d) => d.version));
  const version = storedVersionOf(thing);
  return writes > 0 && version > writes ? { version, writes } : null;
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

/**
 * The subjects of the document at `documentUrl` that are its own
 * (subjectOfDocument), in document order: a record's id is its fragment,
 * and another document's subject may share it. The document itself
 * (isDocumentSubject), which has no fragment, is no record of it. A
 * fragment at both of the document's spellings, as `documentUrl` is
 * spelled and as the document is fetched, is the one at `documentUrl`,
 * where the app writes it: one id is never two subjects.
 */
export function ownSubjectsOf(dataset: Dataset, documentUrl: string): Subject[] {
  const own = subjectOfDocument(documentUrl);
  const subjects = getThingAll(dataset).filter((thing) => {
    const url = asUrl(thing);
    return own(url) && !isDocumentSubject(url);
  });
  const urls = new Set(subjects.map(asUrl));
  return subjects.filter((thing) => {
    const url = asUrl(thing);
    return documentUrlOf(url) === documentUrl || !urls.has(`${documentUrl}#${fragmentIdOf(url)}`);
  });
}
