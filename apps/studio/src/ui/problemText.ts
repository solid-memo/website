import { SM } from "@solid-memo/vocab/vocab.generated";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import { chapterOfStep, draftCardOf } from "@solid-memo/domain/release/draftOutline";
import { idIn, liveSteps, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import type { ReleaseTerm } from "@solid-memo/domain/release/releaseModel";
import { cardName } from "@solid-memo/ui/DataText";
import type { I18n, MessageKey } from "@solid-memo/ui/i18n";
import { problemText, type MarkdownProblem } from "@solid-memo/ui/MarkdownEditing";

/**
 * The release check's problems in words (docs/studio.md, The release
 * check): each problem's code as the reader's language says it
 * (`studio.problem.<code>`), the subjects it names by their ids in the
 * draft, the field it is in by its name (`studio.field.<name>`).
 */

const DCTERMS = "http://purl.org/dc/terms/";
const DCAT = "http://www.w3.org/ns/dcat#";
const SCHEMA = "https://schema.org/";

/** The name of each field a problem may be in, by its predicate. */
const FIELDS: Readonly<Record<string, string>> = {
  [`${DCTERMS}title`]: "title",
  [`${DCTERMS}description`]: "description",
  [`${DCTERMS}publisher`]: "publisher",
  [`${DCTERMS}license`]: "license",
  [`${DCAT}version`]: "version",
  [`${DCAT}inSeries`]: "inSeries",
  [`${DCAT}isVersionOf`]: "isVersionOf",
  [`${DCAT}distribution`]: "distribution",
  [`${DCAT}theme`]: "theme",
  [`${DCAT}keyword`]: "keyword",
  [`${DCAT}prev`]: "prev",
  [`${DCAT}previousVersion`]: "previousVersion",
  [SM.studyDirection]: "studyDirection",
  [SM.theory]: "theory",
  [SM.checkedBy]: "checkedBy",
  [`${SCHEMA}isPartOf`]: "isPartOf",
  [`${SCHEMA}position`]: "position",
  [SM.reviewQuestion]: "reviewQuestion",
  [SM.front]: "front",
  [SM.back]: "back",
  [SM.backLabel]: "backLabel",
  [SM.frontNote]: "frontNote",
  [SM.backNote]: "backNote",
  [SM.distractor]: "distractor",
  [SM.distractorText]: "distractorText",
  [SM.distractorNote]: "distractorNote",
  [SM.textFormat]: "textFormat",
  ["http://www.w3.org/ns/adms#versionNotes"]: "versionNotes",
  [`${DCTERMS}language`]: "language",
  [`${DCTERMS}creator`]: "creator",
  ["http://www.w3.org/2000/01/rdf-schema#comment"]: "comment",
  ["http://www.w3.org/ns/prov#wasDerivedFrom"]: "wasDerivedFrom",
};

/** A field by its name in the reader's language; one without a name by its IRI. */
export function fieldName(field: string | undefined, t: I18n["t"]): string {
  const name = field === undefined ? undefined : FIELDS[field];
  return name === undefined ? (field ?? "") : t(`studio.field.${name}` as MessageKey);
}

/** A subject the problem names, by its id when it is the draft's (`#q-1`), else by its IRI. */
function named(draft: ReleaseDraft, iri: string): string {
  if (iri === draft.url) return "<>";
  const id = idIn(draft, iri);
  return id === null ? `<${iri}>` : `#${id}`;
}

/**
 * What the problem is about, by name: the release itself, a chapter by
 * its title, a step by its place, a question by its front, a wrong
 * option by its id; anything else by its id or IRI.
 */
export function subjectName(draft: ReleaseDraft, subject: string, i18n: Pick<I18n, "t" | "readerText">): string {
  const { t, readerText } = i18n;
  if (subject === draft.url) return t("studio.check.release");
  const id = idIn(draft, subject);
  if (id === null) return subject;
  const chapter = draft.chapters.find((node) => node.id === id);
  if (chapter !== undefined) return chapter.data.title === undefined ? id : readerText(chapter.data.title);
  if (draft.steps.some((node) => node.id === id)) {
    const of = chapterOfStep(draft, id);
    const number = of === null ? -1 : liveSteps(draft, of).findIndex((node) => node.id === id);
    return number === -1 ? id : t("studio.chapter.step", { number: number + 1 });
  }
  const card = draftCardOf(draft, id);
  if (card !== null) return cardName({ ...card.content, id }, readerText);
  if (draft.distractors.some((node) => node.id === id)) return t("studio.check.distractor", { id });
  return `#${id}`;
}

/** A problem in the reader's language, after the name of what it is in. */
export function problemMessage(problem: ReleaseProblem, draft: ReleaseDraft, i18n: Pick<I18n, "t" | "languageParts" | "violationText">): string {
  const { t, languageParts, violationText } = i18n;
  const list = (iris: readonly string[]) => iris.map((iri) => named(draft, iri)).join(", ");
  const value = (term: ReleaseTerm) => (term.kind === "literal" ? `"${term.value}"` : named(draft, term.value));
  const values = (terms: readonly ReleaseTerm[]) => (terms.length === 0 ? t("studio.check.nothing") : terms.map(value).join(", "));
  const language = (tag: string) => (tag === "" ? t("studio.check.untagged") : languageParts(tag).name);
  const field = fieldName(problem.field, t);
  const key = `studio.problem.${problem.code}` as MessageKey;
  switch (problem.code) {
    case "chapterWithoutStep":
    case "noBack":
    case "outlineWithoutCourse":
    case "courseWithoutChapter":
    case "textFormatMisplaced":
    case "unshaped":
      return t(key);
    case "notARelease":
      return t(key, { path: problem.params.path });
    case "versionGap":
      return t(key, { deck: problem.params.deck, versions: problem.params.versions.join(", ") });
    case "notOneDeck":
      return t(key, { decks: problem.params.decks.length === 0 ? t("studio.check.nothing") : list(problem.params.decks) });
    case "versionMismatch":
      return t(key, { stated: values(problem.params.stated), expected: `"${problem.params.expected}"` });
    case "linkMismatch":
      return t(key, {
        field,
        stated: values(problem.params.stated),
        expected: problem.params.expected.length === 0 ? t("studio.check.firstVersion") : list(problem.params.expected),
      });
    case "cardsDropped":
    case "outlineDropped":
      return t(key, { ids: problem.params.ids.map((id) => `#${id}`).join(", "), previous: `<${problem.params.previous}>` });
    case "idReused":
      return t(key, {
        id: `#${problem.params.id}`,
        now: t(`studio.check.kind.${problem.params.now}`),
        was: t(`studio.check.kind.${problem.params.was}`),
        previous: `<${problem.params.previous}>`,
      });
    case "versionNotNext":
      return t(key, { version: problem.params.version, previous: `<${problem.params.previous}>`, previousVersion: problem.params.previousVersion });
    case "courseDirection":
      return t(key, { stated: values(problem.params.stated) });
    case "chapterPartOf":
      return t(key, { parts: list(problem.params.parts) });
    case "stepPartOf":
      return t(key, { part: named(draft, problem.params.part) });
    case "askedNotACard":
    case "askedRetired":
      return t(key, { card: named(draft, problem.params.card) });
    case "notADistractor":
      return t(key, { distractor: named(draft, problem.params.distractor) });
    case "distractorShared":
      return t(key, { cards: list(problem.params.cards) });
    case "checkedTwice":
      return t(key, { steps: list(problem.params.steps) });
    case "checkedAndReviewed":
      return t(key, { steps: list(problem.params.steps), chapters: list(problem.params.chapters) });
    case "fewDistractors":
      return t(key, { count: problem.params.count, least: problem.params.least });
    case "distractorLanguages":
      return t(key, { missing: problem.params.missing.map(language).join(", "), card: named(draft, problem.params.card) });
    case "chapterPositions":
      return t(key, { chapters: list(problem.params.chapters), position: problem.params.position });
    case "stepPositions":
      return t(key, { steps: list(problem.params.steps), position: problem.params.position });
    case "textFormatUnknown":
      return t(key, { format: value(problem.params.format) });
    case "markdown":
      return t(key, { field, language: language(problem.params.language), finding: problemText(problem.params.finding as MarkdownProblem, t) });
    case "theoryEmptyChunk":
      return t(key, { field, language: language(problem.params.language) });
    case "theoryChunks": {
      const counts = problem.params.counts.map(({ language: tag, chunks }) =>
        t("studio.problem.theoryChunkCount", { count: chunks, language: language(tag) }),
      );
      return t(key, { field, counts: counts.join(", ") });
    }
    case "missingLanguage":
      return t(key, { field, language: language(problem.params.language) });
    case "missingTheme":
      return t(key, { theme: problem.params.theme.slice(problem.params.theme.lastIndexOf("/") + 1) });
    case "required":
      return t(key, { field });
    case "sourceUndescribed":
      return t(key, { missing: problem.params.missing.map((detail) => t(`studio.release.detail.${detail}`)).join(", ") });
    case "usedNotDerived":
      return t(key);
    case "countDisagrees":
      return t(key, { stated: problem.params.stated, counted: problem.params.counted, what: t(`studio.release.counted.${problem.params.what}`) });
    case "previousUnread":
      return t(key, { previous: `<${problem.params.previous}>` });
    case "libraryUnread":
      return t(key);
    case "shape": {
      const { message, constraint, builtIn, profile } = problem.params;
      const said = violationText({ message, constraint, severity: "violation", ...(builtIn === true ? { builtIn } : {}) });
      const worded = profile === undefined ? said : t("studio.check.profile", { profile: profile.toUpperCase(), message: said });
      return problem.field === undefined ? worded : t(key, { field, message: worded });
    }
  }
}
