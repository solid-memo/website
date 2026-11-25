// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad } from "n3";
import { localName, objectsOf, parseTurtle, type TurtleFile } from "@solid-memo/turtle/rdf";
import { SITE } from "../src/ns.ts";
import {
  fieldKind,
  integerOf,
  type IriRule,
  lowerFirst,
  RDFS_COMMENT,
  SH,
  type ShapeField,
  type ShapeModel,
  type ShapeObjects,
} from "./shapes.ts";

/**
 * The bounds on what the app reads (ns/bounds/<kind>.ttl), as the
 * generator sees them: for each kind of data a shape describes, how
 * many values of each of its properties are read, how long a text may
 * be and which IRIs count, and the terms read beside a shape's record
 * (a deck entry's completed chapters, say), each with its own small
 * shape. Every field a descriptor or a term shape has is bounded, so the
 * reader (packages/adapters/solid/src/records.ts) never reads more than they
 * say. See docs/shapes.md, "Bounds".
 */

/** Where the bounds are published: with the site, from ns/bounds/. */
export const BOUNDS_BASE = `${SITE}ns/bounds/`;

/** The two patterns an IRI field may state: what IriRule they are. */
const IRI_PATTERNS = new Map<string, IriRule>([
  ["^https?://", "http"],
  ["^mailto:", "mailbox"],
]);

/** A property's bounds, as one property shape of a `<Kind>Bounds` shape states them. */
export interface FieldBounds {
  maxCount?: number;
  maxLength?: number;
  iri?: IriRule;
}

/** The terms read beside a kind's record, or of a subject no shape describes: one `<Name>Terms` shape. */
export interface TermsModel {
  /** sh:name, e.g. "DeckTerms". */
  name: string;
  comment: string;
  /** Path under ns/bounds/, e.g. "deck.ttl". */
  document: string;
  fields: ShapeField[];
}

/** One document of ns/bounds/: the bounds of a kind's properties, its terms beside them, or both. */
export interface BoundsModel {
  /** The kind the bounds are of (ShapeModel.shape), e.g. "deck"; undefined for a document of terms alone. */
  kind?: string;
  document: string;
  /** Each bounded predicate, with its bounds. */
  bounds: Map<string, FieldBounds>;
  terms?: TermsModel;
}

/** Every document of ns/bounds/, as `parseBounds` reads it. */
export function parseBounds(files: readonly TurtleFile[]): BoundsModel[] {
  const models = files.map(parseBoundsFile);
  const seen = new Set<string>();
  for (const model of models) {
    for (const name of [model.kind, model.terms?.name]) {
      if (name === undefined) continue;
      if (seen.has(name)) throw new Error(`bounds: "${name}" is bounded twice.`);
      seen.add(name);
    }
  }
  return models;
}

function parseBoundsFile(file: TurtleFile): BoundsModel {
  const quads = parseTurtle(file.turtle, `${BOUNDS_BASE}${file.path}`);
  const fail = (message: string): never => {
    throw new Error(`ns/bounds/${file.path}: ${message}`);
  };
  const shapeNamed = (fragment: string) => {
    const iri = `${BOUNDS_BASE}${file.path}#${fragment}`;
    const name = objectsOf(quads, iri, `${SH}name`)[0]?.value;
    return name === undefined ? undefined : { iri, name };
  };
  const model: BoundsModel = { document: file.path, bounds: new Map() };
  const bounds = shapeNamed("bounds");
  if (bounds !== undefined) {
    const parsed = /^([A-Z][A-Za-z]*)Bounds$/.exec(bounds.name);
    if (parsed === null) fail(`sh:name "${bounds.name}" is not <Kind>Bounds.`);
    model.kind = lowerFirst(parsed![1]);
    for (const property of objectsOf(quads, bounds.iri, `${SH}property`)) {
      const of: ShapeObjects = (p) => objectsOf(quads, property.value, `${SH}${p}`);
      const predicate = pathOf(of, property.value, fail);
      if (model.bounds.has(predicate)) fail(`<${predicate}> is bounded twice.`);
      model.bounds.set(predicate, boundsOf(of, property.value, fail));
    }
  }
  const terms = shapeNamed("terms");
  if (terms !== undefined) {
    if (!/^[A-Z][A-Za-z]*Terms$/.test(terms.name))
      fail(`sh:name "${terms.name}" is not <Name>Terms.`);
    model.terms = {
      name: terms.name,
      comment: objectsOf(quads, terms.iri, RDFS_COMMENT)[0]?.value ?? "",
      document: file.path,
      fields: objectsOf(quads, terms.iri, `${SH}property`).map((property) =>
        termField(quads, property.value, fail),
      ),
    };
  }
  if (bounds === undefined && terms === undefined) fail("has neither <#bounds> nor <#terms>.");
  return model;
}

function pathOf(of: ShapeObjects, shape: string, fail: (message: string) => never): string {
  const path = of("path")[0];
  if (path === undefined || path.termType !== "NamedNode") fail(`<${shape}> has no sh:path IRI.`);
  return path!.value;
}

/** What a property shape bounds: sh:maxCount, sh:maxLength, and an IRI rule by sh:pattern. */
function boundsOf(of: ShapeObjects, shape: string, fail: (message: string) => never): FieldBounds {
  const maxCount = integerOf(of("maxCount")[0]);
  const maxLength = integerOf(of("maxLength")[0]);
  const pattern = of("pattern")[0]?.value;
  const iri = pattern === undefined ? undefined : IRI_PATTERNS.get(pattern);
  if (pattern !== undefined && iri === undefined) {
    fail(`<${shape}> states sh:pattern "${pattern}"; an IRI rule is "^https?://" or "^mailto:".`);
  }
  for (const [name, value] of [
    ["maxCount", maxCount],
    ["maxLength", maxLength],
  ] as const) {
    if (value !== undefined && !(Number.isInteger(value) && value >= 1)) {
      fail(`<${shape}> states sh:${name} ${value}; a bound is a whole number of 1 or more.`);
    }
  }
  return {
    ...(maxCount === undefined ? {} : { maxCount }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(iri === undefined ? {} : { iri }),
  };
}

/**
 * A term read beside a record as a field: its kind as a shape's
 * (sh:datatype, sh:nodeKind sh:IRI), one value with sh:maxCount 1 and
 * several with a larger one, never required (a missing term means its
 * default), and bounded as a kind's fields are.
 */
function termField(
  quads: readonly Quad[],
  shape: string,
  fail: (message: string) => never,
): ShapeField {
  const of: ShapeObjects = (p) => objectsOf(quads, shape, `${SH}${p}`);
  const predicate = pathOf(of, shape, fail);
  if (of("minCount").length > 0) fail(`<${shape}> is required; a term is never required.`);
  const kind = fieldKind(quads, of, shape, undefined, fail);
  const bounds = boundsOf(of, shape, fail);
  if (bounds.maxCount === undefined) fail(`<${shape}> needs sh:maxCount.`);
  const many = bounds.maxCount! > 1;
  if (many && kind !== "string" && kind !== "iri") {
    fail(`<${shape}> repeats a ${kind}; only strings and IRIs may repeat.`);
  }
  const field: ShapeField = {
    name: of("name")[0]?.value ?? localName(predicate),
    predicate,
    kind,
    cardinality: many ? "many" : "optional",
    ...bounds,
  };
  checkBounded(field, (message) => fail(`<${shape}> ${message}`));
  return field;
}

/**
 * Whether a field is bounded as it must be: any field of several values
 * (and any text, whose languages are its values) by sh:maxCount, a
 * string or text by sh:maxLength, and an IRI that is no concept of a
 * fixed list by an IRI rule. A value of a fixed list (sh:in), a number,
 * a boolean or a date-time is one value of a known form.
 */
function checkBounded(field: ShapeField, fail: (message: string) => never): void {
  const textual = field.kind === "text" || field.kind === "anyText";
  if ((field.cardinality === "many" || textual) && field.maxCount === undefined) {
    fail("needs sh:maxCount.");
  }
  if ((field.kind === "string" || textual) && field.maxLength === undefined) {
    fail("needs sh:maxLength.");
  }
  if (field.kind === "iri" && field.iri === undefined) {
    fail('needs an IRI rule: sh:pattern "^https?://" or "^mailto:".');
  }
}

/**
 * The shapes with each field bounded as its kind's bounds say: every
 * kind has a `<Kind>Bounds` shape, which bounds each field that needs it
 * (checkBounded) and no predicate the kind has no field of. A field of
 * one value that needs no sh:maxCount reads one.
 */
export function withBounds(
  models: readonly ShapeModel[],
  bounds: readonly BoundsModel[],
): ShapeModel[] {
  const byKind = new Map(
    bounds.flatMap((b) => (b.kind === undefined ? [] : [[b.kind, b] as const])),
  );
  const used = new Map<string, Set<string>>();
  const bounded = models.map((model) => {
    const kindBounds = byKind.get(model.shape);
    if (kindBounds === undefined) {
      throw new Error(
        `bounds: "${model.shape}" has no ns/bounds/ document with <#bounds> sh:name "${model.shape.charAt(0).toUpperCase()}${model.shape.slice(1)}Bounds".`,
      );
    }
    const seen = used.get(model.shape) ?? new Set<string>();
    used.set(model.shape, seen);
    const fields = model.fields.map((field): ShapeField => {
      seen.add(field.predicate);
      const own = kindBounds.bounds.get(field.predicate) ?? {};
      // A field of one value that is no text reads one, whatever a
      // version of the kind with several of it is bounded to.
      const single =
        field.cardinality !== "many" && field.kind !== "text" && field.kind !== "anyText";
      const result: ShapeField = { ...field, ...own, ...(single ? { maxCount: 1 } : {}) };
      checkBounded(result, (message) => {
        throw new Error(
          `ns/bounds/${kindBounds.document}: <${field.predicate}> of ${model.name} ${message}`,
        );
      });
      return result;
    });
    return { ...model, fields };
  });
  for (const model of bounds) {
    if (model.kind === undefined) continue;
    const fields = used.get(model.kind);
    if (fields === undefined)
      throw new Error(`ns/bounds/${model.document}: no shape is of kind "${model.kind}".`);
    for (const predicate of model.bounds.keys()) {
      if (!fields.has(predicate)) {
        throw new Error(
          `ns/bounds/${model.document}: no version of "${model.kind}" has <${predicate}>.`,
        );
      }
    }
    const terms = model.terms?.fields.find((field) => fields.has(field.predicate));
    if (terms !== undefined) {
      throw new Error(
        `ns/bounds/${model.document}: <${terms.predicate}> is a field of "${model.kind}", not a term beside it.`,
      );
    }
  }
  return bounded;
}

/** The term shapes of every bounds document, by name. */
export function termModels(bounds: readonly BoundsModel[]): TermsModel[] {
  return bounds
    .flatMap((model) => (model.terms === undefined ? [] : [model.terms]))
    .sort((a, b) => a.name.localeCompare(b.name));
}
