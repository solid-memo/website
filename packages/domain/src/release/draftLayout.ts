// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { ensureTrailingSlash, hasDotSegment, isDocumentIn } from "../instanceLayout.ts";
import type { LangText } from "../langText.ts";
import {
  canonical,
  type DraftNode,
  type DraftTriple,
  idIn,
  iriIn,
  type ReleaseDraft,
} from "./releaseDraft.ts";

/**
 * Where a draft keeps its documents (docs/data-model.md, Drafts): the
 * container `<instance>/drafts/<name>/v<N>/`, which holds
 *
 * - `release.ttl`: the release's root (the draft deck, the document
 *   itself), its agents, its distribution, its sources and how it was
 *   made, and anything else that is no chapter's or card's;
 * - `chapter-<id>.ttl` per chapter: the chapter, its steps, the cards
 *   they ask and their distractors;
 * - `cards.ttl`: the cards no chapter asks (a plain deck's, or questions
 *   not yet placed) and their distractors.
 *
 * A subject keeps its fragment id in whichever document it is; the draft
 * names it as a fragment of `release.ttl`, as the release will
 * (releaseDraft.ts).
 */

export const RELEASE_DOCUMENT = "release.ttl";
export const CARDS_DOCUMENT = "cards.ttl";
const CHAPTER_DOCUMENT = /^chapter-([A-Za-z0-9][A-Za-z0-9._-]*)\.ttl$/;

/** The container of an instance's drafts. */
export function draftsContainerOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}drafts/`;
}

/** A draft's release document: `<instance>/drafts/<name>/v<N>/release.ttl`. */
export function draftUrlOf(instanceUrl: string, name: string, version: number): string {
  return `${draftsContainerOf(instanceUrl)}${name}/v${version}/${RELEASE_DOCUMENT}`;
}

/** A draft's container, from its release document. */
export function draftContainerOf(draftUrl: string): string {
  return draftUrl.slice(0, draftUrl.lastIndexOf("/") + 1);
}

/**
 * The draft a release document is of: its instance, name and version;
 * null for a URL no draft has. The catalog that links a draft is data
 * anyone may have written, so the address is taken only in the
 * instance's `drafts/` as a request would send it (isDocumentIn), and
 * with no dot segment (`..`, `%2e%2E`; hasDotSegment), which would lead
 * elsewhere than its name and instance say. Its version is a safe
 * integer, so that draftUrlOf names the same draft again.
 */
export function draftPlaceOf(
  draftUrl: string,
): { instanceUrl: string; name: string; version: number } | null {
  const match = /^(.*\/)drafts\/([^/]+)\/v([1-9][0-9]*)\/release\.ttl$/.exec(draftUrl);
  return match === null ||
    !Number.isSafeInteger(Number(match[3])) ||
    hasDotSegment(draftUrl) ||
    !isDocumentIn(draftUrl, draftsContainerOf(match[1]!))
    ? null
    : { instanceUrl: match[1]!, name: match[2]!, version: Number(match[3]) };
}

/**
 * A draft as the list of an instance's drafts shows it: where it is, its
 * name and version (its place), and what its release document says of
 * it, unless that could not be read (`readable` false, a title of none).
 */
export interface ReleaseDraftSummary {
  /** Its release document. */
  url: string;
  instanceUrl: string;
  name: string;
  version: number;
  readable: boolean;
  title: LangText;
  course: boolean;
  /** The release it was published as, once it was: it is then no longer edited. */
  releasedAs?: string;
}

/** The summary of a draft read; null for a draft at a URL no draft has (draftPlaceOf). */
export function draftSummaryOf(draft: ReleaseDraft): ReleaseDraftSummary | null {
  const place = draftPlaceOf(draft.url);
  if (place === null) return null;
  return {
    url: draft.url,
    ...place,
    readable: true,
    title: draft.root.title ?? {},
    course: draft.course,
    ...(draft.root.releasedAs === undefined ? {} : { releasedAs: draft.root.releasedAs }),
  };
}

/** The summary of a draft whose release document could not be read. */
export function unreadableDraftSummary(
  url: string,
  place: { instanceUrl: string; name: string; version: number },
): ReleaseDraftSummary {
  return { url, ...place, readable: false, title: {}, course: false };
}

/** The document of a chapter of the draft. */
export function chapterDocumentOf(draftUrl: string, chapter: string): string {
  return `${draftContainerOf(draftUrl)}chapter-${chapter}.ttl`;
}

/** The document of the cards no chapter asks. */
export function cardsDocumentOf(draftUrl: string): string {
  return `${draftContainerOf(draftUrl)}${CARDS_DOCUMENT}`;
}

/** Whether a resource of a draft's container is one of its documents, by its name in the container. */
export function isDraftDocumentName(name: string): boolean {
  return name === RELEASE_DOCUMENT || name === CARDS_DOCUMENT || CHAPTER_DOCUMENT.test(name);
}

/** Where a draft's subject is kept: in its release document, its cards document, or a chapter's. */
export type DraftDocument =
  | { kind: "release" }
  | { kind: "cards" }
  | { kind: "chapter"; chapter: string };

/** The URL of a document of the draft. */
export function draftDocumentUrl(draftUrl: string, document: DraftDocument): string {
  switch (document.kind) {
    case "release":
      return draftUrl;
    case "cards":
      return cardsDocumentOf(draftUrl);
    case "chapter":
      return chapterDocumentOf(draftUrl, document.chapter);
  }
}

/**
 * The document each subject of the draft is kept in, by its IRI in the
 * draft (a blank node by its `_:` label):
 *
 * - a chapter in its own; a step in its chapter's, when the draft has
 *   that chapter;
 * - a card where it is asked: the document of the step that checks it,
 *   else of the chapter that reviews it, else the cards document;
 * - a distractor with the card that names it, else in the cards
 *   document;
 * - a blank node with the subject that names it;
 * - everything else (the root, agents, distribution, sources,
 *   activities) in the release document.
 */
export function draftDocuments(draft: ReleaseDraft): Map<string, DraftDocument> {
  const places = new Map<string, DraftDocument>();
  const release: DraftDocument = { kind: "release" };
  const chapters = new Set(draft.chapters.map((node) => node.id));
  for (const node of draft.chapters)
    places.set(iriIn(draft, node.id), { kind: "chapter", chapter: node.id });
  for (const node of draft.steps) {
    const chapter = node.data.chapter === undefined ? null : idIn(draft, node.data.chapter);
    places.set(
      iriIn(draft, node.id),
      chapter !== null && chapters.has(chapter) ? { kind: "chapter", chapter } : release,
    );
  }
  const asking = new Map<string, DraftDocument>();
  for (const node of draft.chapters) {
    for (const card of node.data.reviewQuestion)
      asking.set(card, places.get(iriIn(draft, node.id))!);
  }
  for (const node of draft.steps) {
    for (const card of node.data.checkedBy) asking.set(card, places.get(iriIn(draft, node.id))!);
  }
  for (const node of draft.cards) {
    const iri = iriIn(draft, node.id);
    const place = asking.get(iri) ?? { kind: "cards" };
    places.set(iri, place);
    for (const distractor of node.data.distractor)
      if (!places.has(distractor)) places.set(distractor, place);
  }
  for (const node of draft.distractors) {
    const iri = iriIn(draft, node.id);
    if (!places.has(iri)) places.set(iri, { kind: "cards" });
  }
  // A blank node goes with the subject that names it, however deep.
  const namedBy = new Map<string, string>();
  for (const triple of draft.triples) {
    if (triple.object.kind === "blank" && !namedBy.has(`_:${triple.object.value}`))
      namedBy.set(`_:${triple.object.value}`, triple.subject);
  }
  // The chain of names is walked in a loop, not a call per link, and
  // each node walked is placed, so that each is walked once however
  // long the chain and in whatever order its statements come; a chain
  // that comes back to a node walked is in the release document.
  const place = (subject: string) => {
    const chain = new Set<string>();
    let node: string | undefined = subject;
    let found: DraftDocument = release;
    while (node !== undefined && !chain.has(node)) {
      const known = places.get(node);
      if (known !== undefined) {
        found = known;
        break;
      }
      chain.add(node);
      node = namedBy.get(node);
    }
    for (const walked of chain) places.set(walked, found);
  };
  for (const triple of draft.triples) place(triple.subject);
  places.set(draft.url, release);
  return places;
}

/** draftDocuments of a draft, made once per draft: a draft is never changed in place, an edit makes a new one. */
const placesOfDraft = new WeakMap<ReleaseDraft, ReadonlyMap<string, DraftDocument>>();

function placesOf(draft: ReleaseDraft): ReadonlyMap<string, DraftDocument> {
  let places = placesOfDraft.get(draft);
  if (places === undefined) {
    places = draftDocuments(draft);
    placesOfDraft.set(draft, places);
  }
  return places;
}

/** The lists of records that draftDocuments places, and the statements. */
const PLACED = ["chapters", "steps", "cards", "distractors", "triples"] as const;
/** Every list of the draft: agents and distributions are always in the release document. */
const LISTED = ["agents", "distributions", ...PLACED] as const;
type Listed = (typeof LISTED)[number];
type Item = DraftNode<unknown> | DraftTriple;

/**
 * What of an item draftDocuments reads to place the draft's subjects:
 * lists whose items say the same of it, in the same order, lay a draft
 * out the same way.
 */
function placing(list: Listed, item: Item): string {
  if (list === "triples") {
    const { subject, object } = item as DraftTriple;
    return JSON.stringify([subject, object.kind === "blank" ? object.value : null]);
  }
  const { id, data } = item as DraftNode<Record<string, unknown>>;
  switch (list) {
    case "chapters":
      return JSON.stringify([id, data.reviewQuestion]);
    case "steps":
      return JSON.stringify([id, data.chapter, data.checkedBy]);
    case "cards":
      return JSON.stringify([id, data.distractor]);
    default:
      return id;
  }
}

/**
 * How a list of the draft differs from `before` to `after`, by its
 * items' identity: an edit makes a new list, but keeps the items it
 * doesn't change. The items only `before` has (`removed`), those only
 * `after` has (`added`), and whether the items between the ends both
 * keep say the same of where the draft's subjects go (placing).
 */
function listChange(
  list: Listed,
  before: readonly Item[],
  after: readonly Item[],
): { list: Listed; removed: Item[]; added: Item[]; samePlacing: boolean } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  const was = before.slice(start, endBefore);
  const now = after.slice(start, endAfter);
  const left = new Map<Item, number>();
  for (const item of was) left.set(item, (left.get(item) ?? 0) + 1);
  const added = now.filter((item) => {
    const count = left.get(item) ?? 0;
    left.set(item, count - 1);
    return count === 0;
  });
  const removed = was.filter((item) => {
    const count = left.get(item)!;
    left.set(item, count - 1);
    return count > 0;
  });
  const samePlacing =
    list === "agents" ||
    list === "distributions" ||
    (was.length === now.length &&
      was.every((item, at) => placing(list, item) === placing(list, now[at]!)));
  return { list, removed, added, samePlacing };
}

/** A draft and where its subjects go, laid out only when asked. */
interface Layout {
  draft: ReleaseDraft;
  places: () => ReadonlyMap<string, DraftDocument>;
}

/** The URL of the document an item of the draft is in. */
function documentOf({ draft, places }: Layout, list: Listed, item: Item): string {
  if (list === "agents" || list === "distributions") return draft.url;
  const subject =
    list === "triples"
      ? (item as DraftTriple).subject
      : iriIn(draft, (item as DraftNode<unknown>).id);
  return draftDocumentUrl(draft.url, places().get(subject)!);
}

/** An item as its document holds it, to compare by. */
function recordOf(list: Listed, item: Item): unknown {
  if (list === "triples") return item;
  const { id, data } = item as DraftNode<unknown>;
  return [list, id, data];
}

/**
 * What each document loses and gains, as strings to compare by; those
 * that cancel out are no change.
 */
class Delta {
  private readonly documents = new Map<string, Map<string, number>>();

  count(url: string, value: unknown, by: number): void {
    const key = canonical(value);
    const held = this.documents.get(url) ?? new Map<string, number>();
    held.set(key, (held.get(key) ?? 0) + by);
    this.documents.set(url, held);
  }

  /** The documents something was lost from or gained in. */
  changed(): string[] {
    return [...this.documents]
      .filter(([, held]) => [...held.values()].some((by) => by !== 0))
      .map(([url]) => url);
  }
}

/** Each item the change kept that a new layout moves: it writes the document it leaves and the one it enters. */
function countMoved(
  delta: Delta,
  was: Layout,
  now: Layout,
  changes: readonly { list: Listed; added: Item[] }[],
): void {
  for (const list of PLACED) {
    const added = new Set(changes.find((change) => change.list === list)?.added);
    for (const item of now.draft[list] as readonly Item[]) {
      if (added.has(item)) continue;
      const from = documentOf(was, list, item);
      const to = documentOf(now, list, item);
      if (from === to) continue;
      delta.count(from, recordOf(list, item), -1);
      delta.count(to, recordOf(list, item), 1);
    }
  }
}

/**
 * The documents a change of the draft writes, from `before` to `after`
 * (applyDraftChanges, which keeps its URL), by URL: those whose records
 * or statements differ, a document made or emptied among them. A change
 * of a chapter's text writes its document alone; a move of chapters
 * writes each it numbers again.
 *
 * Only what the change made is looked into: the records and statements
 * the change replaced (by identity, as listChange finds them) are
 * compared, and the draft is laid out afresh only when one of them
 * says something new of where subjects go; each record it then moves
 * writes the documents it leaves and enters. Typing in a field of a
 * large draft so costs no more than the field.
 */
export function changedDocuments(before: ReleaseDraft, after: ReleaseDraft): string[] {
  const delta = new Delta();
  if (before.course !== after.course || before.root !== after.root) {
    delta.count(before.url, [before.course, before.root], -1);
    delta.count(after.url, [after.course, after.root], 1);
  }
  const changes = LISTED.filter((list) => before[list] !== after[list]).map((list) =>
    listChange(list, before[list], after[list]),
  );
  const moved = changes.some((change) => !change.samePlacing);
  const was: Layout = { draft: before, places: () => placesOf(before) };
  const now: Layout = { draft: after, places: () => (moved ? placesOf(after) : was.places()) };
  for (const { list, removed, added } of changes) {
    for (const item of removed) delta.count(documentOf(was, list, item), recordOf(list, item), -1);
    for (const item of added) delta.count(documentOf(now, list, item), recordOf(list, item), 1);
  }
  if (moved) countMoved(delta, was, now, changes);
  // A layout the change keeps is the next edit's too.
  const known = placesOfDraft.get(before);
  if (!moved && known !== undefined) placesOfDraft.set(after, known);
  return delta.changed();
}

/**
 * A text as a name of a file or a fragment id: lower-case letters,
 * digits and dashes, accents dropped, at most 60 characters; "" when
 * nothing of it is left.
 */
export function slugOf(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
}

/**
 * A name for a draft, from its title (slugOf), then `-2`, `-3`… until
 * it is none of `taken`; "draft" when nothing of the title is left.
 */
export function draftNameFor(title: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const slug = slugOf(title) || "draft";
  let name = slug;
  for (let n = 2; used.has(name); n++) name = `${slug}-${n}`;
  return name;
}
