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
  /** Absolute IRI of the sh:NodeShape. */
  shapeIri: string;
  /** Path of the shape document under the published shapes/ folder. */
  shapeDocument: string;
  context: ShapeContext;
  fields: readonly FieldDescriptor[];
  /** Phantom: ties the descriptor to its record type. Never set. */
  readonly __record?: T;
}
