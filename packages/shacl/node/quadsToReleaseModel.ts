import type { Quad, Quad_Object } from "n3";
import {
  DCAT_NS,
  DCTERMS_NS,
  SCHEMA_NS,
  type ReleaseDistractor,
  type ReleaseModel,
  type ReleaseStatement,
  type ReleaseTerm,
  type ReleaseText,
} from "@solid-memo/domain/release/releaseModel";
import { provenanceOf } from "@solid-memo/domain/release/provenanceRules";
import { RDF_TYPE, subjectsOfType } from "@solid-memo/turtle/rdf";
import { SM_NS } from "@solid-memo/vocab/tooling/vocab";

const ADMS = "http://www.w3.org/ns/adms#";
const PROV = "http://www.w3.org/ns/prov#";
const OWL_DEPRECATED = "http://www.w3.org/2002/07/owl#deprecated";

/** A term as the release rules read it. */
export function termOf(object: Quad_Object): ReleaseTerm {
  switch (object.termType) {
    case "Literal":
      return { kind: "literal", value: object.value, language: object.language, datatype: object.datatype.value };
    case "BlankNode":
      return { kind: "blank", value: object.value };
    default:
      return { kind: "iri", value: object.value };
  }
}

/**
 * The release at `url` as the release rules read it
 * (@solid-memo/domain/release/releaseModel), from its quads: what it
 * states of itself, its cards, chapters, steps and distractors, each
 * retired when it states owl:deprecated true, and how it was made.
 * A release read alone does not say which of its making an earlier
 * version's is (a next version moves it to its own address), so none is
 * `carried`: the provenance rules (provenanceProblems), which hold only
 * a release's own making to its counts, read a draft's model
 * (draftModel.ts), never this one.
 */
export function quadsToReleaseModel(quads: readonly Quad[], url: string): ReleaseModel {
  // Each subject's statements, so a release of thousands of cards is read in one pass.
  const bySubject = new Map<string, Quad[]>();
  for (const q of quads) {
    const list = bySubject.get(q.subject.value);
    if (list) list.push(q);
    else bySubject.set(q.subject.value, [q]);
  }
  const objectsOf = (subject: string, predicate: string) =>
    (bySubject.get(subject) ?? []).filter((q) => q.predicate.value === predicate).map((q) => q.object);
  const objects = (subject: string, predicate: string) => objectsOf(subject, predicate).map(termOf);
  const texts = (subject: string, predicate: string) =>
    objects(subject, predicate).filter((term): term is ReleaseText => term.kind === "literal");
  const named = (subject: string, predicate: string) =>
    objectsOf(subject, predicate)
      .filter((o) => o.termType === "NamedNode")
      .map((o) => o.value);
  const positions = (subject: string) => texts(subject, `${SCHEMA_NS}position`).map((text) => text.value);
  const retired = new Set(
    quads
      .filter((q) => q.predicate.value === OWL_DEPRECATED && q.object.termType === "Literal" && q.object.value === "true")
      .map((q) => q.subject.value),
  );
  const statements = (predicate: string): ReleaseStatement[] =>
    quads.filter((q) => q.predicate.value === predicate).map((q) => ({ subject: q.subject.value, object: termOf(q.object) }));
  const typed = (type: string) => [
    ...new Set(quads.filter((q) => q.predicate.value === RDF_TYPE && q.object.value === type).map((q) => q.subject.value)),
  ];
  const sm = (name: string) => `${SM_NS}${name}`;

  const cards = subjectsOfType(quads, sm("Card")).map((iri) => ({
    iri,
    retired: retired.has(iri),
    front: texts(iri, sm("front")),
    back: texts(iri, sm("back")),
    backLabel: texts(iri, sm("backLabel")),
    frontNote: texts(iri, sm("frontNote")),
    backNote: texts(iri, sm("backNote")),
    distractors: objects(iri, sm("distractor")),
  }));
  const distractor = (iri: string, isTyped: boolean): ReleaseDistractor => ({
    iri,
    typed: isTyped,
    retired: retired.has(iri),
    text: texts(iri, sm("distractorText")),
    note: texts(iri, sm("distractorNote")),
  });
  const distractors = subjectsOfType(quads, sm("Distractor")).map((iri) => distractor(iri, true));
  // What a card names as its distractor without its being one: its text is still its card's to check.
  const known = new Set(distractors.map((d) => d.iri));
  for (const option of cards.flatMap((card) => card.distractors)) {
    if (option.kind !== "literal" && !known.has(option.value)) {
      known.add(option.value);
      distractors.push(distractor(option.value, false));
    }
  }
  const generating = new Set(objectsOf(url, `${PROV}wasGeneratedBy`).map((o) => o.value));
  const sources = objects(url, `${PROV}wasDerivedFrom`);

  return {
    url,
    decks: typed(sm("Deck")),
    types: objectsOf(url, RDF_TYPE).map((o) => o.value),
    version: objects(url, `${DCAT_NS}version`),
    title: texts(url, `${DCTERMS_NS}title`),
    description: texts(url, `${DCTERMS_NS}description`),
    keywords: objects(url, `${DCAT_NS}keyword`),
    themes: objects(url, `${DCAT_NS}theme`),
    languages: objects(url, `${DCTERMS_NS}language`),
    issued: texts(url, `${DCTERMS_NS}issued`),
    modified: texts(url, `${DCTERMS_NS}modified`),
    versionNotes: texts(url, `${ADMS}versionNotes`),
    studyDirection: objects(url, sm("studyDirection")),
    inSeries: objects(url, `${DCAT_NS}inSeries`),
    isVersionOf: objects(url, `${DCAT_NS}isVersionOf`),
    publisher: objects(url, `${DCTERMS_NS}publisher`),
    prev: objects(url, `${DCAT_NS}prev`),
    previousVersion: objects(url, `${DCAT_NS}previousVersion`),
    distribution: objects(url, `${DCAT_NS}distribution`),
    licence: objects(url, `${DCTERMS_NS}license`),
    sources,
    activities: typed(`${PROV}Activity`).map((iri) => ({ iri, generating: generating.has(iri) })),
    ...provenanceOf(objects, [...generating], sources),
    cards,
    chapters: subjectsOfType(quads, sm("Chapter")).map((iri) => ({
      iri,
      retired: retired.has(iri),
      title: texts(iri, `${DCTERMS_NS}title`),
      description: texts(iri, `${DCTERMS_NS}description`),
      isPartOf: named(iri, `${SCHEMA_NS}isPartOf`),
      positions: positions(iri),
      reviewQuestions: named(iri, sm("reviewQuestion")),
    })),
    steps: subjectsOfType(quads, sm("Step")).map((iri) => ({
      iri,
      retired: retired.has(iri),
      theory: texts(iri, sm("theory")),
      isPartOf: named(iri, `${SCHEMA_NS}isPartOf`),
      positions: positions(iri),
      checkedBy: named(iri, sm("checkedBy")),
    })),
    distractors,
    distractorLinks: statements(sm("distractor")),
    textFormats: statements(sm("textFormat")),
  };
}
