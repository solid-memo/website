import { RDF_TYPE, localName, objectsOf, parseTurtle, subjectsOfType } from "@solid-memo/turtle/rdf";
import { GENERATED_HEADER } from "./vocab.ts";

/**
 * Solid Memo's SKOS concept schemes (the study directions and invalid
 * data policies in the vocabulary, the topics in its topics document) as the
 * generator sees them, and the domain module rendered from them: each
 * scheme as a constant the app can list, label and map to and from
 * (see docs/vocab.md).
 */

const SKOS = "http://www.w3.org/2004/02/skos/core#";
const DCTERMS = "http://purl.org/dc/terms/";

/** Text by language tag, English first, then the other tags in order. */
export type LangTextModel = Record<string, string>;

export interface ConceptModel {
  iri: string;
  label: LangTextModel;
  definition: LangTextModel;
  notation?: string;
  broader?: string;
}

export interface SchemeModel {
  /** The constant's name, e.g. "STUDY_DIRECTIONS". */
  name: string;
  iri: string;
  title: string;
  definition: string;
  concepts: ConceptModel[];
}

/**
 * Every concept scheme of one Turtle document, its concepts in document
 * order. A concept's label and definition come in every language the
 * scheme's title is in, English always among them.
 */
export function parseConceptSchemes(turtle: string, baseIri: string): SchemeModel[] {
  const quads = parseTurtle(turtle, baseIri);
  const texts = (subject: string, predicate: string): LangTextModel => {
    const byTag = new Map<string, string>();
    for (const o of objectsOf(quads, subject, predicate)) {
      if (o.termType === "Literal" && o.language !== "") byTag.set(o.language, o.value);
    }
    if (!byTag.has("en")) {
      throw new Error(`${baseIri}: <${subject}> has no English ${localName(predicate)}.`);
    }
    const tags = [...byTag.keys()].sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)));
    return Object.fromEntries(tags.map((tag) => [tag, byTag.get(tag)!]));
  };
  const inLanguages = (subject: string, predicate: string, languages: readonly string[]): LangTextModel => {
    const text = texts(subject, predicate);
    const missing = languages.filter((tag) => !(tag in text));
    if (missing.length > 0) {
      throw new Error(`${baseIri}: <${subject}> has no ${localName(predicate)} in ${missing.join(", ")}.`);
    }
    return text;
  };
  const concepts = subjectsOfType(quads, `${SKOS}Concept`);
  return subjectsOfType(quads, `${SKOS}ConceptScheme`).map((iri): SchemeModel => {
    const title = texts(iri, `${DCTERMS}title`);
    const languages = Object.keys(title);
    return {
      name: localName(iri)
        .replace(/\.ttl$/, "")
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toUpperCase(),
      iri,
      title: title.en,
      definition: texts(iri, `${SKOS}definition`).en,
      concepts: concepts
        .filter((concept) =>
          objectsOf(quads, concept, `${SKOS}inScheme`).some((s) => s.value === iri),
        )
        .map((concept): ConceptModel => {
          const notation = objectsOf(quads, concept, `${SKOS}notation`)[0]?.value;
          const broader = objectsOf(quads, concept, `${SKOS}broader`)[0]?.value;
          return {
            iri: concept,
            label: inLanguages(concept, `${SKOS}prefLabel`, languages),
            definition: inLanguages(concept, `${SKOS}definition`, languages),
            ...(notation === undefined ? {} : { notation }),
            ...(broader === undefined ? {} : { broader }),
          };
        }),
    };
  });
}

/** Throws unless every concept of the documents belongs to one of their schemes. */
export function checkEveryConceptInAScheme(
  documents: readonly { turtle: string; baseIri: string }[],
  schemes: readonly SchemeModel[],
): void {
  const placed = new Set(schemes.flatMap((s) => s.concepts.map((c) => c.iri)));
  for (const { turtle, baseIri } of documents) {
    const quads = parseTurtle(turtle, baseIri);
    for (const q of quads) {
      if (
        q.predicate.value === RDF_TYPE &&
        q.object.value === `${SKOS}Concept` &&
        !placed.has(q.subject.value)
      ) {
        throw new Error(`${baseIri}: <${q.subject.value}> is in none of the concept schemes.`);
      }
    }
  }
}

/**
 * An entry of an EU authority table that Solid Memo data may point at,
 * as ns/vocab/external.ttl extracts it: its IRI, its code (the last
 * segment of its IRI, "ENG") and its English label. The table is the
 * authority for its labels, so the extract has no other language.
 */
export interface ReferenceModel {
  iri: string;
  code: string;
  label: string;
}

/** The reference schemes rendered, each as a constant: its name and the scheme's IRI. */
export interface ReferenceScheme {
  name: string;
  iri: string;
  definition: string;
}

/** The concepts of a reference scheme (`scheme`, its IRI) in one Turtle document, in document order. */
export function parseReferenceConcepts(turtle: string, baseIri: string, scheme: string): ReferenceModel[] {
  const quads = parseTurtle(turtle, baseIri);
  return subjectsOfType(quads, `${SKOS}Concept`)
    .filter((concept) => objectsOf(quads, concept, `${SKOS}inScheme`).some((s) => s.value === scheme))
    .map((iri) => {
      const label = objectsOf(quads, iri, `${SKOS}prefLabel`).find((o) => o.termType === "Literal" && o.language === "en");
      if (label === undefined) throw new Error(`${baseIri}: <${iri}> has no English prefLabel.`);
      return { iri, code: iri.slice(iri.lastIndexOf("/") + 1), label: label.value };
    });
}

/** The domain module: one constant per scheme, then one per reference scheme. */
export function renderConcepts(
  sources: readonly string[],
  schemes: readonly SchemeModel[],
  references: readonly { scheme: ReferenceScheme; concepts: readonly ReferenceModel[] }[] = [],
): string {
  const lines = [
    GENERATED_HEADER(sources.join(", ")),
    "/** Text by language tag (lower case), one of them English. */",
    "export type ConceptText = Readonly<Record<string, string>>;",
    "",
    "/** A concept of one of Solid Memo's SKOS concept schemes (see docs/vocab.md). */",
    "export interface Concept {",
    "  readonly iri: string;",
    "  /** skos:prefLabel, in every language of the scheme. */",
    "  readonly label: ConceptText;",
    "  /** skos:definition, in every language of the scheme. */",
    "  readonly definition: ConceptText;",
    "  /** skos:notation: the concept's code, where the scheme gives one. */",
    "  readonly notation?: string;",
    "  /** skos:broader: the concept above this one, for a concept below the top. */",
    "  readonly broader?: string;",
    "}",
    "",
    "export interface ConceptScheme {",
    "  readonly iri: string;",
    "  readonly title: string;",
    "  readonly concepts: readonly Concept[];",
    "}",
    "",
  ];
  for (const scheme of schemes) {
    lines.push(`/** ${scheme.definition} */`);
    lines.push(`export const ${scheme.name} = {`);
    lines.push(`  iri: ${JSON.stringify(scheme.iri)},`);
    lines.push(`  title: ${JSON.stringify(scheme.title)},`);
    lines.push("  concepts: [");
    for (const concept of scheme.concepts) {
      const parts = [
        `iri: ${JSON.stringify(concept.iri)}`,
        `label: ${renderText(concept.label)}`,
        `definition: ${renderText(concept.definition)}`,
        ...(concept.notation === undefined ? [] : [`notation: ${JSON.stringify(concept.notation)}`]),
        ...(concept.broader === undefined ? [] : [`broader: ${JSON.stringify(concept.broader)}`]),
      ];
      lines.push("    {");
      for (const part of parts) lines.push(`      ${part},`);
      lines.push("    },");
    }
    lines.push("  ],", "} as const satisfies ConceptScheme;", "");
  }
  if (references.length > 0) {
    lines.push(
      "/** An entry of an EU authority table Solid Memo data may point at (ns/vocab/external.ttl): its IRI, its code and its English label. */",
      "export interface ReferenceConcept {",
      "  readonly iri: string;",
      "  readonly code: string;",
      "  readonly label: string;",
      "}",
      "",
    );
  }
  for (const { scheme, concepts } of references) {
    lines.push(`/** ${scheme.definition} */`);
    lines.push(`export const ${scheme.name}: readonly ReferenceConcept[] = [`);
    for (const concept of concepts) {
      lines.push(`  { iri: ${JSON.stringify(concept.iri)}, code: ${JSON.stringify(concept.code)}, label: ${JSON.stringify(concept.label)} },`);
    }
    lines.push("];", "");
  }
  return lines.join("\n");
}

/** A language map as an object literal: { en: "Red", sv: "Röd" }. */
function renderText(text: LangTextModel): string {
  const entries = Object.entries(text).map(
    ([tag, value]) => `${/^[a-z]+$/.test(tag) ? tag : JSON.stringify(tag)}: ${JSON.stringify(value)}`,
  );
  return `{ ${entries.join(", ")} }`;
}
