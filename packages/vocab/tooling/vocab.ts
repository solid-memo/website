import { RDF_TYPE, localName, objectsOf, parseTurtle, subjectsOfType } from "@solid-memo/turtle/rdf";
import { VOCAB_BASE } from "../src/ns.ts";

/**
 * The vocabulary document (ns/vocab/v1.ttl, published at VOCAB_IRI) as
 * the generators see it: the ontology's version and change note, and
 * every term with its annotations, in document order. Terms are classes
 * and properties, and the SKOS concept schemes of the vocabulary with
 * their concepts.
 */

export const VOCAB_IRI = `${VOCAB_BASE}v1.ttl`;
export const SM_NS = `${VOCAB_IRI}#`;
const OWL = "http://www.w3.org/2002/07/owl#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const SKOS = "http://www.w3.org/2004/02/skos/core#";
const DCTERMS = "http://purl.org/dc/terms/";
const TERM_KINDS: Record<string, VocabTerm["kind"]> = {
  [`${OWL}Class`]: "class",
  [`${OWL}DatatypeProperty`]: "property",
  [`${OWL}ObjectProperty`]: "property",
  [`${SKOS}ConceptScheme`]: "scheme",
  [`${SKOS}Concept`]: "concept",
};

export interface VocabTerm {
  /** Local name, e.g. "frontImage". */
  name: string;
  iri: string;
  kind: "class" | "property" | "scheme" | "concept";
  /** rdfs:label; a scheme's dcterms:title, a concept's skos:prefLabel. */
  label: string;
  /** rdfs:comment; a scheme's or concept's skos:definition. */
  comment: string;
  /** rdfs:range for a property: an xsd datatype or rdfs:Resource. */
  range?: string;
  /** rdfs:domain for a property, when it has one class. */
  domain?: string;
  /** When the term arrived (skos:historyNote). */
  history: string;
  /** owl:deprecated: kept for data that uses it, not for new data. */
  deprecated?: true;
  /** dcterms:isReplacedBy, for a deprecated term. */
  replacedBy?: string;
}

export interface Vocab {
  title: string;
  description: string;
  version: string;
  changeNote: string;
  terms: VocabTerm[];
}

export function parseVocab(turtle: string): Vocab {
  const quads = parseTurtle(turtle, VOCAB_IRI);
  const literal = (subject: string, predicate: string): string | undefined =>
    objectsOf(quads, subject, predicate).find((o) => o.termType === "Literal")
      ?.value;
  const required = (subject: string, predicate: string): string => {
    const value = literal(subject, predicate);
    if (value === undefined) {
      throw new Error(`vocab: <${subject}> has no ${localName(predicate)}.`);
    }
    return value;
  };
  const terms = quads
    .filter((q) => q.predicate.value === RDF_TYPE && q.object.value in TERM_KINDS)
    .map((q): VocabTerm => {
      const iri = q.subject.value;
      if (!iri.startsWith(SM_NS)) {
        throw new Error(`vocab: <${iri}> is outside the namespace ${SM_NS}.`);
      }
      const kind = TERM_KINDS[q.object.value];
      const range = objectsOf(quads, iri, `${RDFS}range`)[0]?.value;
      if (kind === "property" && range === undefined) {
        throw new Error(`vocab: <${iri}> has no range.`);
      }
      const domain = objectsOf(quads, iri, `${RDFS}domain`)[0]?.value;
      const deprecated = literal(iri, `${OWL}deprecated`) === "true";
      const replacedBy = objectsOf(quads, iri, `${DCTERMS}isReplacedBy`)[0]?.value;
      const [label, comment] =
        kind === "scheme"
          ? [`${DCTERMS}title`, `${SKOS}definition`]
          : kind === "concept"
            ? [`${SKOS}prefLabel`, `${SKOS}definition`]
            : [`${RDFS}label`, `${RDFS}comment`];
      return {
        name: iri.slice(SM_NS.length),
        iri,
        kind,
        label: required(iri, label),
        comment: required(iri, comment),
        ...(range === undefined ? {} : { range }),
        ...(domain === undefined ? {} : { domain }),
        history: required(iri, `${SKOS}historyNote`),
        ...(deprecated ? { deprecated: true as const } : {}),
        ...(replacedBy === undefined ? {} : { replacedBy }),
      };
    });
  if (subjectsOfType(quads, `${OWL}Ontology`)[0] !== VOCAB_IRI) {
    throw new Error(`vocab: expected <${VOCAB_IRI}> to be the owl:Ontology.`);
  }
  return {
    title: required(VOCAB_IRI, `${DCTERMS}title`),
    description: required(VOCAB_IRI, `${DCTERMS}description`),
    version: required(VOCAB_IRI, `${OWL}versionInfo`),
    changeNote: required(VOCAB_IRI, `${SKOS}changeNote`),
    terms,
  };
}

export const GENERATED_HEADER = (source: string): string =>
  `/* Generated from ${source} by \`npm run generate\`. Do not edit: change the source and regenerate. */\n`;

/** The TypeScript module of `SM` constants the app reads and writes with. */
export function renderVocabConstants(vocab: Vocab): string {
  const lines = [
    GENERATED_HEADER("ns/vocab/v1.ttl"),
    `/** Solid Memo's own vocabulary, version ${vocab.version} (see docs/vocab.md). */`,
    `export const SM_NS = ${JSON.stringify(SM_NS)};`,
    "",
    "export const SM = {",
  ];
  for (const term of vocab.terms) {
    const deprecation =
      term.deprecated === undefined
        ? ""
        : ` @deprecated${term.replacedBy === undefined ? "" : ` Use ${localName(term.replacedBy)}.`}`;
    lines.push(`  /** ${term.comment} (${term.history})${deprecation} */`);
    lines.push(`  ${term.name}: \`\${SM_NS}${term.name}\`,`);
  }
  lines.push("} as const;", "");
  return lines.join("\n");
}
