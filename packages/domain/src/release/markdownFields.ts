import { SM } from "@solid-memo/vocab/vocab.generated";
import { problem, type MarkdownFinding, type ReleaseProblem } from "./problems.ts";
import { DCTERMS_NS, type ReleaseModel, type ReleaseText } from "./releaseModel.ts";

/**
 * Which texts of a release are written in Markdown, and by which rule
 * (docs/markdown.md, Rules for a release): of each card, step and
 * chapter that states solid-memo:textFormat solid-memo:markdown, field
 * by field; on a card, its distractors' text too, its back and every
 * distractor's text one paragraph when it has distractors, as options
 * are; a step's theory, shown a chunk at a time, split at its top-level
 * thematic breaks, with no empty chunk and as many chunks in each
 * language. The check itself is the markdown package's, which the caller
 * passes in: the domain reads no Markdown.
 */

/** A card's side or label (no links); an option (no links, one paragraph); prose (links that are followed). */
export type FieldRuleName = "side" | "option" | "prose";

/** One text of a field held to a rule. */
export interface MarkdownField {
  subject: string;
  /** The predicate's IRI. */
  field: string;
  text: ReleaseText;
  rule: FieldRuleName;
}

/** How a text written in Markdown is chunked: how many chunks it is shown in, and how many empty ones its breaks make, which the app drops. */
export interface TextChunks {
  chunks: number;
  empty: number;
}

/** The markdown package's reading of a release's text, which the caller passes in. */
export interface MarkdownCheck {
  /** What is wrong with a text written in Markdown, held to a rule. */
  problems(text: string, rule: FieldRuleName): readonly MarkdownFinding[];
  /** How a step's theory is chunked. */
  chunks(text: string): TextChunks;
}

/** The concepts of solid-memo:TextFormats. */
const TEXT_FORMATS: readonly string[] = [SM.plainText, SM.markdown];

/** Whether a subject states it is written in Markdown. */
export function isMarked(model: ReleaseModel, subject: string): boolean {
  return model.textFormats.some((statement) => statement.subject === subject && statement.object.value === SM.markdown);
}

/** Every text of the release written in Markdown, with the rule it is held to, in the order a check names them. */
export function markdownFields(model: ReleaseModel): MarkdownField[] {
  const fields: MarkdownField[] = [];
  const add = (subject: string, field: string, texts: readonly ReleaseText[], rule: FieldRuleName) => {
    for (const text of texts) fields.push({ subject, field, text, rule });
  };
  const distractors = new Map(model.distractors.map((d) => [d.iri, d]));
  for (const card of model.cards.filter((card) => isMarked(model, card.iri))) {
    const options = card.distractors.map((o) => o.value);
    add(card.iri, SM.front, card.front, "side");
    add(card.iri, SM.back, card.back, options.length > 0 ? "option" : "side");
    add(card.iri, SM.backLabel, card.backLabel, "side");
    add(card.iri, SM.frontNote, card.frontNote, "prose");
    add(card.iri, SM.backNote, card.backNote, "prose");
    for (const option of options) {
      const distractor = distractors.get(option);
      if (distractor === undefined) continue;
      add(option, SM.distractorText, distractor.text, "option");
      add(option, SM.distractorNote, distractor.note, "prose");
    }
  }
  for (const step of model.steps.filter((step) => isMarked(model, step.iri))) add(step.iri, SM.theory, step.theory, "prose");
  for (const chapter of model.chapters.filter((chapter) => isMarked(model, chapter.iri))) {
    add(chapter.iri, `${DCTERMS_NS}description`, chapter.description, "prose");
  }
  return fields;
}

/**
 * The problems of a release's text formats and of its text written in
 * Markdown: only a card, a step or a chapter states a text format, and
 * only a concept of solid-memo:TextFormats; then each finding of
 * `check` in each field, and after a step's theory how it is chunked
 * (theoryChunkProblems). None of this keeps the app safe, which shows
 * any text safely: it is that the text shows as its author meant.
 */
export function markdownProblems(model: ReleaseModel, check: MarkdownCheck): ReleaseProblem[] {
  const problems: ReleaseProblem[] = [];
  const formatted = new Set([...model.cards, ...model.steps, ...model.chapters].map((subject) => subject.iri));
  const distractors = new Set(model.distractors.filter((d) => d.typed).map((d) => d.iri));
  for (const { subject, object } of model.textFormats) {
    if (!formatted.has(subject)) {
      problems.push(problem(subject, { code: "textFormatMisplaced", params: { distractor: distractors.has(subject) } }, { field: SM.textFormat }));
    } else if (!TEXT_FORMATS.includes(object.value)) {
      problems.push(problem(subject, { code: "textFormatUnknown", params: { format: object } }, { field: SM.textFormat }));
    }
  }
  const fields = markdownFields(model);
  // A step's theory, one text a language, as far as it has been read.
  let theory: ReleaseText[] = [];
  fields.forEach(({ subject, field, text, rule }, index) => {
    for (const finding of check.problems(text.value, rule)) {
      problems.push(problem(subject, { code: "markdown", params: { language: text.language, finding } }, { field }));
    }
    if (field !== SM.theory) return;
    theory.push(text);
    const next = fields[index + 1];
    // After a step's last theory, how its theory is chunked.
    if (next?.subject !== subject || next.field !== SM.theory) {
      problems.push(...theoryChunkProblems(subject, theory, check));
      theory = [];
    }
  });
  return problems;
}

/**
 * The problems of how a step's theory is chunked (docs/markdown.md,
 * Chunks): a text with a thematic break first, last or right after
 * another, which makes an empty chunk the app drops; and texts in other
 * numbers of chunks in other languages, as a learner who switches
 * language would lose their place.
 */
export function theoryChunkProblems(step: string, theory: readonly ReleaseText[], check: MarkdownCheck): ReleaseProblem[] {
  const chunked = theory.map((text) => ({ language: text.language, ...check.chunks(text.value) }));
  const problems = chunked
    .filter(({ empty }) => empty > 0)
    .map(({ language }) => problem(step, { code: "theoryEmptyChunk", params: { language } }, { field: SM.theory }));
  if (new Set(chunked.map(({ chunks }) => chunks)).size > 1) {
    const counts = chunked.map(({ language, chunks }) => ({ language, chunks }));
    problems.push(problem(step, { code: "theoryChunks", params: { counts } }, { field: SM.theory }));
  }
  return problems;
}
