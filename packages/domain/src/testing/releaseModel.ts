import {
  emptyReleaseModel,
  type ReleaseCard,
  type ReleaseChapter,
  type ReleaseDistractor,
  type ReleaseModel,
  type ReleaseStep,
  type ReleaseTerm,
  type ReleaseText,
} from "../release/releaseModel.ts";

/**
 * Releases as plain data, for the tests of the release rules: a release
 * at RELEASE, its subjects fragments of it, every field empty unless a
 * test says.
 */
export const RELEASE = "https://solid-memo.com/decks/solid/v1.ttl";
export const at = (id: string) => `${RELEASE}#${id}`;

const LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";
const STRING = "http://www.w3.org/2001/XMLSchema#string";

/** A literal, language-tagged unless `language` is "". */
export function text(value: string, language = "en"): ReleaseText {
  return { kind: "literal", value, language, datatype: language === "" ? STRING : LANG_STRING };
}

export function iri(value: string): ReleaseTerm {
  return { kind: "iri", value };
}

export function card(id: string, extra: Partial<ReleaseCard> = {}): ReleaseCard {
  return { iri: at(id), retired: false, front: [], back: [text(`Answer ${id}`)], backLabel: [], frontNote: [], backNote: [], distractors: [], ...extra };
}

export function chapter(id: string, position: number, extra: Partial<ReleaseChapter> = {}): ReleaseChapter {
  return { iri: at(id), retired: false, title: [], description: [], isPartOf: [RELEASE], positions: [String(position)], reviewQuestions: [], ...extra };
}

export function step(id: string, of: string, position: number, checkedBy: readonly string[], extra: Partial<ReleaseStep> = {}): ReleaseStep {
  return { iri: at(id), retired: false, theory: [], isPartOf: [at(of)], positions: [String(position)], checkedBy: checkedBy.map(at), ...extra };
}

export function distractor(id: string, extra: Partial<ReleaseDistractor> = {}): ReleaseDistractor {
  return { iri: at(id), typed: true, retired: false, text: [text(`Wrong ${id}`)], note: [], ...extra };
}

/** A model at RELEASE with `extra`. */
export function model(extra: Partial<ReleaseModel> = {}): ReleaseModel {
  return { ...emptyReleaseModel(RELEASE), ...extra };
}

/** A course: the release typed schema:Course, studied front to back, with these subjects; distractor links follow the cards'. */
export function course(subjects: { cards?: ReleaseCard[]; chapters?: ReleaseChapter[]; steps?: ReleaseStep[]; distractors?: ReleaseDistractor[] }): ReleaseModel {
  const cards = subjects.cards ?? [];
  return model({
    types: ["https://schema.org/Course"],
    studyDirection: [iri("https://solid-memo.com/ns/vocab/v1.ttl#frontToBack")],
    cards,
    chapters: subjects.chapters ?? [],
    steps: subjects.steps ?? [],
    distractors: subjects.distractors ?? [],
    distractorLinks: cards.flatMap((c) => c.distractors.map((object) => ({ subject: c.iri, object }))),
  });
}

/** A card a course asks, with its two distractors. */
export function asked(id: string): { card: ReleaseCard; distractors: ReleaseDistractor[] } {
  return {
    card: card(id, { distractors: [iri(at(`${id}-a`)), iri(at(`${id}-b`))] }),
    distractors: [distractor(`${id}-a`), distractor(`${id}-b`)],
  };
}
