import { SM } from "@solid-memo/vocab/vocab.generated";
import type { CardTextPart } from "../deck.ts";
import { courseProblems, readinessProblems } from "./courseRules.ts";
import { curationProblems, podPolicy, repoPolicy, type LibraryPolicy } from "./curationRules.ts";
import { metadataProblems, pathProblems, releasePathOf, versionGapProblems } from "./libraryRules.ts";
import type { ReleaseProblem, ReleaseSeverity } from "./problems.ts";
import { provenanceProblems } from "./provenanceRules.ts";
import { activitiesOf, generatingActivities, idIn, PROV, type ReleaseDraft } from "./releaseDraft.ts";
import { DCTERMS_NS, type ReleaseModel } from "./releaseModel.ts";
import { moved } from "./releaseToDraft.ts";

/**
 * The release check of a draft (docs/studio.md, The release check):
 * every rule a release is held to, as the library's command holds the
 * releases of decks/ (`npm run library:check`), run on the draft as the
 * release it will be. A policy says which library it is checked for:
 * a pod (the default), whose curation asks nothing beyond the data's
 * own rules, or this repository's library, whose curation asks English
 * and Swedish keywords and the theme EDUC, and whose index places it.
 */

/** Which library a draft is checked for: a release published in a pod, or one sent to the repository's decks/. */
export type CheckPolicy = "pod" | "library";

export const CHECK_POLICIES: readonly CheckPolicy[] = ["pod", "library"];

/** The curation a policy asks (curationRules). */
export function curationOf(policy: CheckPolicy): LibraryPolicy {
  return policy === "library" ? repoPolicy : podPolicy;
}

/** What the check found, by the rules that found it. */
export interface ReleaseCheck {
  /** The course's outline, what a release needs that a draft may lack, the policy's curation, and how it says it was made. */
  rules: ReleaseProblem[];
  /** Its place in the library (the library policy only): its name, its version among the others, its metadata. */
  library: ReleaseProblem[];
  /** Against the release it follows: what it drops, an id it gives another kind of subject, its version. */
  drops: ReleaseProblem[];
  /** Its text formats, and its text written in Markdown. */
  markdown: ReleaseProblem[];
  /** The shapes and the profiles (DCAT-AP, SKOS): null until they are asked, as they take a while. */
  shapes: ReleaseProblem[] | null;
}

/** The same problem once: two rules may find it (a title without English, which a release needs and a curation asks). */
function distinct(problems: readonly ReleaseProblem[]): ReleaseProblem[] {
  const seen = new Set<string>();
  return problems.filter((one) => {
    const key = JSON.stringify([one.code, one.subject, one.field ?? "", one.params]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The rules of a release read from its data alone: its course's, its readiness, the policy's curation, and its provenance's. */
export function ruleProblems(model: ReleaseModel, policy: CheckPolicy): ReleaseProblem[] {
  return distinct([
    ...courseProblems(model),
    ...readinessProblems(model),
    ...curationProblems(model, curationOf(policy)),
    ...provenanceProblems(model),
  ]);
}

/** Where a library publishes a deck's release: `<name>/v<N>.ttl` beside its index. */
export function libraryReleaseUrl(indexUrl: string, name: string, version: number): string {
  return new URL(`${name}/v${version}.ttl`, indexUrl).href;
}

/** The series a library's index describes a deck by: a fragment of the index named after the deck. */
export function librarySeriesUrl(indexUrl: string, name: string): string {
  return `${indexUrl}#${name}`;
}

/** What a library's index says that places a release in it. */
export interface LibraryIndexView {
  url: string;
  /** Its publisher, which publishes every release of it; null when it names none. */
  publisher: string | null;
  /** The URL of every release it lists. */
  releases: readonly string[];
}

/**
 * The problems of a release as the library's `name`, version `version`,
 * its model at its address there (libraryReleaseUrl): a name that is
 * not plain, versions of the deck that would not run 1, 2, … with it
 * (one it has already among them),
 * and its metadata against that place (metadataProblems: in the deck's
 * series, by the index's publisher, after the version before it).
 */
export function libraryProblems(model: ReleaseModel, index: LibraryIndexView, name: string, version: number): ReleaseProblem[] {
  const base = new URL(".", index.url).href;
  const path = `${name}/v${version}.ttl`;
  const paths = index.releases.filter((url) => url.startsWith(base)).map((url) => url.slice(base.length));
  // A version the library has already is there twice: the versions do not run 1, 2, … then either.
  const ofDeck = paths.filter((one) => releasePathOf(one)?.deck === name);
  const place = {
    version,
    series: librarySeriesUrl(index.url, name),
    publisher: index.publisher ?? "",
    ...(version > 1 ? { previous: libraryReleaseUrl(index.url, name, version - 1) } : {}),
  };
  return [...pathProblems(path), ...versionGapProblems([...ofDeck, path]), ...metadataProblems(model, place)];
}

/** Problems about subjects at `from` (a release's address), about the same subjects at `to`. */
export function movedProblems(problems: readonly ReleaseProblem[], from: string, to: string): ReleaseProblem[] {
  return problems.map((one) => ({
    ...one,
    subject: moved(one.subject, from, to),
    ...(one.related === undefined ? {} : { related: one.related.map((iri) => moved(iri, from, to)) }),
  }));
}

/**
 * Whether a check read all it needed: no part of it left unread
 * (UnreadProblem: the release it follows, or the library's index). One
 * that did not is not kept, so the next check reads again.
 */
export function readWhole(check: Pick<ReleaseCheck, "drops" | "library">): boolean {
  return ![...check.drops, ...check.library].some((one) => one.code === "previousUnread" || one.code === "libraryUnread");
}

/** Every problem the check found, by the order of its rules, the shapes last. */
export function checkProblems(check: ReleaseCheck): ReleaseProblem[] {
  return [...check.rules, ...check.library, ...check.drops, ...check.markdown, ...(check.shapes ?? [])];
}

/** The problems of one severity, by the subject they are in, each subject in the order its first problem comes. */
export interface ProblemGroup {
  severity: ReleaseSeverity;
  subjects: { subject: string; problems: ReleaseProblem[] }[];
}

/** The problems by severity (errors first), then by subject; a severity without a problem left out. */
export function groupProblems(problems: readonly ReleaseProblem[]): ProblemGroup[] {
  return (["error", "warning"] as const)
    .map((severity) => {
      const bySubject = new Map<string, ReleaseProblem[]>();
      for (const one of problems.filter((p) => p.severity === severity)) bySubject.set(one.subject, [...(bySubject.get(one.subject) ?? []), one]);
      return { severity, subjects: [...bySubject].map(([subject, found]) => ({ subject, problems: found })) };
    })
    .filter((group) => group.subjects.length > 0);
}

/** The card whose wrong options include the subject, which its editor shows: undefined when none does. */
function cardOfDistractor(draft: Pick<ReleaseDraft, "cards">, subject: string) {
  return draft.cards.find((node) => node.data.distractor.includes(subject));
}

/**
 * How many problems each subject has, by its fragment id in the draft
 * (the outline's badges); a wrong option's under its card's, which the
 * outline shows it in.
 */
export function problemCounts(draft: Pick<ReleaseDraft, "url" | "cards">, problems: readonly ReleaseProblem[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const one of problems) {
    const own = idIn(draft, one.subject);
    const id = own === null ? null : (cardOfDistractor(draft, one.subject)?.id ?? own);
    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Where a draft's editors show what a problem is about: a screen, and the field there it opens at. */
export type ProblemTarget =
  | { screen: "draft"; field?: DraftField }
  | { screen: "chapter"; chapter: string; field?: ChapterField }
  | { screen: "step"; step: string; field?: StepField }
  | { screen: "question"; card: string; field?: QuestionField }
  | { screen: "release"; field?: ReleaseField };

/** The overview's fields: what the release says of itself, and its outline. */
export type DraftField = "title" | "description" | "outline";
export type ChapterField = "title" | "description" | "steps" | "review";
export type StepField = "theory" | "questions";
/** The release screen's parts: what the release says of itself beyond its listing, who made it and how, and from what. */
export type ReleaseField = "versionNotes" | "languages" | "license" | "publisher" | "authors" | "making" | "sources" | "checks";

export const RELEASE_FIELDS: readonly ReleaseField[] = ["versionNotes", "languages", "license", "publisher", "authors", "making", "sources", "checks"];

/** A question's text, its wrong options (all), or one of them by its id. */
export type QuestionField = CardTextPart | "distractors" | `distractor:${string}`;

const DCTERMS_TITLE = `${DCTERMS_NS}title`;
const DCTERMS_DESCRIPTION = `${DCTERMS_NS}description`;
const CARD_FIELDS: Readonly<Record<string, CardTextPart>> = {
  [SM.front]: "front",
  [SM.back]: "back",
  [SM.backLabel]: "backLabel",
  [SM.frontNote]: "frontNote",
  [SM.backNote]: "backNote",
};
/** The release screen's part of each field of the release itself, by its predicate. */
const RELEASE_SCREEN_FIELDS: Readonly<Record<string, ReleaseField>> = {
  "http://www.w3.org/ns/adms#versionNotes": "versionNotes",
  [`${DCTERMS_NS}language`]: "languages",
  [`${DCTERMS_NS}license`]: "license",
  [`${DCTERMS_NS}publisher`]: "publisher",
  [`${DCTERMS_NS}creator`]: "authors",
  [`${PROV}wasDerivedFrom`]: "sources",
};
/** The problems of a source, by code, which the release screen's sources show. */
const SOURCE_CODES: ReadonlySet<string> = new Set(["sourceUndescribed", "usedNotDerived"]);
/** The problems of the outline, by code, which the outline's part of the screen shows. */
const OUTLINE_CODES: ReadonlySet<string> = new Set(["courseWithoutChapter", "chapterPositions", "outlineWithoutCourse"]);

/**
 * Where to show a problem of the draft: the editor of the subject it is
 * in, at its field when the editor has one for it; a distractor's,
 * its card's, at it. A source's, an agent's or an activity's, the
 * release screen, at its part; so is one of the release's fields there.
 * A problem of the release itself otherwise, or of a subject without an
 * editor of its own (the series), the overview.
 */
export function problemTarget(draft: ReleaseDraft, problem: ReleaseProblem): ProblemTarget {
  const id = idIn(draft, problem.subject);
  const has = (nodes: readonly { id: string }[]) => id !== null && nodes.some((node) => node.id === id);
  const { field, code } = problem;
  if (has(draft.chapters)) {
    const chapterField: ChapterField | undefined =
      field === DCTERMS_TITLE ? "title"
      : field === DCTERMS_DESCRIPTION ? "description"
      : field === SM.reviewQuestion ? "review"
      : code === "stepPositions" || code === "chapterWithoutStep" ? "steps"
      : undefined;
    return { screen: "chapter", chapter: id!, ...(chapterField === undefined ? {} : { field: chapterField }) };
  }
  if (has(draft.steps)) {
    const stepField: StepField | undefined = field === SM.theory ? "theory" : field === SM.checkedBy ? "questions" : undefined;
    return { screen: "step", step: id!, ...(stepField === undefined ? {} : { field: stepField }) };
  }
  if (has(draft.cards)) {
    const cardField: QuestionField | undefined = field === SM.distractor ? "distractors" : field === undefined ? undefined : CARD_FIELDS[field];
    return { screen: "question", card: id!, ...(cardField === undefined ? {} : { field: cardField }) };
  }
  const card = id === null ? undefined : cardOfDistractor(draft, problem.subject);
  if (card !== undefined) return { screen: "question", card: card.id, field: `distractor:${id}` };
  if (SOURCE_CODES.has(code)) return { screen: "release", field: "sources" };
  if (has(draft.agents)) return { screen: "release", field: "authors" };
  if (id !== null && activitiesOf(draft).includes(id)) {
    const making = generatingActivities(draft).includes(problem.subject) && !draft.published.activities.includes(id);
    return { screen: "release", field: making ? "making" : "checks" };
  }
  if (problem.subject !== draft.url) return { screen: "draft" };
  const releaseField = field === undefined ? undefined : RELEASE_SCREEN_FIELDS[field];
  if (releaseField !== undefined) return { screen: "release", field: releaseField };
  const draftField: DraftField | undefined =
    field === DCTERMS_TITLE ? "title" : field === DCTERMS_DESCRIPTION ? "description" : OUTLINE_CODES.has(code) ? "outline" : undefined;
  return { screen: "draft", ...(draftField === undefined ? {} : { field: draftField }) };
}

/** The field of a target, if it names one: for a route to carry (docs/studio.md). */
export function isTargetField(screen: ProblemTarget["screen"], field: string): boolean {
  switch (screen) {
    case "draft":
      return ["title", "description", "outline"].includes(field);
    case "chapter":
      return ["title", "description", "steps", "review"].includes(field);
    case "step":
      return ["theory", "questions"].includes(field);
    case "question":
      return [...Object.values(CARD_FIELDS), "distractors"].includes(field) || /^distractor:./.test(field);
    case "release":
      return (RELEASE_FIELDS as readonly string[]).includes(field);
  }
}
