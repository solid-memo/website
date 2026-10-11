/**
 * A dereferenced WebID document, modeled independently of any RDF library.
 */
export interface WebIdDocument {
  /** URL of the resource the WebID dereferenced to. */
  url: string;
  subjects: Subject[];
}

export interface Subject {
  url: string;
  properties: Property[];
}

export interface Property {
  predicate: string;
  values: PropertyValue[];
}

export type PropertyValue =
  | { type: "iri"; value: string }
  | { type: "literal"; value: string; dataType: string }
  | { type: "langString"; value: string; language: string }
  | { type: "blankNode"; value: string };
