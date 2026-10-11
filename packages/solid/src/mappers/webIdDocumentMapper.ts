import {
  asUrl,
  getSourceUrl,
  getThingAll,
  type SolidDataset,
  type Thing,
  type WithResourceInfo,
} from "@inrupt/solid-client";
import type {
  Property,
  PropertyValue,
  Subject,
  WebIdDocument,
} from "@solid-memo/domain/webIdDocument";

export function toWebIdDocument(dataset: SolidDataset & WithResourceInfo): WebIdDocument {
  return {
    url: getSourceUrl(dataset),
    subjects: getThingAll(dataset).map(toSubject),
  };
}

export function toSubject(thing: Thing): Subject {
  return {
    url: asUrl(thing),
    properties: Object.entries(thing.predicates).map(
      ([predicate, objects]): Property => ({
        predicate,
        values: toPropertyValues(objects),
      }),
    ),
  };
}

export function toPropertyValues(objects: Thing["predicates"][string]): PropertyValue[] {
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
