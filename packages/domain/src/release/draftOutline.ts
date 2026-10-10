import type { CardV5, DraftChapterV1, DraftStepV1 } from "@solid-memo/vocab/types.generated";
import type { CardContent, Distractor } from "../deck.ts";
import { cardContentFromRecord, cardToRecord, distractorFromRecord } from "../deckRecord.ts";
import { sameText, type LangText } from "../langText.ts";
import { LEAST_DISTRACTORS } from "./courseRules.ts";
import {
  idIn,
  iriIn,
  liveChapters,
  liveSteps,
  placeOf,
  type CardText,
  type DraftChange,
  type DraftNode,
  type QuestionPlace,
  type ReleaseDraft,
} from "./releaseDraft.ts";

/**
 * A draft as its editors show it (docs/studio.md, Writing a draft): its
 * outline, a card with its wrong options, and its cards as the table of
 * them filters them; and the changes (releaseDraft.ts) an editor's edit
 * makes. Nothing here writes: the editors hand the changes to
 * `editReleaseDraft`.
 */

/** The outline's chapters, in their order, each with its steps in use: what the outline's rows show and drag. */
export interface OutlineChapter {
  chapter: DraftNode<DraftChapterV1>;
  steps: DraftNode<DraftStepV1>[];
}

/** The chapters in use and their steps in use, in their order. */
export function draftOutline(draft: ReleaseDraft): OutlineChapter[] {
  return liveChapters(draft).map((chapter) => ({ chapter, steps: liveSteps(draft, chapter.id) }));
}

/** Subjects in the order of their ids (code units, as ids sort: course.ts). Ids are unique: two never compare equal. */
function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : 1;
}

/** The chapters retired, by id. */
export function retiredChapters(draft: ReleaseDraft): DraftNode<DraftChapterV1>[] {
  return draft.chapters.filter((node) => node.data.deprecated === true).sort(byId);
}

/** A chapter's steps retired, by id: those of a chapter retired whole stay in its outline. */
export function retiredSteps(draft: ReleaseDraft, chapter: string): DraftNode<DraftStepV1>[] {
  const iri = iriIn(draft, chapter);
  return draft.steps.filter((node) => node.data.deprecated === true && node.data.chapter === iri).sort(byId);
}

/** Where a chapter's or step's place is: a key of the outline (a chapter's or step's id) and the place it is dragged or moved to. */
export interface OutlinePlace {
  /** The chapter it goes into; null at the top, where only chapters go. */
  parent: string | null;
  /** The chapter or step it goes after; null for first. */
  after: string | null;
}

/**
 * The change a move in the outline makes: a chapter to its place among
 * the chapters, a step to its place in a chapter; null for a move the
 * outline has no place for (a chapter into a chapter, a step at the top)
 * or of what it does not show.
 */
export function outlineMove(draft: ReleaseDraft, key: string, to: OutlinePlace): DraftChange | null {
  const index = (order: readonly string[]) => (to.after === null ? 0 : order.indexOf(to.after) + 1);
  const outline = draftOutline(draft);
  if (outline.some(({ chapter }) => chapter.id === key)) {
    if (to.parent !== null) return null;
    return { kind: "moveChapter", id: key, to: index(outline.map(({ chapter }) => chapter.id).filter((id) => id !== key)) };
  }
  const into = outline.find(({ chapter }) => chapter.id === to.parent);
  if (into === undefined || !outline.some(({ steps }) => steps.some((step) => step.id === key))) return null;
  return { kind: "moveStep", id: key, chapter: into.chapter.id, to: index(into.steps.map((step) => step.id).filter((id) => id !== key)) };
}

/** A card of the draft as the card editors take it: its content, its wrong options (retired ones too), and whether it is retired. */
export interface DraftCard {
  id: string;
  content: CardContent;
  retired: boolean;
  /** When it was made, as its record says; "" when it does not. */
  created: string;
}

/** The card of the draft by id, with its wrong options; null for one it has not, or one with an empty side. */
export function draftCardOf(draft: ReleaseDraft, id: string): DraftCard | null {
  const node = draft.cards.find((one) => one.id === id);
  if (node === undefined) return null;
  const distractors = node.data.distractor.flatMap((iri) => {
    const found = draft.distractors.find((one) => iriIn(draft, one.id) === iri);
    const distractor = found === undefined ? null : distractorFromRecord(iri, found.data);
    return distractor === null ? [] : [distractor];
  });
  const content = cardContentFromRecord(node.data, distractors);
  return content === null ? null : { id, content, retired: node.data.deprecated === true, created: node.data.created ?? "" };
}

/** A card's content as a change states it: its record, without its wrong options and whether it is retired, which their own changes make. */
export function cardTextOf(content: CardContent, created: string): CardText {
  // The document is no matter here: the wrong options are left out.
  const { distractor: _distractors, deprecated: _retired, ...text } = cardToRecord(content, created, "");
  return text;
}

/**
 * The changes that make a card's wrong options `next` (DistractorFields
 * gives them so): one added, its text or note changed, retired or
 * restored, or deleted.
 */
export function distractorChanges(draft: ReleaseDraft, card: string, next: readonly Distractor[]): DraftChange[] {
  const current = draftCardOf(draft, card)?.content.distractors ?? [];
  const changes: DraftChange[] = [];
  const textOf = (distractor: Distractor) => ({ text: distractor.text, ...(distractor.note === undefined ? {} : { note: distractor.note }) });
  for (const distractor of next) {
    const was = current.find((one) => one.id === distractor.id);
    if (was === undefined) {
      changes.push({ kind: "addDistractor", card, id: distractor.id, distractor: textOf(distractor) });
    } else if (!sameText(was.text, distractor.text) || !sameText(was.note, distractor.note)) {
      changes.push({ kind: "editDistractor", id: distractor.id, distractor: textOf(distractor) });
    }
    if ((was?.retired === true) !== (distractor.retired === true)) {
      changes.push({ kind: distractor.retired === true ? "retire" : "restore", of: "distractor", id: distractor.id });
    }
  }
  for (const distractor of current) {
    if (!next.some((one) => one.id === distractor.id)) changes.push({ kind: "delete", of: "distractor", id: distractor.id });
  }
  return changes;
}

/** What the table of a draft's cards shows of each. */
export interface DraftCardRow {
  id: string;
  card: CardV5;
  /** Where it is asked; null when nowhere. */
  place: QuestionPlace | null;
  /** From how many places it is asked: more than one is a mistake a release cannot make. */
  asked: number;
  /** Its wrong options in use. */
  distractors: number;
  retired: boolean;
}

/**
 * Which of a draft's cards the table lists: those asked nowhere (in a
 * course), asked from more than one place, with fewer wrong options in
 * use than a course asks with, or retired; all when absent.
 */
export type DraftCardFilter = "unasked" | "askedTwice" | "fewDistractors" | "retired";

export const DRAFT_CARD_FILTERS: readonly DraftCardFilter[] = ["unasked", "askedTwice", "fewDistractors", "retired"];

/** Whether a text is in a language: the tag, or a regional form of it (`sv` finds `sv-fi`); `unstated` for text whose language is not stated. */
function inLanguage(text: LangText | undefined, language: string): boolean {
  return Object.keys(text ?? {}).some((tag) => (language === "unstated" ? tag === "" : tag === language || tag.startsWith(`${language}-`)));
}

/** The draft's cards, as the table lists them: by id, those `filter` keeps, with text in `language` on a side when given. */
export function draftCardRows(draft: ReleaseDraft, { filter, language }: { filter?: DraftCardFilter; language?: string } = {}): DraftCardRow[] {
  const asking = new Map<string, number>();
  const count = (iris: readonly string[]) => {
    for (const iri of iris) asking.set(iri, (asking.get(iri) ?? 0) + 1);
  };
  for (const node of draft.steps) count(node.data.checkedBy);
  for (const node of draft.chapters) count(node.data.reviewQuestion);
  const live = new Set(draft.distractors.filter((node) => node.data.deprecated !== true).map((node) => iriIn(draft, node.id)));
  const rows = draft.cards.map(
    (node): DraftCardRow => ({
      id: node.id,
      card: node.data,
      place: placeOf(draft, node.id),
      asked: asking.get(iriIn(draft, node.id)) ?? 0,
      distractors: node.data.distractor.filter((iri) => live.has(iri)).length,
      retired: node.data.deprecated === true,
    }),
  );
  const keeps: Record<DraftCardFilter, (row: DraftCardRow) => boolean> = {
    unasked: (row) => draft.course && !row.retired && row.asked === 0,
    askedTwice: (row) => row.asked > 1,
    fewDistractors: (row) => !row.retired && row.distractors < LEAST_DISTRACTORS,
    retired: (row) => row.retired,
  };
  return rows
    .filter((row) => filter === undefined || keeps[filter](row))
    .filter((row) => language === undefined || inLanguage(row.card.front, language) || inLanguage(row.card.back, language))
    .sort(byId);
}

/** The languages of the draft's cards' fronts and backs, for the table's filter: stated ones by tag, `unstated` last when a side has none. */
export function draftCardLanguages(draft: ReleaseDraft): string[] {
  const tags = new Set(draft.cards.flatMap((node) => [...Object.keys(node.data.front ?? {}), ...Object.keys(node.data.back ?? {})]));
  const stated = [...tags].filter((tag) => tag !== "").sort();
  return tags.has("") ? [...stated, "unstated"] : stated;
}

/** The chapter a step is part of, by id; null when it names none the draft has. */
export function chapterOfStep(draft: ReleaseDraft, step: string): string | null {
  const iri = draft.steps.find((node) => node.id === step)?.data.chapter;
  const chapter = iri === undefined ? null : idIn(draft, iri);
  return chapter !== null && draft.chapters.some((node) => node.id === chapter) ? chapter : null;
}
