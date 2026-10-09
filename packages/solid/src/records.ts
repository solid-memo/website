import {
  addDatetime,
  buildThing,
  createThing,
  getBoolean,
  getDatetime,
  getDecimal,
  getInteger,
  getStringByLocaleAll,
  getStringNoLocale,
  getStringNoLocaleAll,
  getUrl,
  getThing,
  getUrlAll,
  removeThing,
  type SolidDataset,
  type Thing,
  type ThingBuilder,
  type ThingPersisted,
} from "@inrupt/solid-client";
import {
  LATEST_VERSION,
  type LangText,
  type LangTexts,
  type ShapeName,
  type VersionedRecord,
} from "@solid-memo/vocab/types.generated";
import type {
  FieldDescriptor,
  ShapeDescriptor,
} from "@solid-memo/vocab/shapeDescriptor";
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
function readField(thing: Thing, field: FieldDescriptor): FieldValue | null | undefined {
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

function readScalar(thing: Thing, field: FieldDescriptor): string | number | boolean | LangText | null {
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
      return getDatetime(thing, field.predicate)?.toISOString() ?? null;
    case "iri":
      return getUrl(thing, field.predicate);
    case "iriEnum": {
      const value = getUrl(thing, field.predicate);
      return value !== null && field.values!.includes(value) ? value : null;
    }
  }
}

/**
 * A text's language-tagged values, by lower-case language tag (the first
 * value of each language: the shapes allow one); null when there are none.
 * Untagged literals are not part of a text.
 */
export function readText(thing: Thing, predicate: string): LangText | null {
  const text: LangText = Object.fromEntries(
    [...getStringByLocaleAll(thing, predicate)].map(([language, values]) => [language.toLowerCase(), values[0]]),
  );
  return Object.keys(text).length > 0 ? text : null;
}

/** A text that may also be untagged: the untagged literal under the empty tag. */
function readAnyText(thing: Thing, predicate: string): LangText | null {
  const untagged = getStringNoLocale(thing, predicate);
  const text = readText(thing, predicate) ?? {};
  return untagged === null ? (Object.keys(text).length > 0 ? text : null) : { "": untagged, ...text };
}

/**
 * Texts with several values per language (a deck's keywords): every
 * language-tagged value, by lower-case language tag (tags that differ
 * only in case are one language), each once, in stored order; for a
 * field that may also be untagged, the untagged values under the empty
 * tag. Empty ({}) when there are none.
 */
function readTexts(thing: Thing, predicate: string, untagged: boolean): LangTexts {
  const texts: Record<string, string[]> = {};
  const add = (tag: string, values: readonly string[]) => {
    texts[tag] = [...new Set([...(texts[tag] ?? []), ...values])];
  };
  if (untagged) {
    const values = getStringNoLocaleAll(thing, predicate);
    if (values.length > 0) add("", values);
  }
  for (const [language, values] of getStringByLocaleAll(thing, predicate)) {
    add(language.toLowerCase(), values);
  }
  return texts;
}

/**
 * The subject as a record of the shape; null when a required field is
 * missing (or an enum holds a value the shape does not list).
 */
export function readRecord<T>(thing: Thing, descriptor: ShapeDescriptor<T>): T | null {
  const record: Record<string, FieldValue> = {};
  for (const field of descriptor.fields) {
    const value = readField(thing, field);
    if (value === null) return null;
    if (value !== undefined) record[field.name] = value;
  }
  return record as T;
}

/** What a subject says about its format: absent means 1. */
export function storedVersionOf(thing: Thing): number {
  return getInteger(thing, SM.formatVersion) ?? 1;
}

/**
 * A subject of the given kind, read with the shape of its stored version
 * — or, for a version newer than this app knows, with the latest shape
 * it has, the stored version passing through. Null when the subject is
 * not of the kind's class, or does not fit its shape.
 */
export function readVersioned<S extends ShapeName>(
  thing: Thing,
  shape: S,
): { storedVersion: number; record: VersionedRecord[S] } | null {
  const storedVersion = storedVersionOf(thing);
  const version = Math.min(Math.max(storedVersion, 1), LATEST_VERSION[shape]);
  const descriptor = (SHAPES[shape] as Record<number, ShapeDescriptor>)[version];
  if (!getUrlAll(thing, RDF.type).includes(descriptor.targetClass)) return null;
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
  builder: ThingBuilder<ThingPersisted>,
  descriptor: ShapeDescriptor<T>,
  record: T,
): ThingBuilder<ThingPersisted> {
  for (const predicate of descriptor.absent) builder.removeAll(predicate);
  for (const field of descriptor.fields) {
    builder.removeAll(field.predicate);
    const value = (record as Record<string, FieldValue | undefined>)[field.name];
    if (value === undefined) continue;
    if ((field.kind === "text" || field.kind === "anyText") && field.cardinality === "many") {
      const texts = value as LangTexts;
      for (const language of Object.keys(texts).sort()) {
        for (const one of texts[language]) {
          if (language === "") builder.addStringNoLocale(field.predicate, one);
          else builder.addStringWithLocale(field.predicate, one, language);
        }
      }
      continue;
    }
    if (field.kind === "text" || field.kind === "anyText") {
      const text = value as LangText;
      for (const language of Object.keys(text).sort()) {
        if (language === "") builder.addStringNoLocale(field.predicate, text[language]);
        else builder.addStringWithLocale(field.predicate, text[language], language);
      }
      continue;
    }
    for (const one of Array.isArray(value) ? value : [value]) {
      addValue(builder, field, one as string | number | boolean);
    }
  }
  return builder;
}

function addValue(
  builder: ThingBuilder<ThingPersisted>,
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
 * further types its shape names, with the record applied and the
 * shape's version stamped.
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
  existing: ThingPersisted | null,
): ThingPersisted {
  if (existing !== null && storedVersionOf(existing) > descriptor.version) {
    throw new AppError("writtenByNewerApp", { url, version: storedVersionOf(existing), writes: descriptor.version });
  }
  const thing = existing ?? createThing({ url });
  const builder = buildThing(thing);
  const types = getUrlAll(thing, RDF.type);
  for (const type of [descriptor.targetClass, ...descriptor.additionalTypes]) {
    if (!types.includes(type)) builder.addIri(RDF.type, type);
  }
  return applyRecord(builder, descriptor, record)
    .setInteger(SM.formatVersion, descriptor.version)
    .build();
}

/**
 * The subject, unless a newer version of the app wrote it: one stamped
 * with a version above the latest this app writes for its class is
 * refused (writtenByNewerApp), as recordThing refuses it, for the writes
 * that change or remove a subject without recording it. A subject of no
 * class this app writes is not its to judge, and passes.
 */
export function unlessNewer<T extends Thing>(thing: T): T {
  const types = getUrlAll(thing, RDF.type);
  const writes = Math.max(
    0,
    ...(Object.keys(LATEST_VERSION) as ShapeName[])
      .filter((shape) => types.includes((SHAPES[shape] as Record<number, ShapeDescriptor>)[LATEST_VERSION[shape]].targetClass))
      .map((shape) => LATEST_VERSION[shape]),
  );
  const version = storedVersionOf(thing);
  if (writes > 0 && version > writes) throw new AppError("writtenByNewerApp", { url: thing.url, version, writes });
  return thing;
}

/** The dataset without the subject, unless a newer version of the app wrote it (unlessNewer). */
export function removeUnlessNewer<D extends SolidDataset>(dataset: D, url: string): D {
  const thing = getThing(dataset, url);
  if (thing !== null) unlessNewer(thing);
  return removeThing(dataset, url);
}

// addDatetime is re-exported for mappers that stamp times outside a record.
export { addDatetime };
