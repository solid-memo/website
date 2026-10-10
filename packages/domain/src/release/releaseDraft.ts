import type {
  AgentV1,
  CardV5,
  DistractorV1,
  DistributionV1,
  DraftChapterV1,
  DraftDeckV1,
  DraftStepV1,
  LangText,
} from "@solid-memo/vocab/types.generated";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { EDUCATION_THEME, TURTLE_MEDIA_TYPE } from "../dcat.ts";
import type { ReleaseKind, ReleaseTerm, ReleaseText } from "./releaseModel.ts";

/**
 * A release's draft (docs/studio.md, Drafts): the release a creator is
 * writing in their pod, as plain data. Every subject is a fragment of
 * the draft's `url`, its release document, as it will be of the
 * release's: the repository keeps the draft in several documents and
 * maps their IRIs to these (draftLayout.ts). What a shape describes is
 * a record of it, at its latest format; every other statement (how the
 * release was made, its sources and licence, the series it describes,
 * and what a subject says beyond its shape) is a triple, kept as it is.
 *
 * A draft is changed by DraftChange values (applyDraftChange), each one
 * edit a creator makes, refused (DraftRefusal) when it would break what
 * a release promises: what an earlier release published is never
 * dropped or reused, a question is asked from one place, a course is
 * studied front to back, and how an earlier release was made is not
 * rewritten.
 */

/** A subject a shape describes: its fragment id and its record. */
export interface DraftNode<T> {
  readonly id: string;
  readonly data: T;
}

/** A statement kept as it is: its subject an IRI, or a blank node as `_:<label>`. */
export interface DraftTriple {
  readonly subject: string;
  readonly predicate: string;
  readonly object: ReleaseTerm;
}

/**
 * What the releases before a draft published, which it must keep: each
 * id with the kind of subject it is (a card, chapter, step or
 * distractor is retired, never dropped, and its id is never another's),
 * and the activities of how they were made, carried over and never
 * edited. Empty for a draft of a first release.
 */
export interface PublishedIds {
  readonly ids: Readonly<Record<string, ReleaseKind>>;
  readonly activities: readonly string[];
}

export const NOTHING_PUBLISHED: PublishedIds = { ids: {}, activities: [] };

export interface ReleaseDraft {
  /** Its release document: the root's IRI and the base of every subject's. */
  readonly url: string;
  /** Whether the release is a course (typed schema:Course). */
  readonly course: boolean;
  /** What the release says of itself. */
  readonly root: DraftDeckV1;
  readonly agents: readonly DraftNode<AgentV1>[];
  readonly distributions: readonly DraftNode<DistributionV1>[];
  readonly chapters: readonly DraftNode<DraftChapterV1>[];
  readonly steps: readonly DraftNode<DraftStepV1>[];
  readonly cards: readonly DraftNode<CardV5>[];
  readonly distractors: readonly DraftNode<DistractorV1>[];
  /** Every other statement of the release, in order. */
  readonly triples: readonly DraftTriple[];
  readonly published: PublishedIds;
}

export const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
export const SCHEMA_COURSE = "https://schema.org/Course";
export const PROV = "http://www.w3.org/ns/prov#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const RDFS_COMMENT = `${RDFS}comment`;
const LICENSE_DOCUMENT = "http://purl.org/dc/terms/LicenseDocument";
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";
const XSD_DATE_TIME = "http://www.w3.org/2001/XMLSchema#dateTime";
const LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";
const RDF_TURTLE = "http://publications.europa.eu/resource/authority/file-type/RDF_TURTLE";

/** The IRI of a subject of the draft, by its fragment id. */
export function iriIn(draft: Pick<ReleaseDraft, "url">, id: string): string {
  return `${draft.url}#${id}`;
}

/** The fragment id of one of the draft's subjects; null for any other IRI. */
export function idIn(draft: Pick<ReleaseDraft, "url">, iri: string): string | null {
  return iri.startsWith(`${draft.url}#`) ? iri.slice(draft.url.length + 1) : null;
}

/** What a fragment id may be: a letter or digit, then letters, digits, `.`, `_` and `-`, so it is also a file name. */
export const DRAFT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** A new draft's own subjects: its distribution, `#turtle`, and its series, `#series`, until a release names them elsewhere. */
export const DISTRIBUTION_ID = "turtle";
export const SERIES_ID = "series";

/**
 * A blank draft at `url`: a deck, or a course (studied front to back),
 * titled as given, version 1 of a series of its own (`#series`), with
 * its Turtle distribution (`#turtle`); nothing published before it. A
 * course is about education (the EU's data theme EDUC), as every
 * course release says it is (courseRules.ts). Ids
 * the draft will give other subjects (`taken`) are left to them: the
 * series and distribution are then `#series-2`, `#turtle-2`, …
 */
export function blankDraft({
  url,
  course,
  title,
  now,
  taken = [],
}: {
  url: string;
  course: boolean;
  title: LangText;
  now: string;
  taken?: Iterable<string>;
}): ReleaseDraft {
  const used = new Set(taken);
  const free = (id: string) => {
    let name = id;
    for (let n = 2; used.has(name); n++) name = `${id}-${n}`;
    return name;
  };
  const draft = { url };
  const series = iriIn(draft, free(SERIES_ID));
  const distribution = free(DISTRIBUTION_ID);
  return {
    url,
    course,
    root: {
      ...(Object.keys(title).length === 0 ? {} : { title }),
      created: now,
      creator: [],
      studyDirection: SM.frontToBack as DraftDeckV1["studyDirection"],
      theme: course ? [EDUCATION_THEME] : [],
      keyword: {},
      language: [],
      version: "1",
      inSeries: series,
      isVersionOf: series,
      distribution: [iriIn(draft, distribution)],
      wasDerivedFrom: [],
    },
    agents: [],
    distributions: [{ id: distribution, data: turtleDistribution(url) }],
    chapters: [],
    steps: [],
    cards: [],
    distractors: [],
    triples: [],
    published: NOTHING_PUBLISHED,
  };
}

/** A release's one distribution: its own document, in Turtle. */
export function turtleDistribution(url: string): DistributionV1 {
  return { accessUrl: url, downloadUrl: url, mediaType: TURTLE_MEDIA_TYPE, format: RDF_TURTLE };
}

/** The fragment id of every subject of the draft, of a record or a triple, and of every IRI of it a statement names. */
export function idsInUse(draft: ReleaseDraft): Set<string> {
  const ids = new Set<string>();
  const note = (iri: string) => {
    const id = idIn(draft, iri);
    if (id !== null) ids.add(id);
  };
  for (const nodes of [draft.agents, draft.distributions, draft.chapters, draft.steps, draft.cards, draft.distractors]) {
    for (const node of nodes) ids.add(node.id);
  }
  for (const triple of draft.triples) {
    note(triple.subject);
    if (triple.object.kind === "iri") note(triple.object.value);
  }
  for (const value of Object.values(draft.root)) {
    for (const one of Array.isArray(value) ? value : [value]) if (typeof one === "string") note(one);
  }
  return ids;
}

/**
 * The first fragment id of the draft no subject of a draft can have
 * (DRAFT_ID); null when it has none. A draft keeps each chapter in a
 * document named after its id, which another id would not survive: a
 * release with one is not made a draft.
 */
export function unsupportedIdOf(draft: ReleaseDraft): string | null {
  return [...idsInUse(draft)].find((id) => !DRAFT_ID.test(id)) ?? null;
}

// ---------------------------------------------------------------------------
// Changes

/** Where a card is asked: by a step (sm:checkedBy), or in a chapter's final review only (sm:reviewQuestion). */
export type QuestionPlace = { kind: "step"; step: string } | { kind: "review"; chapter: string };

/**
 * A change of what the release says of itself: each field given is set,
 * one given as null is cleared; `course` types the release a course or
 * not. The release a draft was published as is never set here.
 */
export type DraftMetaPatch = {
  readonly [K in Exclude<keyof DraftDeckV1, "releasedAs" | "studyDirection">]?: DraftDeckV1[K] | null;
} & {
  readonly studyDirection?: DraftDeckV1["studyDirection"];
  readonly course?: boolean;
};

/** A chapter's own text: its title, its description and how that is written. */
export type ChapterText = Pick<DraftChapterV1, "title" | "description" | "textFormat">;

/** A step's own text: its theory and how it is written. */
export type StepText = Pick<DraftStepV1, "theory" | "textFormat">;

/** A card's content, without its distractors and whether it is retired, which their own changes make. */
export type CardText = Omit<CardV5, "distractor" | "deprecated">;

/** A wrong option's text and note. */
export type DistractorText = Omit<DistractorV1, "deprecated">;

/**
 * A source of the release: its statements (a title, a creator, the
 * evidence for its licence), and whether the release states it is drawn
 * from it (`prov:wasDerivedFrom`, `derivedFrom`) and how it was made used
 * it (`prov:used` of the activity that generated the release, `used`).
 */
export interface DraftSource {
  readonly statements: readonly { predicate: string; object: ReleaseTerm }[];
  readonly derivedFrom: boolean;
  readonly used: boolean;
}

/**
 * A check of the release recorded as how it was made: by machine (the
 * validators, the release check) or by AI. Never a human review: the
 * record says so in its own words (checkActivityTriples).
 */
export interface CheckActivity {
  readonly check: "machine" | "ai";
  /** What it looked at, in a few words ("Facts and completeness"). */
  readonly label: string;
  readonly scope: string;
  readonly outcome: string;
  /** When it ended, an ISO date and time. */
  readonly endedAt: string;
  /** The language the label, scope and outcome are written in. */
  readonly language: string;
}

/** Which of an outline's subjects a retirement, restoration or deletion is of. */
export type DraftKind = ReleaseKind;

export type DraftChange =
  | { kind: "setMeta"; meta: DraftMetaPatch }
  /** An agent of the release (a creator, the publisher), set or (null) removed with every mention of it. */
  | { kind: "setAgent"; id: string; agent: AgentV1 | null }
  /** A new chapter, at `at` among the chapters in use (last when absent). */
  | { kind: "addChapter"; id: string; text?: ChapterText; at?: number }
  | { kind: "editChapter"; id: string; text: ChapterText }
  | { kind: "moveChapter"; id: string; to: number }
  /** A new step of a chapter, at `at` among its steps in use (last when absent). */
  | { kind: "addStep"; id: string; chapter: string; text?: StepText; at?: number }
  | { kind: "editStep"; id: string; text: StepText }
  /** A step to `to` among the steps in use of `chapter`, its own or another. */
  | { kind: "moveStep"; id: string; chapter: string; to: number }
  /** A new card: of a plain deck, or a question not yet asked anywhere. */
  | { kind: "addCard"; id: string; card: CardText }
  | { kind: "editCard"; id: string; card: CardText }
  /** Ask a card that is not asked yet. */
  | { kind: "addQuestion"; card: string; place: QuestionPlace }
  /** Ask a card from another place, or (null) from none. */
  | { kind: "moveQuestion"; card: string; place: QuestionPlace | null }
  | { kind: "addDistractor"; card: string; id: string; distractor: DistractorText }
  | { kind: "editDistractor"; id: string; distractor: DistractorText }
  | { kind: "retire"; of: DraftKind; id: string }
  | { kind: "restore"; of: DraftKind; id: string }
  /** Delete a subject no earlier release published, with what is part of it. */
  | { kind: "delete"; of: DraftKind; id: string }
  /**
   * A source, by its IRI: set, or (null) removed with every mention of it
   * this version makes. What it states stays while an activity carried
   * from an earlier release still uses it: that making is not rewritten.
   * One set is one the release is derived from, or its making used (made,
   * `#compilation`, for a release that names none), or an activity
   * carried from an earlier release still uses; else it is refused.
   */
  | { kind: "setSource"; iri: string; source: DraftSource | null }
  /** The licence (dcterms:license), typed dcterms:LicenseDocument; null for none. */
  | { kind: "setLicense"; license: string | null }
  /**
   * The attribution of how the release was made: "Compiled by <its
   * authors>", with or without "with the help of AI", in English and
   * Swedish; null for none. Never a claim that anyone reviewed it.
   */
  | { kind: "setAttribution"; attribution: { ai: boolean } | null }
  /** What the release's own making says of itself beside its attribution: each paragraph of a language one comment. */
  | { kind: "setMakingNotes"; notes: LangText }
  | { kind: "addCheckActivity"; id: string; activity: CheckActivity }
  | { kind: "editCheckActivity"; id: string; activity: CheckActivity }
  /** An activity of this version deleted, with every mention of it, and what the draft states of a source it alone used. */
  | { kind: "deleteActivity"; id: string };

/** Why a change was not made. */
export type DraftRefusal =
  /** The draft was published: it is no longer edited. */
  | { refused: "released" }
  /** What the change is of is not in the draft (any more). */
  | { refused: "missing"; id: string }
  /** An earlier release published it: it can be retired, never deleted. */
  | { refused: "published"; of: DraftKind; id: string }
  /** The id is another subject's, or was an earlier release's. */
  | { refused: "idTaken"; id: string }
  /** The id is none a subject can have (DRAFT_ID). */
  | { refused: "idInvalid"; id: string }
  /** The card is asked from another place already: move it instead. */
  | { refused: "askedElsewhere"; card: string; place: QuestionPlace }
  /** Only a course has chapters, steps and questions. */
  | { refused: "notACourse" }
  /** A course is studied front to back. */
  | { refused: "notFrontToBack" }
  /** The activity is how an earlier release was made: it is not rewritten. */
  | { refused: "carriedActivity"; id: string }
  /** An attribution names the release's authors: it has none. */
  | { refused: "noAuthors" }
  /** A source is one the release is derived from or its making used: it would be neither. */
  | { refused: "unusedSource"; id: string };

export function isRefusal(result: ReleaseDraft | DraftRefusal): result is DraftRefusal {
  return "refused" in result;
}

/**
 * The draft with the change made, or why it is not made. A blank node
 * that only statements the change took out named goes with them. What
 * an activity carried from an earlier release states is never changed:
 * a change that would is refused (carriedActivity).
 */
export function applyDraftChange(draft: ReleaseDraft, change: DraftChange): ReleaseDraft | DraftRefusal {
  const next = changedDraft(draft, change);
  if (isRefusal(next) || next.triples === draft.triples) return next;
  const triples = withoutOrphans(next.triples, draft.triples);
  const rewritten = rewrittenActivity(draft, triples);
  return rewritten === null ? { ...next, triples } : { refused: "carriedActivity", id: rewritten };
}

/** The first activity carried from an earlier release whose statements `triples` changes, by id; null when none. */
function rewrittenActivity(draft: ReleaseDraft, triples: readonly DraftTriple[]): string | null {
  const said = (list: readonly DraftTriple[], iri: string) => JSON.stringify(list.filter((triple) => triple.subject === iri).map(keyOfTriple).sort());
  return draft.published.activities.find((id) => said(draft.triples, iriIn(draft, id)) !== said(triples, iriIn(draft, id))) ?? null;
}

/** A statement as a string, to compare by. */
function keyOfTriple(triple: DraftTriple): string {
  return JSON.stringify([triple.subject, triple.predicate, triple.object]);
}

/** The blank node a term is, by its `_:` label; null for any other term. */
function blankOf(term: ReleaseTerm): string | null {
  return term.kind === "blank" ? `_:${term.value}` : null;
}

/** `kept` without the statements of blank nodes that only statements of `before` it lacks named, however deep. */
function withoutOrphans(kept: readonly DraftTriple[], before: readonly DraftTriple[]): DraftTriple[] {
  const keys = new Set(kept.map(keyOfTriple));
  const named = (triples: readonly DraftTriple[]) => new Set(triples.map((triple) => blankOf(triple.object)).filter((blank) => blank !== null));
  let result = [...kept];
  let gone = before.filter((triple) => !keys.has(keyOfTriple(triple)));
  for (;;) {
    const still = named(result);
    const orphans = [...named(gone)].filter((blank) => !still.has(blank));
    if (orphans.length === 0) return result;
    gone = result.filter((triple) => orphans.includes(triple.subject));
    result = result.filter((triple) => !orphans.includes(triple.subject));
  }
}

function changedDraft(draft: ReleaseDraft, change: DraftChange): ReleaseDraft | DraftRefusal {
  if (draft.root.releasedAs !== undefined) return { refused: "released" };
  switch (change.kind) {
    case "setMeta":
      return setMeta(draft, change.meta);
    case "setAgent":
      return setAgent(draft, change.id, change.agent);
    case "addChapter":
      return addChapter(draft, change.id, change.text ?? {}, change.at);
    case "editChapter":
      return editNode(draft, "chapters", change.id, (data) => ({ ...withoutText(data, ["title", "description", "textFormat"]), ...defined(change.text) }));
    case "moveChapter":
      return moveChapter(draft, change.id, change.to);
    case "addStep":
      return addStep(draft, change.id, change.chapter, change.text ?? {}, change.at);
    case "editStep":
      return editNode(draft, "steps", change.id, (data) => ({ ...withoutText(data, ["theory", "textFormat"]), ...defined(change.text) }));
    case "moveStep":
      return moveStep(draft, change.id, change.chapter, change.to);
    case "addCard":
      return addNode(draft, "cards", change.id, { ...defined(change.card), distractor: [] });
    case "editCard":
      return editNode(draft, "cards", change.id, (data) => ({
        ...defined(change.card),
        ...(data.created === undefined || change.card.created !== undefined ? {} : { created: data.created }),
        ...(data.deprecated === true ? { deprecated: true } : {}),
        distractor: data.distractor,
      }));
    case "addQuestion":
      return addQuestion(draft, change.card, change.place);
    case "moveQuestion":
      return moveQuestion(draft, change.card, change.place);
    case "addDistractor":
      return addDistractor(draft, change.card, change.id, change.distractor);
    case "editDistractor":
      return editNode(draft, "distractors", change.id, (data) => ({ ...defined(change.distractor), ...(data.deprecated === true ? { deprecated: true } : {}) }));
    case "retire":
    case "restore": {
      const edited = editNode(draft, NODES[change.of], change.id, (data) =>
        change.kind === "retire" ? { ...data, deprecated: true } : withoutText(data, ["deprecated"]),
      );
      // A chapter or step that leaves or rejoins those in use: they are numbered again.
      return isRefusal(edited) ? edited : renumberedOutline(edited);
    }
    case "delete":
      return deleteSubject(draft, change.of, change.id);
    case "setSource":
      return setSource(draft, change.iri, change.source);
    case "setLicense":
      return setLicense(draft, change.license);
    case "setAttribution":
      return setAttribution(draft, change.attribution);
    case "setMakingNotes":
      return setMakingNotes(draft, change.notes);
    case "addCheckActivity":
      return addCheckActivity(draft, change.id, change.activity);
    case "editCheckActivity":
      return editCheckActivity(draft, change.id, change.activity);
    case "deleteActivity":
      return deleteActivity(draft, change.id);
  }
}

/** The changes made in turn; the first refusal stops them. */
export function applyDraftChanges(draft: ReleaseDraft, changes: readonly DraftChange[]): ReleaseDraft | DraftRefusal {
  let current = draft;
  for (const change of changes) {
    const next = applyDraftChange(current, change);
    if (isRefusal(next)) return next;
    current = next;
  }
  return current;
}

type NodeLists = {
  agents: AgentV1;
  distributions: DistributionV1;
  chapters: DraftChapterV1;
  steps: DraftStepV1;
  cards: CardV5;
  distractors: DistractorV1;
};

const NODES: Record<DraftKind, "cards" | "chapters" | "steps" | "distractors"> = {
  card: "cards",
  chapter: "chapters",
  step: "steps",
  distractor: "distractors",
};

/** The record without the fields named. */
function withoutText<T extends object>(data: T, fields: readonly string[]): T {
  return Object.fromEntries(Object.entries(data).filter(([field]) => !fields.includes(field))) as T;
}

/** The fields given a value. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, one]) => one !== undefined)) as T;
}

function nodeOf<K extends keyof NodeLists>(draft: ReleaseDraft, list: K, id: string): DraftNode<NodeLists[K]> | undefined {
  return (draft[list] as readonly DraftNode<NodeLists[K]>[]).find((node) => node.id === id);
}

function withNodes<K extends keyof NodeLists>(draft: ReleaseDraft, list: K, nodes: readonly DraftNode<NodeLists[K]>[]): ReleaseDraft {
  return { ...draft, [list]: nodes };
}

function editNode<K extends keyof NodeLists>(
  draft: ReleaseDraft,
  list: K,
  id: string,
  edit: (data: NodeLists[K]) => NodeLists[K],
): ReleaseDraft | DraftRefusal {
  if (nodeOf(draft, list, id) === undefined) return { refused: "missing", id };
  const nodes = draft[list] as readonly DraftNode<NodeLists[K]>[];
  return withNodes(draft, list, nodes.map((node) => (node.id === id ? { id, data: edit(node.data) } : node)));
}

/** Why a subject may not be added by that id; null when it may. */
function refuseId(draft: ReleaseDraft, id: string): DraftRefusal | null {
  if (!DRAFT_ID.test(id)) return { refused: "idInvalid", id };
  if (idsInUse(draft).has(id) || id in draft.published.ids || draft.published.activities.includes(id)) return { refused: "idTaken", id };
  return null;
}

function addNode<K extends keyof NodeLists>(draft: ReleaseDraft, list: K, id: string, data: NodeLists[K]): ReleaseDraft | DraftRefusal {
  const refusal = refuseId(draft, id);
  if (refusal !== null) return refusal;
  return withNodes(draft, list, [...(draft[list] as readonly DraftNode<NodeLists[K]>[]), { id, data }]);
}

// --- What the release says of itself

function setMeta(draft: ReleaseDraft, patch: DraftMetaPatch): ReleaseDraft | DraftRefusal {
  const { course = draft.course, ...fields } = patch;
  const root: Record<string, unknown> = { ...draft.root };
  for (const [field, value] of Object.entries(fields)) {
    if (value === null) {
      if (Array.isArray(root[field])) root[field] = [];
      else if (field === "keyword") root[field] = {};
      else delete root[field];
    } else if (value !== undefined) {
      root[field] = value;
    }
  }
  const next = root as unknown as DraftDeckV1;
  if (course && next.studyDirection !== SM.frontToBack) return { refused: "notFrontToBack" };
  return { ...draft, course, root: next };
}

function setAgent(draft: ReleaseDraft, id: string, agent: AgentV1 | null): ReleaseDraft | DraftRefusal {
  const known = nodeOf(draft, "agents", id) !== undefined;
  if (agent !== null) {
    if (known) return withNodes(draft, "agents", draft.agents.map((node) => (node.id === id ? { id, data: agent } : node)));
    return addNode(draft, "agents", id, agent);
  }
  if (!known) return { refused: "missing", id };
  const iri = iriIn(draft, id);
  const { publisher, ...root } = draft.root;
  return {
    ...draft,
    root: { ...root, ...(publisher === undefined || publisher === iri ? {} : { publisher }), creator: draft.root.creator.filter((one) => one !== iri) },
    agents: draft.agents.filter((node) => node.id !== id),
    triples: draft.triples.filter((triple) => triple.subject !== iri && !(triple.object.kind === "iri" && triple.object.value === iri)),
  };
}

// --- The outline

/** The chapters in use, in their order: by position, then by id; one with no position last. */
export function liveChapters(draft: ReleaseDraft): DraftNode<DraftChapterV1>[] {
  return inOrder(draft.chapters.filter((node) => node.data.deprecated !== true));
}

/** The steps in use of a chapter (by id), in their order. */
export function liveSteps(draft: ReleaseDraft, chapter: string): DraftNode<DraftStepV1>[] {
  const iri = iriIn(draft, chapter);
  return inOrder(draft.steps.filter((node) => node.data.deprecated !== true && node.data.chapter === iri));
}

function inOrder<T extends { position?: number }>(nodes: DraftNode<T>[]): DraftNode<T>[] {
  const at = (node: DraftNode<T>) => node.data.position ?? Number.POSITIVE_INFINITY;
  // Ids are unique: two never compare equal.
  return nodes.sort((a, b) => at(a) - at(b) || (a.id < b.id ? -1 : 1));
}

/** `order` (live siblings' ids) numbered 0, 1, …, each given its position. */
function renumbered<T extends { position?: number }>(nodes: readonly DraftNode<T>[], order: readonly string[]): DraftNode<T>[] {
  return nodes.map((node) => {
    const at = order.indexOf(node.id);
    return at === -1 || node.data.position === at ? node : { id: node.id, data: { ...node.data, position: at } };
  });
}

/** The ids in order with `id` put at `at` (the end when absent or past it). */
function placed(order: readonly string[], id: string, at: number | undefined): string[] {
  const rest = order.filter((one) => one !== id);
  const index = at === undefined ? rest.length : Math.max(0, Math.min(at, rest.length));
  return [...rest.slice(0, index), id, ...rest.slice(index)];
}

function addChapter(draft: ReleaseDraft, id: string, text: ChapterText, at: number | undefined): ReleaseDraft | DraftRefusal {
  if (!draft.course) return { refused: "notACourse" };
  const added = addNode(draft, "chapters", id, { ...defined(text), course: draft.url, reviewQuestion: [] });
  if (isRefusal(added)) return added;
  const order = placed(liveChapters(draft).map((node) => node.id), id, at);
  return withNodes(added, "chapters", renumbered(added.chapters, order));
}

function moveChapter(draft: ReleaseDraft, id: string, to: number): ReleaseDraft | DraftRefusal {
  const chapter = nodeOf(draft, "chapters", id);
  if (chapter === undefined) return { refused: "missing", id };
  if (chapter.data.deprecated === true) return draft;
  const order = placed(liveChapters(draft).map((node) => node.id), id, to);
  return withNodes(draft, "chapters", renumbered(draft.chapters, order));
}

function addStep(draft: ReleaseDraft, id: string, chapter: string, text: StepText, at: number | undefined): ReleaseDraft | DraftRefusal {
  if (!draft.course) return { refused: "notACourse" };
  if (nodeOf(draft, "chapters", chapter) === undefined) return { refused: "missing", id: chapter };
  const added = addNode(draft, "steps", id, { ...defined(text), chapter: iriIn(draft, chapter), checkedBy: [] });
  if (isRefusal(added)) return added;
  const order = placed(liveSteps(draft, chapter).map((node) => node.id), id, at);
  return withNodes(added, "steps", renumbered(added.steps, order));
}

function moveStep(draft: ReleaseDraft, id: string, chapter: string, to: number): ReleaseDraft | DraftRefusal {
  const step = nodeOf(draft, "steps", id);
  if (step === undefined) return { refused: "missing", id };
  if (nodeOf(draft, "chapters", chapter) === undefined) return { refused: "missing", id: chapter };
  const from = step.data.chapter === undefined ? null : idIn(draft, step.data.chapter);
  const moved = withNodes(
    draft,
    "steps",
    draft.steps.map((node) => (node.id === id ? { id, data: { ...node.data, chapter: iriIn(draft, chapter) } } : node)),
  );
  if (step.data.deprecated === true) return moved;
  let steps = renumbered(moved.steps, placed(liveSteps(moved, chapter).map((node) => node.id), id, to));
  // The chapter it left is numbered again too.
  if (from !== null && from !== chapter) steps = renumbered(steps, liveSteps({ ...moved, steps }, from).map((node) => node.id));
  return withNodes(draft, "steps", steps);
}

/** Where a card is asked now; null when nowhere. */
export function placeOf(draft: ReleaseDraft, card: string): QuestionPlace | null {
  const iri = iriIn(draft, card);
  const step = draft.steps.find((node) => node.data.checkedBy.includes(iri));
  if (step !== undefined) return { kind: "step", step: step.id };
  const chapter = draft.chapters.find((node) => node.data.reviewQuestion.includes(iri));
  return chapter === undefined ? null : { kind: "review", chapter: chapter.id };
}

/** The draft with the card asked from nowhere. */
function unasked(draft: ReleaseDraft, iri: string): ReleaseDraft {
  return {
    ...draft,
    steps: draft.steps.map((node) =>
      node.data.checkedBy.includes(iri) ? { id: node.id, data: { ...node.data, checkedBy: node.data.checkedBy.filter((one) => one !== iri) } } : node,
    ),
    chapters: draft.chapters.map((node) =>
      node.data.reviewQuestion.includes(iri)
        ? { id: node.id, data: { ...node.data, reviewQuestion: node.data.reviewQuestion.filter((one) => one !== iri) } }
        : node,
    ),
  };
}

function askedAt(draft: ReleaseDraft, iri: string, place: QuestionPlace): ReleaseDraft | DraftRefusal {
  if (place.kind === "step") {
    if (nodeOf(draft, "steps", place.step) === undefined) return { refused: "missing", id: place.step };
    return withNodes(
      draft,
      "steps",
      draft.steps.map((node) => (node.id === place.step ? { id: node.id, data: { ...node.data, checkedBy: [...node.data.checkedBy, iri] } } : node)),
    );
  }
  if (nodeOf(draft, "chapters", place.chapter) === undefined) return { refused: "missing", id: place.chapter };
  return withNodes(
    draft,
    "chapters",
    draft.chapters.map((node) =>
      node.id === place.chapter ? { id: node.id, data: { ...node.data, reviewQuestion: [...node.data.reviewQuestion, iri] } } : node,
    ),
  );
}

function addQuestion(draft: ReleaseDraft, card: string, place: QuestionPlace): ReleaseDraft | DraftRefusal {
  if (!draft.course) return { refused: "notACourse" };
  if (nodeOf(draft, "cards", card) === undefined) return { refused: "missing", id: card };
  const now = placeOf(draft, card);
  if (now !== null) return { refused: "askedElsewhere", card, place: now };
  return askedAt(draft, iriIn(draft, card), place);
}

function moveQuestion(draft: ReleaseDraft, card: string, place: QuestionPlace | null): ReleaseDraft | DraftRefusal {
  if (nodeOf(draft, "cards", card) === undefined) return { refused: "missing", id: card };
  if (place !== null && !draft.course) return { refused: "notACourse" };
  const iri = iriIn(draft, card);
  const from = unasked(draft, iri);
  return place === null ? from : askedAt(from, iri, place);
}

function addDistractor(draft: ReleaseDraft, card: string, id: string, distractor: DistractorText): ReleaseDraft | DraftRefusal {
  if (nodeOf(draft, "cards", card) === undefined) return { refused: "missing", id: card };
  const added = addNode(draft, "distractors", id, defined(distractor));
  if (isRefusal(added)) return added;
  const iri = iriIn(draft, id);
  return withNodes(
    added,
    "cards",
    added.cards.map((node) => (node.id === card ? { id: card, data: { ...node.data, distractor: [...node.data.distractor, iri] } } : node)),
  );
}

// --- Deleting

/** The draft without the subjects (by IRI) and every statement of them or naming them. */
function without(draft: ReleaseDraft, iris: ReadonlySet<string>): ReleaseDraft {
  const kept = <T>(nodes: readonly DraftNode<T>[]) => nodes.filter((node) => !iris.has(iriIn(draft, node.id)));
  const others = (list: readonly string[]) => list.filter((one) => !iris.has(one));
  return {
    ...draft,
    chapters: kept(draft.chapters).map((node) => ({ id: node.id, data: { ...node.data, reviewQuestion: others(node.data.reviewQuestion) } })),
    steps: kept(draft.steps).map((node) => ({ id: node.id, data: { ...node.data, checkedBy: others(node.data.checkedBy) } })),
    cards: kept(draft.cards).map((node) => ({ id: node.id, data: { ...node.data, distractor: others(node.data.distractor) } })),
    distractors: kept(draft.distractors),
    triples: draft.triples.filter((triple) => !iris.has(triple.subject) && !(triple.object.kind === "iri" && iris.has(triple.object.value))),
  };
}

function deleteSubject(draft: ReleaseDraft, of: DraftKind, id: string): ReleaseDraft | DraftRefusal {
  if (nodeOf(draft, NODES[of], id) === undefined) return { refused: "missing", id };
  // What goes with it: a chapter's steps, a card's distractors.
  const going: { of: DraftKind; id: string }[] = [{ of, id }];
  if (of === "chapter") {
    const iri = iriIn(draft, id);
    going.push(...draft.steps.filter((node) => node.data.chapter === iri).map((node) => ({ of: "step" as const, id: node.id })));
  }
  if (of === "card") {
    going.push(
      ...nodeOf(draft, "cards", id)!
        .data.distractor.map((iri) => idIn(draft, iri))
        .filter((one): one is string => one !== null && nodeOf(draft, "distractors", one) !== undefined)
        .map((one) => ({ of: "distractor" as const, id: one })),
    );
  }
  const published = going.find((subject) => subject.id in draft.published.ids);
  if (published !== undefined) return { refused: "published", ...published };
  // A card asked by what goes stays, asked from nowhere; what is in use is numbered again.
  return renumberedOutline(without(draft, new Set(going.map((subject) => iriIn(draft, subject.id)))));
}

/** The chapters in use numbered 0, 1, …, and the steps in use of each chapter. */
function renumberedOutline(draft: ReleaseDraft): ReleaseDraft {
  const chapters = renumbered(draft.chapters, liveChapters(draft).map((node) => node.id));
  const steps = draft.chapters.reduce(
    (current, chapter) => renumbered(current, liveSteps({ ...draft, steps: current }, chapter.id).map((node) => node.id)),
    draft.steps,
  );
  return { ...draft, chapters, steps };
}

// --- How the release was made

function setSource(draft: ReleaseDraft, iri: string, source: DraftSource | null): ReleaseDraft | DraftRefusal {
  const generating = ownGeneratingActivities(draft);
  const carried = new Set(draft.published.activities.map((id) => iriIn(draft, id)));
  const usedBy = (triple: DraftTriple) => triple.predicate === `${PROV}used` && triple.object.kind === "iri" && triple.object.value === iri;
  // What it states is kept when removed while an earlier version's making still uses it.
  const described = source === null && draft.triples.some((triple) => usedBy(triple) && carried.has(triple.subject));
  const triples = draft.triples.filter((triple) => (described || triple.subject !== iri) && !(usedBy(triple) && generating.includes(triple.subject)));
  const derived = draft.root.wasDerivedFrom.filter((one) => one !== iri);
  if (source === null) {
    if (triples.length === draft.triples.length && derived.length === draft.root.wasDerivedFrom.length) return { refused: "missing", id: iri };
    return { ...draft, root: { ...draft.root, wasDerivedFrom: derived }, triples };
  }
  // A source is one the release is derived from or a making used: else nothing would point to what it states.
  if (!source.derivedFrom && !source.used && !triples.some((triple) => usedBy(triple) && carried.has(triple.subject))) return { refused: "unusedSource", id: iri };
  const making = source.used ? usingMaking({ ...draft, triples }) : { draft: { ...draft, triples }, activities: [] };
  const used = making.activities.map((activity) => ({ subject: activity, predicate: `${PROV}used`, object: { kind: "iri" as const, value: iri } }));
  return {
    ...draft,
    root: { ...draft.root, wasDerivedFrom: source.derivedFrom ? [...derived, iri] : derived },
    triples: [...making.draft.triples, ...source.statements.map((statement) => ({ subject: iri, ...statement })), ...used],
  };
}

/** The activities a source is used by: the draft's own making (withOwnMaking), else one made for it (withMaking). */
function usingMaking(draft: ReleaseDraft): { draft: ReleaseDraft; activities: string[] } {
  const own = withOwnMaking(draft);
  if (own.activities.length > 0) return own;
  const made = withMaking(draft);
  return { draft: made.draft, activities: [made.making] };
}

/** The activities the release states it was generated by (prov:wasGeneratedBy), by IRI. */
export function generatingActivities(draft: ReleaseDraft): string[] {
  return draft.triples
    .filter((triple) => triple.subject === draft.url && triple.predicate === `${PROV}wasGeneratedBy` && triple.object.kind === "iri")
    .map((triple) => triple.object.value);
}

/** The activities the release states it was generated by that are the draft's own, not carried from an earlier release. */
function ownGeneratingActivities(draft: ReleaseDraft): string[] {
  const carried = new Set(draft.published.activities.map((id) => iriIn(draft, id)));
  return generatingActivities(draft).filter((activity) => !carried.has(activity));
}

/**
 * The activities a check informs and a source is used by: the draft's
 * own that generated the release. A release generated only by
 * activities carried from an earlier one (a next version's) is given one
 * of its own, `#revision-<version>` (an id none of `reserved`), since
 * those are not rewritten; a release that names none stays so.
 */
function withOwnMaking(draft: ReleaseDraft, reserved: readonly string[] = []): { draft: ReleaseDraft; activities: string[] } {
  const own = ownGeneratingActivities(draft);
  if (own.length > 0 || generatingActivities(draft).length === 0) return { draft, activities: own };
  const taken = new Set([...idsInUse(draft), ...Object.keys(draft.published.ids), ...draft.published.activities, ...reserved]);
  const base = `revision-${draft.root.version ?? "1"}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  const iri = iriIn(draft, id);
  return {
    draft: {
      ...draft,
      triples: [
        ...draft.triples,
        { subject: draft.url, predicate: `${PROV}wasGeneratedBy`, object: { kind: "iri", value: iri } },
        { subject: iri, predicate: RDF_TYPE, object: { kind: "iri", value: `${PROV}Activity` } },
      ],
    },
    activities: [iri],
  };
}

/** The activities of the draft (prov:Activity), by id. */
export function activitiesOf(draft: ReleaseDraft): string[] {
  return draft.triples
    .filter((triple) => triple.predicate === RDF_TYPE && triple.object.kind === "iri" && triple.object.value === `${PROV}Activity`)
    .map((triple) => idIn(draft, triple.subject))
    .filter((id): id is string => id !== null);
}

/**
 * How a check reads in the record, in English or Swedish (another
 * language reads as English): never a human review, in its own words.
 */
const CHECK_WORDING: Record<"en" | "sv", Record<CheckActivity["check"], { label: (label: string) => string; scope: (scope: string) => string }> & { outcome: (outcome: string) => string }> = {
  en: {
    machine: { label: (label) => label, scope: (scope) => `Scope: ${scope}; a machine check, not a human review.` },
    ai: { label: (label) => `${label} (AI)`, scope: (scope) => `Scope: ${scope}; an AI check, not a human review.` },
    outcome: (outcome) => `Outcome: ${outcome}`,
  },
  sv: {
    machine: { label: (label) => label, scope: (scope) => `Omfattning: ${scope}; en maskinell kontroll, inte en granskning av en människa.` },
    ai: { label: (label) => `${label} (AI)`, scope: (scope) => `Omfattning: ${scope}; en kontroll av AI, inte en granskning av en människa.` },
    outcome: (outcome) => `Utfall: ${outcome}`,
  },
};

/** The statements that record a check: a prov:Activity with when it ended, its label, scope and outcome. */
export function checkActivityTriples(iri: string, activity: CheckActivity): DraftTriple[] {
  const language = activity.language === "sv" ? "sv" : "en";
  const wording = CHECK_WORDING[language];
  const text = (value: string) => ({ kind: "literal" as const, value, language, datatype: LANG_STRING });
  return [
    { subject: iri, predicate: RDF_TYPE, object: { kind: "iri", value: `${PROV}Activity` } },
    { subject: iri, predicate: `${PROV}endedAtTime`, object: { kind: "literal", value: activity.endedAt, language: "", datatype: XSD_DATE_TIME } },
    { subject: iri, predicate: `${RDFS}label`, object: text(wording[activity.check].label(activity.label.trim())) },
    { subject: iri, predicate: `${RDFS}comment`, object: text(wording[activity.check].scope(activity.scope.trim())) },
    { subject: iri, predicate: `${RDFS}comment`, object: text(wording.outcome(activity.outcome.trim())) },
  ];
}

/**
 * The check an activity of the draft records, read back: null unless its
 * statements are exactly those checkActivityTriples writes for one, so
 * an activity written otherwise is never rewritten by an edit.
 */
export function readCheckActivity(draft: ReleaseDraft, id: string): CheckActivity | null {
  const iri = iriIn(draft, id);
  const said = draft.triples.filter((triple) => triple.subject === iri);
  const literal = (predicate: string) => said.find((triple) => triple.predicate === predicate && triple.object.kind === "literal")?.object as ReleaseText | undefined;
  const label = literal(`${RDFS}label`);
  const endedAt = literal(`${PROV}endedAtTime`);
  if (label === undefined || endedAt === undefined) return null;
  const comments = said.flatMap((triple) => (triple.predicate === RDFS_COMMENT && triple.object.kind === "literal" ? [triple.object.value] : []));
  // What a wording puts around its text: its words before and after.
  const around = (word: (text: string) => string, text: string) => {
    const [before, after] = word("\u0000").split("\u0000") as [string, string];
    return text.startsWith(before) && text.endsWith(after) && text.length >= before.length + after.length ? text.slice(before.length, text.length - after.length) : null;
  };
  const language = label.language === "sv" ? "sv" : "en";
  const wording = CHECK_WORDING[language];
  for (const check of ["machine", "ai"] as const) {
    const name = around(wording[check].label, label.value);
    const scope = comments.map((comment) => around(wording[check].scope, comment)).find((one) => one !== null);
    const outcome = comments.map((comment) => around(wording.outcome, comment)).find((one) => one !== null);
    if (name === null || scope === undefined || outcome === undefined) continue;
    const activity: CheckActivity = { check, label: name, scope: scope!, outcome: outcome!, endedAt: endedAt.value, language: label.language };
    if (canonical(checkActivityTriples(iri, activity).map(keyOfTriple).sort()) === canonical(said.map(keyOfTriple).sort())) return activity;
  }
  return null;
}

function addCheckActivity(draft: ReleaseDraft, id: string, activity: CheckActivity): ReleaseDraft | DraftRefusal {
  const refusal = refuseId(draft, id);
  if (refusal !== null) return refusal;
  const iri = iriIn(draft, id);
  const making = withOwnMaking(draft, [id]);
  const informed = making.activities.map((generating) => ({
    subject: generating,
    predicate: `${PROV}wasInformedBy`,
    object: { kind: "iri" as const, value: iri },
  }));
  return { ...draft, triples: [...making.draft.triples, ...checkActivityTriples(iri, activity), ...informed] };
}

function refuseActivity(draft: ReleaseDraft, id: string): DraftRefusal | null {
  if (draft.published.activities.includes(id)) return { refused: "carriedActivity", id };
  if (!activitiesOf(draft).includes(id)) return { refused: "missing", id };
  return null;
}

function editCheckActivity(draft: ReleaseDraft, id: string, activity: CheckActivity): ReleaseDraft | DraftRefusal {
  const refusal = refuseActivity(draft, id);
  if (refusal !== null) return refusal;
  const iri = iriIn(draft, id);
  return { ...draft, triples: [...draft.triples.filter((triple) => triple.subject !== iri), ...checkActivityTriples(iri, activity)] };
}

function deleteActivity(draft: ReleaseDraft, id: string): ReleaseDraft | DraftRefusal {
  const refusal = refuseActivity(draft, id);
  if (refusal !== null) return refusal;
  const iri = iriIn(draft, id);
  const triples = draft.triples.filter((triple) => triple.subject !== iri && !(triple.object.kind === "iri" && triple.object.value === iri));
  // A source only this activity used is no source any more: what the draft states of it goes too, so nothing is left that nothing names.
  const sources = new Set(draft.triples.filter((triple) => triple.subject === iri && triple.predicate === `${PROV}used`).map((triple) => triple.object.value));
  const named = (source: string) => draft.root.wasDerivedFrom.includes(source) || triples.some((triple) => triple.object.kind === "iri" && triple.object.value === source);
  return { ...draft, triples: triples.filter((triple) => !sources.has(triple.subject) || named(triple.subject)) };
}

// --- The licence

/** The statement that types a licence a dcterms:LicenseDocument, as DCAT-AP asks of it. */
export function licenseType(license: string): DraftTriple {
  return { subject: license, predicate: RDF_TYPE, object: { kind: "iri", value: LICENSE_DOCUMENT } };
}

/**
 * The draft with its licence set, and typed: the licence it had loses
 * its type when nothing else in the draft names it (a source's licence
 * may), so the release says nothing of a licence it no longer has.
 */
function setLicense(draft: ReleaseDraft, license: string | null): ReleaseDraft {
  const { license: before, ...root } = draft.root;
  const typed = (triples: readonly DraftTriple[], iri: string) => triples.some((triple) => keyOfTriple(triple) === keyOfTriple(licenseType(iri)));
  let triples = [...draft.triples];
  if (before !== undefined && before !== license && !triples.some((triple) => triple.object.kind === "iri" && triple.object.value === before)) {
    triples = triples.filter((triple) => keyOfTriple(triple) !== keyOfTriple(licenseType(before)));
  }
  if (license !== null && !typed(triples, license)) triples.push(licenseType(license));
  return { ...draft, root: license === null ? root : { ...root, license }, triples };
}

// --- The attribution and the notes of the release's making

/** "A", "A and B", "A, B and C", with the language's "and". */
function namesIn(names: readonly string[], and: string): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}`;
}

/**
 * The attribution of a release's making, in English or Swedish (another
 * language reads as English): "Compiled by <names>", with or without
 * "with the help of AI". It says who compiled it, never that anyone
 * reviewed it.
 */
export function attributionText(names: readonly string[], ai: boolean, language: string): string {
  return language === "sv"
    ? `Sammanställd av ${namesIn(names, "och")}${ai ? " med hjälp av AI" : ""}.`
    : `Compiled by ${namesIn(names, "and")}${ai ? " with the help of AI" : ""}.`;
}

/**
 * The attributions attributionText writes for the draft's authors, in
 * English and Swedish, by language and text: whether each says AI
 * helped. A comment is an attribution only when it is one of these, so
 * a note that only starts as one ("Compiled by hand…") stays a note.
 */
function attributionsOf(draft: ReleaseDraft): Map<string, boolean> {
  const names = authorNames(draft);
  const texts = new Map<string, boolean>();
  if (names.length === 0) return texts;
  for (const language of ["en", "sv"]) for (const ai of [false, true]) texts.set(`${language} ${attributionText(names, ai, language)}`, ai);
  return texts;
}

/** Whether a statement of an activity is an attribution comment, of those `attributions` (attributionsOf) has. */
function isAttribution(attributions: ReadonlyMap<string, boolean>, triple: DraftTriple): boolean {
  const { object } = triple;
  return triple.predicate === RDFS_COMMENT && object.kind === "literal" && attributions.has(`${object.language} ${object.value}`);
}

/** The release's own making: the first activity of the draft's own that generated it; null when it has none. */
export function ownMakingOf(draft: ReleaseDraft): string | null {
  return ownGeneratingActivities(draft)[0] ?? null;
}

/**
 * The attribution the release's own making states: whether it says AI
 * helped, and its English text (else its first); null when it states
 * none.
 */
export function attributionOf(draft: ReleaseDraft): { ai: boolean; text: string } | null {
  const making = ownMakingOf(draft);
  const attributions = attributionsOf(draft);
  const said = draft.triples.filter((triple) => triple.subject === making && isAttribution(attributions, triple)).map((triple) => triple.object as ReleaseText);
  const shown = said.find((text) => text.language === "en") ?? said[0];
  if (shown === undefined) return null;
  return { ai: attributions.get(`${shown.language} ${shown.value}`)!, text: shown.value };
}

/** What the release's own making says beside its attribution: each language's comments, a paragraph each. */
export function makingNotesOf(draft: ReleaseDraft): LangText {
  const making = ownMakingOf(draft);
  const attributions = attributionsOf(draft);
  const notes: Record<string, string[]> = {};
  for (const triple of draft.triples) {
    if (triple.subject !== making || triple.predicate !== RDFS_COMMENT || triple.object.kind !== "literal" || isAttribution(attributions, triple)) continue;
    (notes[triple.object.language] ??= []).push(triple.object.value);
  }
  return Object.fromEntries(Object.entries(notes).map(([language, paragraphs]) => [language, paragraphs.join("\n\n")]));
}

/**
 * The draft with a making of its own, which it states generated the
 * release: the one it has, the one a next version is given
 * (withOwnMaking), or, for a release that names none, `#compilation`
 * (or the first such id free).
 */
function withMaking(draft: ReleaseDraft): { draft: ReleaseDraft; making: string } {
  const own = withOwnMaking(draft);
  if (own.activities.length > 0) return { draft: own.draft, making: own.activities[0]! };
  const taken = new Set([...idsInUse(draft), ...Object.keys(draft.published.ids), ...draft.published.activities]);
  let id = "compilation";
  for (let n = 2; taken.has(id); n++) id = `compilation-${n}`;
  const iri = iriIn(draft, id);
  return {
    draft: {
      ...draft,
      triples: [
        ...draft.triples,
        { subject: draft.url, predicate: `${PROV}wasGeneratedBy`, object: { kind: "iri", value: iri } },
        { subject: iri, predicate: RDF_TYPE, object: { kind: "iri", value: `${PROV}Activity` } },
      ],
    },
    making: iri,
  };
}

/** The comments of the release's own making that `keep` keeps, then `comments`; made when there are any and it has none. */
function withMakingComments(draft: ReleaseDraft, keep: (triple: DraftTriple) => boolean, comments: readonly ReleaseText[]): ReleaseDraft {
  const existing = ownMakingOf(draft);
  if (existing === null && comments.length === 0) return draft;
  const made = withMaking(draft);
  const triples = made.draft.triples.filter((triple) => triple.subject !== made.making || triple.predicate !== RDFS_COMMENT || keep(triple));
  return { ...made.draft, triples: [...triples, ...comments.map((object) => ({ subject: made.making, predicate: RDFS_COMMENT, object }))] };
}

function commentIn(value: string, language: string): ReleaseText {
  return { kind: "literal", value, language, datatype: language === "" ? XSD_STRING : LANG_STRING };
}

/** The names of the release's authors (dcterms:creator), as its agents name them, in order. */
export function authorNames(draft: ReleaseDraft): string[] {
  return draft.root.creator.flatMap((iri) => {
    const id = idIn(draft, iri);
    const agent = id === null ? undefined : nodeOf(draft, "agents", id);
    return agent === undefined ? [] : [agent.data.name];
  });
}

function setAttribution(draft: ReleaseDraft, attribution: { ai: boolean } | null): ReleaseDraft | DraftRefusal {
  const attributions = attributionsOf(draft);
  const kept = (triple: DraftTriple) => !isAttribution(attributions, triple);
  if (attribution === null) return withMakingComments(draft, kept, []);
  const names = authorNames(draft);
  if (names.length === 0) return { refused: "noAuthors" };
  const comments = ["en", "sv"].map((language) => commentIn(attributionText(names, attribution.ai, language), language));
  return withMakingComments(draft, kept, comments);
}

function setMakingNotes(draft: ReleaseDraft, notes: LangText): ReleaseDraft {
  const attributions = attributionsOf(draft);
  const comments = Object.entries(notes).flatMap(([language, text]) =>
    text
      .split(/\n\s*\n/u)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph !== "")
      .map((paragraph) => commentIn(paragraph, language)),
  );
  return withMakingComments(draft, (triple) => isAttribution(attributions, triple), comments);
}

// ---------------------------------------------------------------------------
// Reading a draft

/** The ids an earlier release published and the activities it carries, of a release read whole: every subject it has, retired or not. */
export function publishedIdsOf(release: ReleaseDraft): PublishedIds {
  const ids: Record<string, ReleaseKind> = { ...release.published.ids };
  for (const kind of Object.keys(NODES) as DraftKind[]) {
    for (const node of release[NODES[kind]]) ids[node.id] = kind;
  }
  return { ids, activities: [...new Set([...release.published.activities, ...activitiesOf(release)])] };
}

// ---------------------------------------------------------------------------
// Merging

/** A value as a string to compare by, whatever order its records' fields are in. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_field, one: unknown) =>
    one !== null && typeof one === "object" && !Array.isArray(one) ? Object.fromEntries(Object.entries(one).sort(([a], [b]) => (a < b ? -1 : 1))) : one,
  );
}

const LISTS = ["agents", "distributions", "chapters", "steps", "cards", "distractors"] as const;

/** Each part of a draft that a change makes or not, by a key: what it says of itself, each record, each subject's statements. */
function partsOf(draft: ReleaseDraft): Map<string, string> {
  const parts = new Map<string, string>([["root", canonical({ course: draft.course, root: draft.root })]]);
  for (const list of LISTS) for (const node of draft[list] as readonly DraftNode<unknown>[]) parts.set(`${list} ${node.id}`, canonical(node.data));
  const statements = new Map<string, string[]>();
  for (const triple of draft.triples) {
    const said = statements.get(triple.subject) ?? [];
    statements.set(triple.subject, [...said, canonical([triple.predicate, triple.object])]);
  }
  for (const [subject, said] of statements) parts.set(`triples ${subject}`, JSON.stringify(said.sort()));
  return parts;
}

/**
 * `mine`, a change of `base`, made on `theirs`, which is `base` as it
 * changed since (elsewhere, or by part of `mine` written already): each
 * part of the draft (what it says of itself, a record, a subject's
 * statements) as `mine` says it where it changed it, else as `theirs`
 * does. Null when both changed a part, each its own way.
 */
export function mergedDraft(base: ReleaseDraft, mine: ReleaseDraft, theirs: ReleaseDraft): ReleaseDraft | null {
  const [was, made, now] = [base, mine, theirs].map(partsOf) as [Map<string, string>, Map<string, string>, Map<string, string>];
  const ours = new Set<string>();
  for (const key of new Set([...was.keys(), ...made.keys(), ...now.keys()])) {
    if (made.get(key) === was.get(key)) continue;
    if (now.get(key) !== was.get(key) && now.get(key) !== made.get(key)) return null;
    ours.add(key);
  }
  const from = (key: string) => (ours.has(key) ? mine : theirs);
  const nodes = <K extends (typeof LISTS)[number]>(list: K): ReleaseDraft[K] => {
    const ids = [...new Set([...theirs[list], ...mine[list]].map((node) => node.id))];
    return ids.flatMap((id) => (from(`${list} ${id}`)[list] as readonly DraftNode<unknown>[]).filter((node) => node.id === id)) as ReleaseDraft[K];
  };
  const root = from("root");
  return {
    ...theirs,
    course: root.course,
    root: root.root,
    agents: nodes("agents"),
    distributions: nodes("distributions"),
    chapters: nodes("chapters"),
    steps: nodes("steps"),
    cards: nodes("cards"),
    distractors: nodes("distractors"),
    triples: [
      ...theirs.triples.filter((triple) => !ours.has(`triples ${triple.subject}`)),
      ...mine.triples.filter((triple) => ours.has(`triples ${triple.subject}`)),
    ],
  };
}
