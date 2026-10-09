import { SM } from "@solid-memo/vocab/vocab.generated";
import { AppError } from "./appError";
import { inLanguage, type CardField } from "./cardQuery";
import { CARD_FORMAT_VERSION, isMarkdown, validateCardContent, type Card, type CardContent, type Distractor } from "./deck";
import { withStatedLanguages } from "./deckLanguages";
import { canonicalTag } from "./languageTag";
import type { LangText } from "./langText";
import { sameContent } from "./libraryUpgrade";
import { reviewKeyOf, type ReviewKey, type ReviewState } from "./review";

/**
 * The Studio's bulk edits of a deck's cards (docs/studio.md): one edit,
 * made to the cards the user selected, planned here and written by the
 * application in one write of the cards document.
 */

/** The texts a find and replace reads: those of the workbench's search, all of them but the pictures' descriptions. */
export type ReplaceField = Exclude<CardField, "any">;

export const REPLACE_FIELDS: readonly ReplaceField[] = ["front", "back", "note", "label", "distractor"];

/** Which side's untagged text a stated language is for: absent, both. */
export type StatedSide = "front" | "back";

/**
 * One edit of the selected cards: retire them (kept, with their review
 * state, but not studied), restore them, remove them (with their review
 * state), replace text in them, write them in Markdown or as plain
 * text, or state the language of their untagged sides.
 */
export type CardEdit =
  | { kind: "retire" }
  | { kind: "restore" }
  | { kind: "remove" }
  | {
      kind: "replaceText";
      /** Text as written (Markdown as its source), never a pattern. */
      find: string;
      replace: string;
      fields: readonly ReplaceField[];
      /** Only text in this language (a regional form too), or UNSTATED for untagged text; absent, every language. */
      language?: string;
      caseSensitive: boolean;
      /** Only where `find` is not part of a longer word: no letter, digit or "_" right before or after it. */
      wholeWord: boolean;
    }
  | { kind: "setTextFormat"; markdown: boolean }
  | { kind: "stateLanguage"; tag: string; side?: StatedSide };

/**
 * Why a selected card is left as it is:
 * - `missing`: the deck no longer has it;
 * - `unchanged`: the edit changes nothing on it (no match, retired already…);
 * - `wouldEmpty`: a replace would leave a side's text, or a wrong option's, empty;
 * - `unstatedLanguage`: it would change text whose language is not stated, which may not be saved so;
 * - `invalid`: the card would not pass validateCardContent otherwise.
 */
export type SkipReason = "missing" | "unchanged" | "wouldEmpty" | "unstatedLanguage" | "invalid";

/**
 * What to write: cards saved (by id, new or existing, retired or not)
 * and removed in one write of the cards document; review states saved
 * and removed in one write of the reviews document.
 */
export interface CardChanges {
  save: Card[];
  remove: string[];
  reviewRemovals: ReviewKey[];
  reviewSaves: ReviewState[];
}

/** An edit planned: what to write, the cards left as they are, and the changes that undo it. */
export interface CardEditPlan extends CardChanges {
  skipped: { id: string; reason: SkipReason }[];
  /** Writes the cards back as they were, and the review states removed with them. */
  inverse: CardChanges;
}

/**
 * What the edit does to the cards of `ids` (each once, in that order),
 * among the deck's `cards`. Every card saved passes validateCardContent
 * (its untagged text untouched as `card` has it), with the review state
 * left alone; a removed card's states go with it, in each direction, and
 * `reviews` (the deck's states) are what the inverse writes back.
 * Throws textLanguageInvalid when a stated language is no language code.
 */
export function planCardEdit(
  cards: readonly Card[],
  ids: readonly string[],
  edit: CardEdit,
  reviews: readonly ReviewState[] = [],
): CardEditPlan {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const change = edit.kind === "remove" ? null : editOf(edit);
  const plan: CardEditPlan = { ...noChanges(), skipped: [], inverse: noChanges() };
  for (const id of new Set(ids)) {
    const card = byId.get(id);
    if (card === undefined) {
      plan.skipped.push({ id, reason: "missing" });
    } else if (edit.kind === "remove") {
      plan.remove.push(id);
      plan.reviewRemovals.push({ cardId: id, direction: "front-to-back" }, { cardId: id, direction: "back-to-front" });
      plan.inverse.save.push(card);
      plan.inverse.reviewSaves.push(...reviews.filter((state) => state.cardId === id));
    } else {
      const edited = change!(card);
      if (typeof edited === "string") {
        plan.skipped.push({ id, reason: edited });
      } else {
        plan.save.push(edited);
        plan.inverse.save.push(card);
      }
    }
  }
  return plan;
}

function noChanges(): CardChanges {
  return { save: [], remove: [], reviewRemovals: [], reviewSaves: [] };
}

/** How an edit changes one card: the card as it is to be saved, or why it is not. */
function editOf(edit: Exclude<CardEdit, { kind: "remove" }>): (card: Card) => Card | SkipReason {
  switch (edit.kind) {
    case "retire":
      return (card) => (card.retired === true ? "unchanged" : validated(card, card, true));
    case "restore":
      return (card) => (card.retired === true ? validated(card, card, false) : "unchanged");
    case "setTextFormat": {
      const textFormat = edit.markdown ? SM.markdown : SM.plainText;
      return (card) =>
        isMarkdown(card.textFormat) === edit.markdown ? "unchanged" : validated(card, { ...card, textFormat }, card.retired === true);
    }
    case "stateLanguage": {
      const tag = canonicalTag(edit.tag);
      if (tag === null) throw new AppError("textLanguageInvalid", { tag: edit.tag });
      const languages = edit.side === undefined ? { front: tag, back: tag } : { [edit.side]: tag };
      return (card) => {
        const stated = withStatedLanguages(card, languages);
        return stated === null ? "unchanged" : validated(card, stated, card.retired === true);
      };
    }
    case "replaceText":
      return replacing(edit);
  }
}

/**
 * The card with the content given, as it is saved, once it passes
 * validateCardContent; why not when it does not (a side the edit
 * empties is caught before: see replacing). Its distractors are kept as
 * `content` has them: the validation leaves them out.
 */
function validated(card: Card, content: CardContent, retired: boolean): Card | SkipReason {
  const valid = validateCardContent(content, card);
  if (!valid.ok) {
    switch (valid.error.code) {
      case "textNeedsLanguage":
      case "textMixesUnstated":
        return "unstatedLanguage";
      default:
        return "invalid";
    }
  }
  return {
    id: card.id,
    url: card.url,
    createdAt: card.createdAt,
    formatVersion: CARD_FORMAT_VERSION,
    ...valid.content,
    ...(content.distractors === undefined ? {} : { distractors: content.distractors }),
    ...(retired ? { retired: true } : {}),
  };
}

/** The pattern that finds `find` as written, everywhere in a text. */
function patternOf(edit: Extract<CardEdit, { kind: "replaceText" }>): RegExp {
  const literal = edit.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = edit.wholeWord ? `(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])` : literal;
  return new RegExp(source, edit.caseSensitive ? "gu" : "giu");
}

/**
 * A find and replace: in the texts of `fields`, in the language asked
 * for, every match of `find` becomes `replace`, as written. A text left
 * empty is gone, as when it is cleared in the card editor, but a side's
 * or a wrong option's may not be: the card is skipped (wouldEmpty).
 */
function replacing(edit: Extract<CardEdit, { kind: "replaceText" }>): (card: Card) => Card | SkipReason {
  if (edit.find === "") return () => "unchanged";
  const pattern = patternOf(edit);
  const fields = new Set(edit.fields);
  const inside = (text: LangText | undefined, field: ReplaceField): LangText | undefined => {
    if (text === undefined || !fields.has(field)) return text;
    return Object.fromEntries(
      Object.entries(text).map(([tag, value]) => [
        tag,
        edit.language === undefined || inLanguage(tag, edit.language) ? value.replace(pattern, () => edit.replace) : value,
      ]),
    );
  };
  return (card) => {
    const distractors = card.distractors?.map(({ note: was, ...distractor }): Distractor => {
      const note = withoutEmpty(inside(was, "distractor"));
      return { ...distractor, text: inside(distractor.text, "distractor")!, ...(note === undefined ? {} : { note }) };
    });
    const content: CardContent = {
      ...card,
      front: inside(card.front, "front")!,
      back: inside(card.back, "back")!,
      frontNote: inside(card.frontNote, "note"),
      backNote: inside(card.backNote, "note"),
      backLabel: inside(card.backLabel, "label"),
      ...(distractors === undefined ? {} : { distractors }),
    };
    if (sameContent(content, card)) return "unchanged";
    const emptied = [content.front, content.back, ...(distractors ?? []).map((distractor) => distractor.text)].some((text) =>
      Object.values(text).some((value) => value.trim() === ""),
    );
    return emptied ? "wouldEmpty" : validated(card, content, card.retired === true);
  };
}

/** Text without its languages left empty; undefined when none is left. */
function withoutEmpty(text: LangText | undefined): LangText | undefined {
  if (text === undefined) return undefined;
  const kept = Object.entries(text).filter(([, value]) => value.trim() !== "");
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
}

/**
 * Whether a plan writes what another does: the same cards saved as the
 * same content, retired or not, the same removed with the same review
 * states, and the same left as they are for the same reasons. Its
 * inverse aside: the same edit of the same cards undoes the same way.
 */
export function sameCardEditPlan(a: CardEditPlan, b: CardEditPlan): boolean {
  const same = <T>(x: readonly T[], y: readonly T[], equal: (x: T, y: T) => boolean) =>
    x.length === y.length && x.every((item, at) => equal(item, y[at]!));
  return (
    same(a.save, b.save, sameCard) &&
    same(a.remove, b.remove, (x, y) => x === y) &&
    same(a.reviewRemovals, b.reviewRemovals, (x, y) => reviewKeyOf(x) === reviewKeyOf(y)) &&
    same(a.skipped, b.skipped, (x, y) => x.id === y.id && x.reason === y.reason)
  );
}

/** The same card, with the same content, retired or not. */
function sameCard(a: Card, b: Card): boolean {
  return a.id === b.id && a.retired === b.retired && sameContent(a, b);
}

/**
 * The changes that undo a plan made: its inverse, while the deck's
 * `cards` are as the plan left them (each card it saved as it saved it,
 * each it removed still gone); null once one changed since, which an
 * undo would overwrite.
 */
export function planUndo(cards: readonly Card[], plan: CardEditPlan): CardChanges | null {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const asLeft =
    plan.save.every((saved) => {
      const card = byId.get(saved.id);
      return card !== undefined && sameCard(card, saved);
    }) && plan.remove.every((id) => !byId.has(id));
  return asLeft ? plan.inverse : null;
}

/** A text of a card a find and replace may change. */
export type ChangedPart = "front" | "back" | "frontNote" | "backNote" | "backLabel" | "distractor" | "distractorNote";

/** One text as it was and as it is to be, in one language; absent on the side it is not. */
export interface TextChange {
  part: ChangedPart;
  /** The language tag; "" for untagged text. */
  tag: string;
  before?: string;
  after?: string;
}

/** The texts that differ between a card and its edit, part by part, for a preview to show. */
export function changedTexts(before: CardContent, after: CardContent): TextChange[] {
  const changes: TextChange[] = [];
  const compare = (part: ChangedPart, was: LangText | undefined, is: LangText | undefined) => {
    for (const tag of new Set([...Object.keys(was ?? {}), ...Object.keys(is ?? {})])) {
      const [from, to] = [was?.[tag], is?.[tag]];
      if (from !== to) {
        changes.push({ part, tag, ...(from === undefined ? {} : { before: from }), ...(to === undefined ? {} : { after: to }) });
      }
    }
  };
  compare("front", before.front, after.front);
  compare("back", before.back, after.back);
  compare("frontNote", before.frontNote, after.frontNote);
  compare("backLabel", before.backLabel, after.backLabel);
  compare("backNote", before.backNote, after.backNote);
  const theirs = new Map((after.distractors ?? []).map((distractor) => [distractor.id, distractor]));
  for (const distractor of before.distractors ?? []) {
    const edited = theirs.get(distractor.id);
    compare("distractor", distractor.text, edited?.text);
    compare("distractorNote", distractor.note, edited?.note);
  }
  return changes;
}
