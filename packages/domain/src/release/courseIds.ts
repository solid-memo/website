import { shown, type LangText } from "../langText.ts";
import { slugOf } from "./draftLayout.ts";
import { DRAFT_ID, idIn, idsInUse, type QuestionPlace, type ReleaseDraft } from "./releaseDraft.ts";

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

/** Every id the draft has, or a release before it published: none of them is a new subject's. */
export function takenIds(draft: ReleaseDraft): Set<string> {
  return new Set([...idsInUse(draft), ...Object.keys(draft.published.ids), ...draft.published.activities]);
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
export function idBetween(before: string, after: string | null, taken: ReadonlySet<string>): string | null;
export function idBetween(before: string, after: string | null, taken: ReadonlySet<string>): string | null {
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
    if (lower !== undefined) return taken.has(head + lower) ? idBetween(head + lower, null, taken) : head + lower;
  }
  return null;
}

/** `prefix` then 1, 2, …: the first that is none of `taken`, after the highest `prefix<n>` taken. */
function numbered(prefix: string, taken: ReadonlySet<string>, width = 1): string {
  let highest = 0;
  for (const id of taken) {
    const n = id.startsWith(prefix) ? id.slice(prefix.length) : "";
    if (/^[0-9]+$/.test(n)) highest = Math.max(highest, Number(n));
  }
  return `${prefix}${String(highest + 1).padStart(width, "0")}`;
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
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** A new step's id in a chapter: `<chapter>-<n>`, after the highest such id taken. */
export function stepIdFor(draft: ReleaseDraft, chapter: string): string {
  return numbered(`${chapter}-`, takenIds(draft));
}

/** The cards a step asks, by id, in the order it asks them: their ids' (course.ts). */
export function questionsOfStep(draft: ReleaseDraft, step: string): string[] {
  const node = draft.steps.find((one) => one.id === step);
  return (node?.data.checkedBy ?? []).map((iri) => idIn(draft, iri)).filter((id) => id !== null).sort();
}

/** The cards a chapter asks only in its final review, by id. */
export function reviewQuestionsOf(draft: ReleaseDraft, chapter: string): string[] {
  const node = draft.chapters.find((one) => one.id === chapter);
  return (node?.data.reviewQuestion ?? []).map((iri) => idIn(draft, iri)).filter((id) => id !== null).sort();
}

/** The name a step's questions share: `q-<topic>-<n>` for step `ch-<topic>-<n>` of chapter `ch-<topic>`, else `q-<step>`. */
function questionBase(draft: ReleaseDraft, step: string): string {
  const chapterIri = draft.steps.find((one) => one.id === step)?.data.chapter;
  const chapter = chapterIri === undefined ? null : idIn(draft, chapterIri);
  const n = chapter !== null && step.startsWith(`${chapter}-`) ? step.slice(chapter.length + 1) : "";
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
  const lettered = [..."abcdefghijklmnopqrstuvwxyz"].map((letter) => `${base}${letter}`).find((id) => !taken.has(id) && (last === null || id > last));
  return lettered ?? idBetween(last ?? base, null, taken);
}

/** The cards asked at `place`, by id, in the order they are asked: their ids'. */
export function questionsAt(draft: ReleaseDraft, place: QuestionPlace): string[] {
  return place.kind === "step" ? questionsOfStep(draft, place.step) : reviewQuestionsOf(draft, place.chapter);
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
export function questionIdBefore(draft: ReleaseDraft, place: QuestionPlace, next: string): string | null {
  const taken = takenIds(draft);
  const asked = questionsAt(draft, place);
  const previous = asked[asked.indexOf(next) - 1] ?? null;
  const base = place.kind === "step" ? questionBase(draft, place.step) : `q-${topicOf(place.chapter)}-r00`;
  const lower = previous ?? (base < next ? base : null);
  if (lower === null) return null;
  const lettered =
    place.kind === "step" ? [..."abcdefghijklmnopqrstuvwxyz"].map((letter) => `${base}${letter}`).find((id) => !taken.has(id) && id > lower && id < next) : undefined;
  return lettered ?? idBetween(lower, next, taken);
}

/** Whether a subject of the draft was published by a release before it: it is then retired, never deleted. */
export function isPublished(draft: ReleaseDraft, id: string): boolean {
  return id in draft.published.ids;
}

