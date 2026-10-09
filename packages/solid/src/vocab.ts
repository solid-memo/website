/**
 * Solid Memo's own vocabulary is generated from ns/vocab/v1.ttl (see
 * docs/vocab.md); the external vocabularies below are not ours to
 * publish and stay hand-written.
 */
export { SM, SM_NS } from "@solid-memo/vocab/vocab.generated";

const SOLID_NS = "http://www.w3.org/ns/solid/terms#";
export const SOLID = {
  oidcIssuer: `${SOLID_NS}oidcIssuer`,
  publicTypeIndex: `${SOLID_NS}publicTypeIndex`,
  privateTypeIndex: `${SOLID_NS}privateTypeIndex`,
  TypeIndex: `${SOLID_NS}TypeIndex`,
  ListedDocument: `${SOLID_NS}ListedDocument`,
  UnlistedDocument: `${SOLID_NS}UnlistedDocument`,
  TypeRegistration: `${SOLID_NS}TypeRegistration`,
  forClass: `${SOLID_NS}forClass`,
  instance: `${SOLID_NS}instance`,
  instanceContainer: `${SOLID_NS}instanceContainer`,
} as const;

export const PIM = {
  preferencesFile: "http://www.w3.org/ns/pim/space#preferencesFile",
  storage: "http://www.w3.org/ns/pim/space#storage",
  Storage: "http://www.w3.org/ns/pim/space#Storage",
} as const;

export const DCTERMS = {
  title: "http://purl.org/dc/terms/title",
  created: "http://purl.org/dc/terms/created",
  /** When a deck's content was last changed, when it says. */
  modified: "http://purl.org/dc/terms/modified",
  /**
   * Before deck format 3: on an imported deck, the library document it
   * was copied from; in the library, the resources a deck was compiled
   * from. Format 3 says prov:wasDerivedFrom for both.
   */
  source: "http://purl.org/dc/terms/source",
  /** A deck's author: a foaf:Agent node (a "Name <email>" literal before deck format 3). */
  creator: "http://purl.org/dc/terms/creator",
  /** Who publishes a catalogue or a library deck: a foaf:Agent. */
  publisher: "http://purl.org/dc/terms/publisher",
  /** When a library release was issued. */
  issued: "http://purl.org/dc/terms/issued",
  /** The licence URL a deck's content is offered under. */
  license: "http://purl.org/dc/terms/license",
  /** A deck's blurb: what it covers, where its content came from. */
  description: "http://purl.org/dc/terms/description",
  /** What a catalogue's licence is, as DCAT-AP asks of it. */
  LicenseDocument: "http://purl.org/dc/terms/LicenseDocument",
  /** On a deck's cards document itself (`<>`): the deck's catalog entry, whose cards it holds. */
  isPartOf: "http://purl.org/dc/terms/isPartOf",
} as const;

export const RDF = {
  type: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
} as const;

export const RDFS = {
  seeAlso: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
} as const;

export const FOAF = {
  isPrimaryTopicOf: "http://xmlns.com/foaf/0.1/isPrimaryTopicOf",
} as const;

export const PROV = {
  /** What a deck was drawn from: in a pod, the library release it was imported from. */
  wasDerivedFrom: "http://www.w3.org/ns/prov#wasDerivedFrom",
} as const;

export const DCAT = {
  /** A catalogue: an instance's catalog.ttl#catalog, the library index. */
  Catalog: "http://www.w3.org/ns/dcat#Catalog",
  /** A dataset: in a pod, a deck (SM.Deck). */
  Dataset: "http://www.w3.org/ns/dcat#Dataset",
  /** A catalogue's datasets: in the library index, the decks' series. */
  dataset: "http://www.w3.org/ns/dcat#dataset",
  /** A catalogue's sub-catalogues: in a pod, the deck groups (SM.DeckGroup) it lists. */
  catalog: "http://www.w3.org/ns/dcat#catalog",
  /** A release's version within its deck: "1", "2", … */
  version: "http://www.w3.org/ns/dcat#version",
} as const;

export const ADMS = {
  /** What changed in a release. */
  versionNotes: "http://www.w3.org/ns/adms#versionNotes",
} as const;

export const SCHEMA = {
  /** A library release that is also a course (docs/courses.md): chapters of steps whose questions are its cards. */
  Course: "https://schema.org/Course",
  /** On a card, beside each sm:distractor: the wrong option, for readers who know schema.org's questions. */
  suggestedAnswer: "https://schema.org/suggestedAnswer",
} as const;
