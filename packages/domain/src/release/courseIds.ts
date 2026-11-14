// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DraftStepV1 } from "@solid-memo/vocab/types.generated";
import { shown, type LangText } from "../langText.ts";
import { nextNumberedId } from "../nextNumberedId.ts";
import { slugOf } from "./draftLayout.ts";
import {
  DRAFT_ID,
  idIn,
  idsInUse,
  iriIn,
  type DraftNode,
  type DraftTriple,
  type PublishedIds,
  type QuestionPlace,
  type ReleaseDraft,
} from "./releaseDraft.ts";

/**
 * The id assistant (docs/studio.md, Ids): ids for a draft's
 * new chapters, steps and questions, named the way a course names them
 * (docs/courses.md, Writing a course): chapters `ch-<topic>`, steps
 * `ch-<topic>-<n>`, a step's questions `q-<topic>-<n><letter>`, review
 * questions `q-<topic>-r<nn>`. An id is never one the draft has, nor one
 * a release before it published.
 *
 * A step asks its questions in the order of their ids (course.ts), so a
 * new question's id sorts after the step's last: there is no term for
 * the order, and a published id is never renamed. Past `z`, it is the
 * last's id with a number after it (idBetween). One asked before
 * another gets an id between that one's and the one before it
 * (questionIdBefore).
 */

/**
 * Each draft's taken ids, gathered once per draft: a draft is never
 * changed in place (an edit makes a new one), and the forms that suggest
 * and check an id ask on each keystroke.
 */
const takenOf = new WeakMap<ReleaseDraft, ReadonlySet<string>>();

/** What of a draft its taken ids were last gathered from, besides its statements, and the ids. */
interface Gathered {
  readonly url: string;
  readonly root: ReleaseDraft["root"];
  readonly lists: readonly (readonly DraftNode<unknown>[])[];
  readonly published: PublishedIds;
  readonly taken: ReadonlySet<string>;
}

/**
 * The taken ids last gathered over each list of statements. An edit of a
 * chapter's, a step's or the release's text makes a new draft that keeps
 * its statements and its ids: its taken ids are the last ones, and are
 * not gathered again from every statement.
 */
const gatheredOver = new WeakMap<readonly DraftTriple[], Gathered>();

/** The draft's lists of records, whose ids idsInUse takes. */
function listsOf(draft: ReleaseDraft): readonly (readonly DraftNode<unknown>[])[] {
  return [
    draft.agents,
    draft.distributions,
    draft.chapters,
    draft.steps,
    draft.cards,
    draft.distractors,
  ];
}

/** The IRIs of the draft's subjects a value of the root names, in order. */
function namedIn(value: unknown, prefix: string): string[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (one): one is string => typeof one === "string" && one.startsWith(prefix),
  );
}

/** Whether `draft` has the ids `was` was gathered from: its records' and its root's, by what changed only. */
function sameIds(was: Gathered, draft: ReleaseDraft): boolean {
  if (was.url !== draft.url || was.published !== draft.published) return false;
  const lists = listsOf(draft);
  const sameList = (before: readonly DraftNode<unknown>[], after: readonly DraftNode<unknown>[]) =>
    before === after ||
    (before.length === after.length && before.every((node, i) => node.id === after[i]!.id));
  if (!was.lists.every((list, i) => sameList(list, lists[i]!))) return false;
  if (was.root === draft.root) return true;
  const prefix = iriIn(draft, "");
  const before = new Map<string, unknown>(Object.entries(was.root));
  const after = new Map<string, unknown>(Object.entries(draft.root));
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(key) === after.get(key)) continue;
    const then = namedIn(before.get(key), prefix);
    const now = namedIn(after.get(key), prefix);
    if (then.length !== now.length || then.some((iri, i) => iri !== now[i])) return false;
  }
  return true;
}

/** Every id the draft has, or a release before it published: none of them is a new subject's. */
export function takenIds(draft: ReleaseDraft): ReadonlySet<string> {
  const known = takenOf.get(draft);
  if (known !== undefined) return known;
  const was = gatheredOver.get(draft.triples);
  let taken: ReadonlySet<string>;
  if (was !== undefined && sameIds(was, draft)) taken = was.taken;
  else {
    const gathered = idsInUse(draft);
    for (const id of Object.keys(draft.published.ids)) gathered.add(id);
    for (const id of draft.published.activities) gathered.add(id);
    taken = gathered;
  }
  takenOf.set(draft, taken);
  gatheredOver.set(draft.triples, {
    url: draft.url,
    root: draft.root,
    lists: listsOf(draft),
    published: draft.published,
    taken,
  });
  return taken;
}

/** Why `id` cannot be a new subject's: none a subject can have, or one taken; null when it can. */
export function idProblem(draft: ReleaseDraft, id: string): "invalid" | "taken" | null {
  if (!DRAFT_ID.test(id)) return "invalid";
  return takenIds(draft).has(id) ? "taken" : null;
}

/** The characters an id is made of (DRAFT_ID), in the order ids sort. */
const ID_CHARS = [..."-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz"];

/**
 * An id none of `taken` that sorts after `before` and, when given, before
 * `after`: `before` with a number after it, 1, 2, … when one fits, else
 * one made code unit by code unit, `before` and the start of what follows
 * it in `after`, then a character that sorts lower. Null when no id lies
 * between: `after` is `before` with only dashes after it, and every one
 * shorter is taken.
 */
export function idBetween(before: string, after: null, taken: ReadonlySet<string>): string;
export function idBetween(
  before: string,
  after: string | null,
  taken: ReadonlySet<string>,
): string | null;
export function idBetween(
  before: string,
  after: string | null,
  taken: ReadonlySet<string>,
): string | null {
  for (let n = 1; ; n++) {
    const id = `${before}${n}`;
    if (after !== null && id >= after) break;
    if (!taken.has(id)) return id;
  }
  // Every id that begins with `before` sorts before an `after` that does not, so `after` begins with it.
  const rest = after!.slice(before.length);
  for (let i = 0; i < rest.length; i++) {
    const head = before + rest.slice(0, i);
    if (i > 0 && !taken.has(head)) return head;
    const lower = ID_CHARS.find((char) => char < rest[i]!);
    if (lower !== undefined)
      return taken.has(head + lower) ? idBetween(head + lower, null, taken) : head + lower;
  }
  return null;
}

/**
 * What was found in each set of taken ids, by what was looked for: a set
 * is never changed (takenIds), and finding an id may go over many of it.
 */
const foundIn = new WeakMap<ReadonlySet<string>, Map<string, string | null>>();

/** What `find` finds in `taken`, found once per set and `key`. */
function foundOnce<T extends string | null>(
  taken: ReadonlySet<string>,
  key: string,
  find: () => T,
): T {
  let found = foundIn.get(taken);
  if (found === undefined) {
    found = new Map();
    foundIn.set(taken, found);
  }
  if (found.has(key)) return found.get(key) as T;
  const id = find();
  found.set(key, id);
  return id;
}

/** `prefix` then 1, 2, …: the first that is none of `taken`, after the highest `prefix<n>` taken (nextNumberedId). */
function numbered(prefix: string, taken: ReadonlySet<string>, width = 1): string {
  return foundOnce(taken, JSON.stringify(["numbered", prefix, width]), () =>
    nextNumberedId(prefix, taken, /^[0-9]{1,15}$/, width),
  );
}

/** idBetween over a set of taken ids (takenIds), found once per set. */
function between(before: string, after: string | null, taken: ReadonlySet<string>): string | null {
  return foundOnce(taken, JSON.stringify(["between", before, after]), () =>
    idBetween(before, after, taken),
  );
}

/** `first`, else `prefix` then `n`, `n + 1`, …: the first that is none of `taken` (takenIds), found once per set. */
export function firstFree(
  taken: ReadonlySet<string>,
  first: string,
  prefix: string,
  n: number,
): string {
  return foundOnce(taken, JSON.stringify(["free", first, prefix, n]), () => {
    let id = first;
    for (let next = n; taken.has(id); next++) id = `${prefix}${next}`;
    return id;
  });
}

/** What a chapter's ids name: `ch-why-solid` → `why-solid`; another id as it is. */
function topicOf(chapter: string): string {
  return chapter.startsWith("ch-") ? chapter.slice(3) : chapter;
}

/** A new chapter's id: `ch-<its title>`, or `ch-<n>` for a title of no letters; `-2`, `-3`… when taken. */
export function chapterIdFor(draft: ReleaseDraft, title: LangText): string {
  const taken = takenIds(draft);
  const slug = slugOf(shown(title, ["en"]));
  if (slug === "") return numbered("ch-", taken);
  const base = `ch-${slug}`;
  return firstFree(taken, base, `${base}-`, 2);
}

/** A new step's id in a chapter: `<chapter>-<n>`, after the highest such id taken. */
export function stepIdFor(draft: ReleaseDraft, chapter: string): string {
  return numbered(`${chapter}-`, takenIds(draft));
}

/** The cards a step asks, by id, in the order it asks them: their ids' (course.ts). */
export function questionsOfStep(draft: ReleaseDraft, step: string): string[] {
  const node = draft.steps.find((one) => one.id === step);
  return node === undefined ? [] : stepQuestions(draft, node);
}

/** The cards a step's node asks, as questionsOfStep has them: for the outline, which has its steps' nodes. */
export function stepQuestions(draft: ReleaseDraft, step: DraftNode<DraftStepV1>): string[] {
  return step.data.checkedBy
    .map((iri) => idIn(draft, iri))
    .filter((id) => id !== null)
    .sort();
}

/** The cards a chapter asks only in its final review, by id. */
export function reviewQuestionsOf(draft: ReleaseDraft, chapter: string): string[] {
  const node = draft.chapters.find((one) => one.id === chapter);
  return (node?.data.reviewQuestion ?? [])
    .map((iri) => idIn(draft, iri))
    .filter((id) => id !== null)
    .sort();
}

/** The name a step's questions share: `q-<topic>-<n>` for step `ch-<topic>-<n>` of chapter `ch-<topic>`, else `q-<step>`. */
function questionBase(draft: ReleaseDraft, step: string): string {
  const chapterIri = draft.steps.find((one) => one.id === step)?.data.chapter;
  const chapter = chapterIri === undefined ? null : idIn(draft, chapterIri);
  const n =
    chapter !== null && step.startsWith(`${chapter}-`) ? step.slice(chapter.length + 1) : "";
  return /^[0-9]+$/.test(n) ? `q-${topicOf(chapter!)}-${n}` : `q-${step}`;
}

/**
 * A new card's id where it is to be asked: a step's next question
 * (`q-<topic>-<n><letter>`, sorting after the step's last one), a
 * chapter's next review question (`q-<topic>-r<nn>`), or, asked nowhere
 * yet, `q-<n>` in a course and `card-<n>` in a deck.
 */
export function questionIdFor(draft: ReleaseDraft, place: QuestionPlace | null): string {
  const taken = takenIds(draft);
  if (place === null) return numbered(draft.course ? "q-" : "card-", taken);
  if (place.kind === "review") return numbered(`q-${topicOf(place.chapter)}-r`, taken, 2);
  const last = questionsOfStep(draft, place.step).at(-1) ?? null;
  const base = questionBase(draft, place.step);
  const lettered = [..."abcdefghijklmnopqrstuvwxyz"]
    .map((letter) => `${base}${letter}`)
    .find((id) => !taken.has(id) && (last === null || id > last));
  return lettered ?? between(last ?? base, null, taken)!;
}

/** The cards asked at `place`, by id, in the order they are asked: their ids'. */
export function questionsAt(draft: ReleaseDraft, place: QuestionPlace): string[] {
  return place.kind === "step"
    ? questionsOfStep(draft, place.step)
    : reviewQuestionsOf(draft, place.chapter);
}

/**
 * A new card's id that is asked at `place` just before `next`, one of the
 * cards asked there: it sorts between `next` and the card asked before
 * it. In a step, a letter between them when one is free
 * (`q-<topic>-<n><letter>`), else an id between (idBetween); before the
 * first, the place's own name (`q-<topic>-<n>`, `q-<topic>-r00`) is the
 * lower end. Null when no id lies between, or the first sorts before
 * the place's name: the user writes one.
 */
export function questionIdBefore(
  draft: ReleaseDraft,
  place: QuestionPlace,
  next: string,
): string | null {
  const taken = takenIds(draft);
  const asked = questionsAt(draft, place);
  const previous = asked[asked.indexOf(next) - 1] ?? null;
  const base =
    place.kind === "step" ? questionBase(draft, place.step) : `q-${topicOf(place.chapter)}-r00`;
  const lower = previous ?? (base < next ? base : null);
  if (lower === null) return null;
  const lettered =
    place.kind === "step"
      ? [..."abcdefghijklmnopqrstuvwxyz"]
          .map((letter) => `${base}${letter}`)
          .find((id) => !taken.has(id) && id > lower && id < next)
      : undefined;
  return lettered ?? between(lower, next, taken);
}

/** Whether a subject of the draft was published by a release before it: it is then retired, never deleted. */
export function isPublished(draft: ReleaseDraft, id: string): boolean {
  return Object.hasOwn(draft.published.ids, id);
}
