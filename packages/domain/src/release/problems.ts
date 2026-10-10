import type { LangText } from "../langText.ts";
import type { ReleaseKind, ReleaseTerm } from "./releaseModel.ts";

/**
 * What is wrong with a release, as data: a code and what it is about,
 * never text. The library's command words each in English
 * (packages/shacl/node/releaseMessages.ts); the Studio in the reader's
 * language, linking each to its subject and field.
 */
export type ReleaseProblem = ProblemBase & ProblemDetail;

export type ReleaseSeverity = "error" | "warning";

interface ProblemBase {
  severity: ReleaseSeverity;
  /** What the problem is in: a subject's IRI, or for the layout a path. */
  subject: string;
  /** The predicate's IRI, when the problem is in one field of the subject. */
  field?: string;
  /** Other subjects the problem names, for a reader to follow. */
  related?: readonly string[];
}

/** Each code with what wording it needs. */
export type ProblemDetail =
  | LayoutProblem
  | MetadataProblem
  | ContinuityProblem
  | CourseProblem
  | TextProblem
  | CurationProblem
  | ReadinessProblem
  | ShapeProblem
  | UnreadProblem;

/** A deck's place among the library's files (libraryRules). */
export type LayoutProblem =
  /** A path that is neither the index nor <name>/v<N>.ttl. */
  | { code: "notARelease"; params: { path: string } }
  /** A deck whose versions do not run 1, 2, …: found these. */
  | { code: "versionGap"; params: { deck: string; versions: number[] } };

/** A release's metadata against where it is published (libraryRules). */
export type MetadataProblem =
  /** The release is not exactly one deck, the document itself: the decks it has. */
  | { code: "notOneDeck"; params: { decks: string[] } }
  | { code: "versionMismatch"; params: { stated: ReleaseTerm[]; expected: number } }
  /** A link (series, publisher, previous version) other than expected; `expected` empty for none. */
  | { code: "linkMismatch"; params: { stated: ReleaseTerm[]; expected: string[] } };

/** A release against the version before it (continuityRules). */
export type ContinuityProblem =
  /** Cards the previous release has and this one does not. */
  | { code: "cardsDropped"; params: { ids: string[]; previous: string } }
  /** Chapters, steps and distractors the previous release has and this one does not. */
  | { code: "outlineDropped"; params: { ids: string[]; previous: string } }
  /** An id the previous release gave one kind of subject, now another's. */
  | { code: "idReused"; params: { id: string; was: ReleaseKind; now: ReleaseKind; previous: string } }
  /** A version that is not the previous one's plus one. */
  | { code: "versionNotNext"; params: { version: number; previousVersion: number; previous: string } };

/** A course's outline and options (courseRules). */
export type CourseProblem =
  | { code: "outlineWithoutCourse"; params: Record<string, never> }
  | { code: "courseWithoutChapter"; params: Record<string, never> }
  | { code: "courseDirection"; params: { stated: ReleaseTerm[] } }
  /** A chapter part of something besides its release: everything it is part of. */
  | { code: "chapterPartOf"; params: { parts: string[] } }
  /** A step part of what is no chapter of the release. */
  | { code: "stepPartOf"; params: { part: string } }
  /** A step or chapter asking (by `field`) what is no card of the release. */
  | { code: "askedNotACard"; params: { card: string } }
  /** A step or chapter in use asking a retired card. */
  | { code: "askedRetired"; params: { card: string } }
  | { code: "notADistractor"; params: { distractor: string } }
  /** A distractor more than one subject names. */
  | { code: "distractorShared"; params: { cards: string[] } }
  | { code: "checkedTwice"; params: { steps: string[] } }
  | { code: "checkedAndReviewed"; params: { steps: string[]; chapters: string[] } }
  | { code: "noBack"; params: Record<string, never> }
  | { code: "fewDistractors"; params: { count: number; least: number } }
  /** A distractor without text in languages ("" untagged) its card's back has. */
  | { code: "distractorLanguages"; params: { card: string; missing: string[] } }
  | { code: "chapterPositions"; params: { chapters: string[]; position: string } }
  | { code: "stepPositions"; params: { steps: string[]; chapter: string; position: string } }
  | { code: "chapterWithoutStep"; params: Record<string, never> };

/** Text and how it is written (markdownFields). */
export type TextProblem =
  /** A text format on a subject that has none of its own; `distractor` when it is a distractor. */
  | { code: "textFormatMisplaced"; params: { distractor: boolean } }
  | { code: "textFormatUnknown"; params: { format: ReleaseTerm } }
  /**
   * A field's text in one language ("" untagged) that would not show as
   * written: `finding` is what the Markdown check found, its own data.
   */
  | { code: "markdown"; params: { language: string; finding: MarkdownFinding } }
  /** A step's theory in one language ("" untagged) with a thematic break that makes an empty chunk. */
  | { code: "theoryEmptyChunk"; params: { language: string } }
  /** A step's theory in other numbers of chunks in other languages: each language's count. */
  | { code: "theoryChunks"; params: { counts: { language: string; chunks: number }[] } };

/** What a Markdown check finds in a text: a code of its own and what it needs to say it. */
export interface MarkdownFinding {
  code: string;
}

/** The library's curation policy (curationRules). */
export type CurationProblem =
  /** No text in a language the policy asks of the title, description or keywords (`field`). */
  | { code: "missingLanguage"; params: { language: string } }
  | { code: "missingTheme"; params: { theme: string } };

/**
 * What a release needs that a draft may still lack (readinessProblems):
 * the draft shapes leave it out, the release's shapes ask it.
 */
export type ReadinessProblem =
  /** No value of `field`, which a release states. */
  { code: "required"; params: Record<string, never> };

/** A release against the shapes (ShapeValidator.validateRelease), each result in the shape's own words. */
export type ShapeProblem =
  /**
   * A result of a shape or a profile: its message, in the languages it
   * gives (or the validator's own English, `builtIn`), the constraint it
   * is of, and the value it is about.
   */
  | { code: "shape"; params: { message: LangText; constraint: string; builtIn?: true; value?: string; profile?: string } }
  /** A subject typed with a Solid Memo term no shape of this app describes, or in a format it does not know. */
  | { code: "unshaped"; params: Record<string, never> };

/**
 * A part of the Studio's check that could not be made, as what it reads
 * could not be read (releaseDrafts.ts): the rest of the check stands.
 */
export type UnreadProblem =
  /** The release the draft follows, so nothing is checked against it. */
  | { code: "previousUnread"; params: { previous: string } }
  /** The library's index, so the draft's place in the library is not checked. */
  | { code: "libraryUnread"; params: Record<string, never> };

export type ProblemCode = ProblemDetail["code"];

/** A problem in `subject`: an error, as every rule here names, unless `severity` says it is a warning (a shape's). */
export function problem(
  subject: string,
  detail: ProblemDetail,
  more: { field?: string; related?: readonly string[]; severity?: ReleaseSeverity } = {},
): ReleaseProblem {
  const { field, related = [], severity = "error" } = more;
  return {
    severity,
    subject,
    ...(field === undefined ? {} : { field }),
    ...(related.length === 0 ? {} : { related }),
    ...detail,
  };
}
