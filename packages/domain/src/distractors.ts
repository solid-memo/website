import { AppError } from "./appError";
import type { CardContent, Distractor } from "./deck";
import { tidiedSideText, tidiedTagged, type LangText } from "./langText";
import { LEAST_DISTRACTORS } from "./release/courseRules";

/**
 * Edits of a card's distractors, its wrong options (docs/studio.md): add,
 * edit, retire, restore, and delete one never published. Each returns the
 * card's distractors as they are then, for the card to be saved with them
 * (DeckRepository.updateCard writes each as an `sm:Distractor` subject
 * beside the card, which names it with `sm:distractor`).
 */

/** A wrong option as the user enters it: its text and its note, untidied. */
export interface DistractorText {
  text: LangText;
  note?: LangText;
}

/** The card's distractors after an edit, or why the edit is refused. */
export type DistractorEdit = { ok: true; distractors: Distractor[] } | { ok: false; error: AppError };

/** How an English error text names a wrong option's note ("Choose the language of {field}."). */
const NOTE_NOUN = "the note on a wrong option";

/**
 * A wrong option as entered, tidied as a card's texts are (`formatted`:
 * the card's text is in a format such as Markdown, whose leading spaces
 * may mean something), or why it may not be saved: its text is empty, it
 * mixes untagged text with translations, or its note states no language.
 * Its text may be untagged, as a back saved before languages were stated
 * is; its note is always in a stated language.
 */
export function tidiedDistractor(
  entered: DistractorText,
  formatted = false,
): { ok: true; text: LangText; note?: LangText } | { ok: false; error: AppError } {
  const text = tidiedSideText(entered.text, formatted);
  const tags = Object.keys(text);
  if (tags.length === 0) return { ok: false, error: new AppError("distractorEmpty") };
  if ("" in text && tags.length > 1) return { ok: false, error: new AppError("textMixesUnstated") };
  const note = tidiedTagged(entered.note, formatted);
  if (note !== undefined && "" in note) return { ok: false, error: new AppError("textNeedsLanguage", { field: NOTE_NOUN }) };
  return { ok: true, text, ...(note === undefined ? {} : { note }) };
}

/**
 * The id for a card's next distractor: `<card>-d<n>`, n one more than the
 * highest such id `used` holds (the card's distractors, retired ones
 * included, and those its release published). So an id the release
 * published, which a learner's history may name, is never used again;
 * one deleted before it was published may be.
 */
export function nextDistractorId(cardId: string, used: Iterable<string>): string {
  const prefix = `${cardId}-d`;
  let highest = 0;
  for (const id of used) {
    if (!id.startsWith(prefix)) continue;
    const n = id.slice(prefix.length);
    if (/^[1-9][0-9]*$/.test(n)) highest = Math.max(highest, Number(n));
  }
  return `${prefix}${highest + 1}`;
}

/**
 * The card's distractors with a new one at their end, under the next id
 * (nextDistractorId over the card's and `published`); refused while it
 * has no text, so an empty option is never created.
 */
export function addDistractor(
  distractors: readonly Distractor[],
  cardId: string,
  entered: DistractorText,
  { published = [], formatted = false }: { published?: Iterable<string>; formatted?: boolean } = {},
): DistractorEdit {
  const tidy = tidiedDistractor(entered, formatted);
  if (!tidy.ok) return tidy;
  const id = nextDistractorId(cardId, [...distractors.map((distractor) => distractor.id), ...published]);
  return { ok: true, distractors: [...distractors, { id, text: tidy.text, ...(tidy.note === undefined ? {} : { note: tidy.note }) }] };
}

/** The card's distractors with one's text and note replaced, its id and retirement kept; refused as addDistractor's. */
export function editDistractor(
  distractors: readonly Distractor[],
  id: string,
  entered: DistractorText,
  formatted = false,
): DistractorEdit {
  const tidy = tidiedDistractor(entered, formatted);
  if (!tidy.ok) return tidy;
  return {
    ok: true,
    distractors: distractors.map((distractor) =>
      distractor.id === id
        ? { id, text: tidy.text, ...(tidy.note === undefined ? {} : { note: tidy.note }), ...(distractor.retired ? { retired: true } : {}) }
        : distractor,
    ),
  };
}

/** The card's distractors with one retired (`owl:deprecated true`): kept, never offered. */
export function retireDistractor(distractors: readonly Distractor[], id: string): Distractor[] {
  return distractors.map((distractor) => (distractor.id === id ? { ...distractor, retired: true } : distractor));
}

/** The card's distractors with a retired one offered again. */
export function restoreDistractor(distractors: readonly Distractor[], id: string): Distractor[] {
  return distractors.map((distractor) => (distractor.id === id ? withoutRetirement(distractor) : distractor));
}

function withoutRetirement({ id, text, note }: Distractor): Distractor {
  return { id, text, ...(note === undefined ? {} : { note }) };
}

/**
 * The card's distractors without one; refused (distractorPublished) for
 * one the deck's release published, which a learner's history may name:
 * it is retired instead.
 */
export function deleteDistractor(distractors: readonly Distractor[], id: string, published: ReadonlySet<string>): DistractorEdit {
  if (published.has(id)) return { ok: false, error: new AppError("distractorPublished") };
  return { ok: true, distractors: distractors.filter((distractor) => distractor.id !== id) };
}

/**
 * Something to look at in a card's distractors:
 * - `distractorLanguages`: a distractor in use whose text is not in
 *   exactly the back's languages (`missing` those it lacks, `extra` those
 *   the back lacks), so a reader may see the options in two languages;
 * - `fewDistractors`: the card has distractors in use, but fewer than a
 *   course asks a question with.
 */
export type DistractorIssue =
  | { code: "distractorLanguages"; severity: DistractorSeverity; id: string; missing: string[]; extra: string[] }
  | { code: "fewDistractors"; severity: DistractorSeverity; count: number; least: number };

export type DistractorSeverity = "warning" | "error";

/**
 * What a card's distractors call for: warnings in a deck of a pod, which
 * may be as its user wants it; errors in a release (`where`), which a
 * course asks.
 */
export function distractorIssues(card: Pick<CardContent, "back" | "distractors">, where: "pod" | "release"): DistractorIssue[] {
  const severity: DistractorSeverity = where === "pod" ? "warning" : "error";
  const inUse = (card.distractors ?? []).filter((distractor) => distractor.retired !== true);
  const back = Object.keys(card.back);
  const issues: DistractorIssue[] = [];
  if (inUse.length > 0 && inUse.length < LEAST_DISTRACTORS) {
    issues.push({ code: "fewDistractors", severity, count: inUse.length, least: LEAST_DISTRACTORS });
  }
  for (const distractor of inUse) {
    const text = Object.keys(distractor.text);
    const missing = back.filter((tag) => !text.includes(tag));
    const extra = text.filter((tag) => !back.includes(tag));
    if (missing.length + extra.length > 0) issues.push({ code: "distractorLanguages", severity, id: distractor.id, missing, extra });
  }
  return issues;
}
