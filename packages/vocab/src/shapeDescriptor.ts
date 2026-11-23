// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ShapeName } from "./types.generated.ts";

/**
 * What a shape says about a class at one version, in the form the generic
 * reader and writer (infrastructure/solid/records.ts) and the validators
 * work from. Instances are generated from shapes/**.ttl into
 * shapes.generated.ts; see docs/shapes.md.
 */

/** How a field's RDF term is read and written. */
export type TermKind =
  | "string"
  | "integer"
  | "decimal"
  | "dateTime"
  | "boolean"
  | "iri"
  | "enum"
  /** An IRI from a fixed list (sh:in over IRIs): a concept of a SKOS scheme. */
  | "iriEnum"
  /**
   * Language-tagged literals (rdf:langString): a LangText, at most one per
   * language; with cardinality "many", a LangTexts of several per language.
   */
  | "text"
  /**
   * Untagged text (xsd:string), its language unknown, or language-tagged
   * text: a LangText, at most one per language and never both, whose
   * empty tag ("") holds the untagged text; with cardinality "many", a
   * LangTexts of several per language, untagged ones under "".
   */
  | "anyText";

/**
 * "one" = exactly one; "optional" = at most one; "many" = any number (for
 * text: any number per language, which sh:uniqueLang true limits to one).
 */
export type Cardinality = "one" | "optional" | "many";

export interface FieldDescriptor {
  /** Property name on the generated record type. */
  name: string;
  /** Predicate IRI. */
  predicate: string;
  kind: TermKind;
  cardinality: Cardinality;
  /** kind "enum" and "iriEnum" only: the allowed literals or IRIs, in shape order. */
  values?: readonly string[];
  /**
   * The most values read (ns/bounds/): 1 for a field of one value, else
   * as many as its bounds state; a text's are its languages (one value
   * each), or with cardinality "many" all its values together. The
   * reader stops there.
   */
  maxCount: number;
  /** kind "string", "text" and "anyText": the longest value read, in characters; a longer one is not read. */
  maxLength?: number;
  /** kind "iri": which IRIs are read, http(s) URLs or mailto: ones; any other is not. */
  iri?: "http" | "mailbox";
}

/**
 * The terms read of a subject beside its record, or of a subject no
 * shape describes (a WebID profile): a small shape of their own in
 * ns/bounds/, read as a record is, every value bounded. A missing term
 * is absent from the record (or an empty list), never a misfit.
 */
export interface TermsDescriptor<T = unknown> {
  /** sh:name, e.g. "DeckTerms". */
  name: string;
  /** Path of the bounds document under ns/bounds/. */
  document: string;
  fields: readonly FieldDescriptor[];
  /** Phantom: ties the descriptor to its record type. Never set. */
  readonly __record?: T;
}

/**
 * Where a subject of the shape's class lives: an instance in a pod, a
 * published release (the deck library, or one published in a pod), or
 * a release's draft being written in a pod; "any" fits all three.
 */
export type ShapeContext = "pod" | "library" | "draft" | "any";

export interface ShapeDescriptor<T = unknown> {
  shape: ShapeName;
  version: number;
  /** The rdf:type a conforming subject has, by which its shape is picked. */
  targetClass: string;
  /** Further rdf:types a conforming subject has, which the writer adds. */
  additionalTypes: readonly string[];
  /** Predicates a conforming subject never has, which the writer removes. */
  absent: readonly string[];
  /**
   * Values a conforming subject has (sh:hasValue with sh:maxCount 1 on
   * a predicate other than rdf:type), which the writer adds. They tell
   * the shape from others of its class: a subject is checked against a
   * shape with fixed values only when it has them all, and then never
   * against one without (an FSRS-6 review state by its sm:scheduler).
   */
  fixedValues: readonly { readonly predicate: string; readonly value: string }[];
  /** Absolute IRI of the sh:NodeShape. */
  shapeIri: string;
  /** Path of the shape document under the published shapes/ folder. */
  shapeDocument: string;
  context: ShapeContext;
  fields: readonly FieldDescriptor[];
  /** Phantom: ties the descriptor to its record type. Never set. */
  readonly __record?: T;
}
