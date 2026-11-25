// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad } from "@rdfjs/types";

/**
 * The published SHACL profiles Solid Memo data must conform to on top of
 * its own shapes (see docs/validation.md): DCAT-AP for catalogs, decks
 * and their releases, and SKOS for the concept schemes in the
 * vocabulary. The files are vendored verbatim under vendor/ and
 * published with the site; the paths here are relative to its vendor/.
 * Their shapes pick their own targets (sh:targetClass), so a profile
 * checks a whole graph, not one subject.
 */
export const PROFILES = {
  "dcat-ap": ["dcat-ap/3.0.1/dcat-ap-SHACL.ttl"],
  skos: ["skohub/skos.shacl.ttl", "skohub/skos.bestPractice.shacl.ttl"],
} as const satisfies Record<string, readonly string[]>;

export type ProfileName = keyof typeof PROFILES;

/**
 * Descriptions of the terms Solid Memo data points at (EU authority
 * table entries and media types, and Solid Memo's own topics), loaded
 * into the data graph next to the data being checked: a profile's
 * `sh:class` checks look for the type of a value in the data graph, as
 * DCAT-AP expects of its controlled vocabularies. Documents of the
 * vocabulary (ns/vocab/), relative to it.
 */
export const REFERENCE_DATA = ["external.ttl", "topics.ttl"] as const;

const SH_SPARQL = "http://www.w3.org/ns/shacl#sparql";

/**
 * A profile's shapes without its SPARQL-based constraints, which the
 * engine (SHACL Core only) cannot run; the CI cross-check runs them.
 */
export function coreOnly<Q extends Quad>(quads: readonly Q[]): Q[] {
  return quads.filter((quad) => quad.predicate.value !== SH_SPARQL);
}

/**
 * The classes a DCAT-AP shape holds to properties (sh:property) of its
 * own: a subject with one of them, in a document the profile checks, has
 * to have what DCAT-AP asks of that class (a dataset's title, a data
 * service's endpoint). The profile's other shapes ask nothing of a
 * subject (foaf:Document). The CI test holds this list to the vendored
 * profile.
 */
export const DCAT_AP_SHAPED_CLASSES: readonly string[] = [
  "http://purl.org/dc/terms/LicenseDocument",
  "http://purl.org/dc/terms/Location",
  "http://purl.org/dc/terms/PeriodOfTime",
  "http://spdx.org/rdf/terms#Checksum",
  "http://www.w3.org/2004/02/skos/core#Concept",
  "http://www.w3.org/2004/02/skos/core#ConceptScheme",
  "http://www.w3.org/ns/adms#Identifier",
  "http://www.w3.org/ns/dcat#Catalog",
  "http://www.w3.org/ns/dcat#CatalogRecord",
  "http://www.w3.org/ns/dcat#DataService",
  "http://www.w3.org/ns/dcat#Dataset",
  "http://www.w3.org/ns/dcat#DatasetSeries",
  "http://www.w3.org/ns/dcat#Distribution",
  "http://www.w3.org/ns/dcat#Relationship",
  "http://xmlns.com/foaf/0.1/Agent",
];
