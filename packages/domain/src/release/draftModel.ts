import type { LangText, LangTexts } from "@solid-memo/vocab/types.generated";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { PROV, RDF_TYPE, SCHEMA_COURSE, type DraftNode, type ReleaseDraft } from "./releaseDraft.ts";
import {
  DCAT_NS,
  type ReleaseDistractor,
  type ReleaseModel,
  type ReleaseStatement,
  type ReleaseTerm,
  type ReleaseText,
} from "./releaseModel.ts";
import { moved } from "./releaseToDraft.ts";

const LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";
const XSD_DATE_TIME = "http://www.w3.org/2001/XMLSchema#dateTime";

/**
 * A draft as the release rules read a release (releaseModel.ts): the
 * release it will be, at `url` (its own, by default), every subject of
 * it moved there. It is read from the records and statements the draft
 * keeps, as a release's quads are read in the library's command
 * (packages/shacl/node/quadsToReleaseModel.ts): what a shape describes
 * from its record, how the release was made, and what is stated beyond
 * a shape, from its statements.
 */
export function draftReleaseModel(draft: ReleaseDraft, url: string = draft.url): ReleaseModel {
  const at = (iri: string) => moved(iri, draft.url, url);
  const iri = (value: string): ReleaseTerm => ({ kind: "iri", value: at(value) });
  const iris = (values: readonly string[]) => values.map(iri);
  const one = (value: string | undefined) => (value === undefined ? [] : [iri(value)]);
  const literal = (value: string | undefined, datatype: string): ReleaseText[] =>
    value === undefined ? [] : [{ kind: "literal", value, language: "", datatype }];
  const texts = (text: LangText | undefined): ReleaseText[] =>
    Object.entries(text ?? {}).map(([language, value]) => ({ kind: "literal", value, language, datatype: language === "" ? XSD_STRING : LANG_STRING }));
  const keywords = (keyword: LangTexts): ReleaseText[] =>
    Object.entries(keyword).flatMap(([language, values]) => values.map((value) => texts({ [language]: value })[0]!));
  // The statements beyond the records, every IRI moved.
  const triples = draft.triples.map(({ subject, predicate, object }) => ({
    subject: at(subject),
    predicate,
    object: object.kind === "iri" ? iri(object.value) : object,
  }));
  const statements = (predicate: string): ReleaseStatement[] =>
    triples.filter((triple) => triple.predicate === predicate).map(({ subject, object }) => ({ subject, object }));
  const typed = (type: string) => [...new Set(statements(RDF_TYPE).filter(({ object }) => object.value === type).map(({ subject }) => subject))];
  const subjectAt = (node: DraftNode<{ deprecated?: boolean }>) => ({ iri: at(`${draft.url}#${node.id}`), retired: node.data.deprecated === true });
  const { root } = draft;
  const generating = new Set(statements(`${PROV}wasGeneratedBy`).filter(({ subject }) => subject === url).map(({ object }) => object.value));

  const cards = draft.cards.map((node) => ({
    ...subjectAt(node),
    front: texts(node.data.front),
    back: texts(node.data.back),
    backLabel: texts(node.data.backLabel),
    frontNote: texts(node.data.frontNote),
    backNote: texts(node.data.backNote),
    distractors: iris(node.data.distractor),
  }));
  const distractors: ReleaseDistractor[] = draft.distractors.map((node) => ({
    ...subjectAt(node),
    typed: true,
    text: texts(node.data.text),
    note: texts(node.data.note),
  }));
  // What a card names as its distractor without its being one: its text is still its card's to check.
  const known = new Set(distractors.map((d) => d.iri));
  for (const option of cards.flatMap((card) => card.distractors)) {
    if (!known.has(option.value)) {
      known.add(option.value);
      distractors.push({ iri: option.value, typed: false, retired: false, text: [], note: [] });
    }
  }
  const formatted = [...draft.cards, ...draft.chapters, ...draft.steps].flatMap((node): ReleaseStatement[] =>
    node.data.textFormat === undefined ? [] : [{ subject: subjectAt(node).iri, object: iri(node.data.textFormat) }],
  );

  return {
    url,
    decks: [url, ...typed(SM.Deck).filter((deck) => deck !== url)],
    types: [SM.Deck, `${DCAT_NS}Dataset`, ...(draft.course ? [SCHEMA_COURSE] : []), ...otherTypes(statements(RDF_TYPE), url)],
    version: literal(root.version, XSD_STRING),
    title: texts(root.title),
    description: texts(root.description),
    keywords: keywords(root.keyword),
    themes: iris(root.theme),
    languages: iris(root.language),
    issued: literal(root.issued, XSD_DATE_TIME),
    modified: literal(root.modified, XSD_DATE_TIME),
    versionNotes: literal(root.versionNotes, XSD_STRING),
    studyDirection: [iri(root.studyDirection)],
    inSeries: one(root.inSeries),
    isVersionOf: one(root.isVersionOf),
    publisher: one(root.publisher),
    prev: one(root.prev),
    previousVersion: one(root.previousVersion),
    distribution: iris(root.distribution),
    licence: one(root.license),
    sources: iris(root.wasDerivedFrom),
    activities: typed(`${PROV}Activity`).map((activity) => ({ iri: activity, generating: generating.has(activity) })),
    cards,
    chapters: draft.chapters.map((node) => ({
      ...subjectAt(node),
      title: texts(node.data.title),
      description: texts(node.data.description),
      isPartOf: one(node.data.course).map((term) => term.value),
      positions: node.data.position === undefined ? [] : [String(node.data.position)],
      reviewQuestions: node.data.reviewQuestion.map(at),
    })),
    steps: draft.steps.map((node) => ({
      ...subjectAt(node),
      theory: texts(node.data.theory),
      isPartOf: one(node.data.chapter).map((term) => term.value),
      positions: node.data.position === undefined ? [] : [String(node.data.position)],
      checkedBy: node.data.checkedBy.map(at),
    })),
    distractors,
    distractorLinks: [
      ...cards.flatMap((card) => card.distractors.map((object) => ({ subject: card.iri, object }))),
      ...statements(SM.distractor),
    ],
    textFormats: [...formatted, ...statements(SM.textFormat)],
  };
}

/** The other types the statements give the release: those its record does not. */
function otherTypes(types: readonly ReleaseStatement[], url: string): string[] {
  const own = new Set<string>([SM.Deck, `${DCAT_NS}Dataset`, SCHEMA_COURSE]);
  return types.filter(({ subject, object }) => subject === url && !own.has(object.value)).map(({ object }) => object.value);
}
