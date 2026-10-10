import { ensureTrailingSlash } from "../instanceLayout.ts";
import type { LangText } from "../langText.ts";
import { idIn, iriIn, type ReleaseDraft } from "./releaseDraft.ts";

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

/** The draft a release document is of: its instance, name and version; null for a URL no draft has. */
export function draftPlaceOf(draftUrl: string): { instanceUrl: string; name: string; version: number } | null {
  const match = /^(.*\/)drafts\/([^/]+)\/v([1-9][0-9]*)\/release\.ttl$/.exec(draftUrl);
  return match === null ? null : { instanceUrl: match[1]!, name: match[2]!, version: Number(match[3]) };
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
export function unreadableDraftSummary(url: string, place: { instanceUrl: string; name: string; version: number }): ReleaseDraftSummary {
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
export type DraftDocument = { kind: "release" } | { kind: "cards" } | { kind: "chapter"; chapter: string };

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
  for (const node of draft.chapters) places.set(iriIn(draft, node.id), { kind: "chapter", chapter: node.id });
  for (const node of draft.steps) {
    const chapter = node.data.chapter === undefined ? null : idIn(draft, node.data.chapter);
    places.set(iriIn(draft, node.id), chapter !== null && chapters.has(chapter) ? { kind: "chapter", chapter } : release);
  }
  const asking = new Map<string, DraftDocument>();
  for (const node of draft.chapters) {
    for (const card of node.data.reviewQuestion) asking.set(card, places.get(iriIn(draft, node.id))!);
  }
  for (const node of draft.steps) {
    for (const card of node.data.checkedBy) asking.set(card, places.get(iriIn(draft, node.id))!);
  }
  for (const node of draft.cards) {
    const iri = iriIn(draft, node.id);
    const place = asking.get(iri) ?? { kind: "cards" };
    places.set(iri, place);
    for (const distractor of node.data.distractor) if (!places.has(distractor)) places.set(distractor, place);
  }
  for (const node of draft.distractors) {
    const iri = iriIn(draft, node.id);
    if (!places.has(iri)) places.set(iri, { kind: "cards" });
  }
  // A blank node goes with the subject that names it, however deep.
  const namedBy = new Map<string, string>();
  for (const triple of draft.triples) {
    if (triple.object.kind === "blank" && !namedBy.has(`_:${triple.object.value}`)) namedBy.set(`_:${triple.object.value}`, triple.subject);
  }
  const placeOf = (subject: string, seen: Set<string>): DraftDocument => {
    const known = places.get(subject);
    if (known !== undefined) return known;
    const parent = namedBy.get(subject);
    return parent === undefined || seen.has(parent) ? release : placeOf(parent, seen.add(parent));
  };
  for (const triple of draft.triples) {
    if (!places.has(triple.subject)) places.set(triple.subject, placeOf(triple.subject, new Set([triple.subject])));
  }
  places.set(draft.url, release);
  return places;
}

/**
 * A name for a draft, from its title: lower-case letters, digits and
 * dashes, accents dropped, then `-2`, `-3`… until it is none of `taken`;
 * "draft" when nothing of the title is left.
 */
export function draftNameFor(title: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const slug =
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 60)
      .replace(/^-+|-+$/g, "") || "draft";
  let name = slug;
  for (let n = 2; used.has(name); n++) name = `${slug}-${n}`;
  return name;
}
