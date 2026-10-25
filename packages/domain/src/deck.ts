// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "./appError";
import type { LangTexts } from "./keywords";
import { shown, tidied, tidiedSideText, tidiedTagged, type LangText } from "./langText";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { tidiedDistractor } from "./distractors";
import { isHttpUrl } from "./webId";

/**
 * Format version written on every deck and card this app creates. A
 * reader that meets a higher version knows the data is newer than it
 * understands; a missing version means the format that predates the
 * field, which is 1.
 *
 * Card format 2 adds pictures: a side of a card may be text, an image
 * (`sm:frontImage` / `sm:backImage`, an IRI) or both, so `sm:front` and
 * `sm:back` are no longer required. A format-1 reader would drop an
 * image-only card as malformed, which is why the version moved (see
 * docs/migrations.md).
 *
 * Deck format 2 adds a study direction (`sm:direction`): a deck may be
 * studied front→back (the only way format 1 knew), back→front, or both
 * ways, each direction with review state of its own. A format-1 reader
 * would study a bidirectional deck one way and mistake the other way's
 * review state for stray subjects, which is why the version moved.
 *
 * Deck format 3 makes a deck a DCAT dataset: the direction is a SKOS
 * concept (`sm:studyDirection`), a description is required, creators
 * are foaf:Agent nodes, and topics and keywords may be stated. A
 * format-2 reader would find no `sm:direction` and drop the deck.
 *
 * Card format 3 adds a note under each side (`sm:frontNote`,
 * `sm:backNote`) and a label above the back (`sm:backLabel`), and lets a
 * card be retired (`owl:deprecated true`): a library deck keeps a card it
 * no longer uses rather than removing it, so a copy keeps the card and
 * its review state. A format-2 reader would go on studying a retired
 * card, which is why the version moved.
 *
 * Card format 4 later gained a description of each side's picture
 * (`sm:frontImageDescription` / `sm:backImageDescription`) without a
 * version bump: an older reader ignores it and shows the picture as before.
 *
 * Deck format 5 and card format 5 let a deck's title and description, and
 * a card's notes and label, be in any language the user states: English
 * is no longer required. A format-4 reader would flag such text, and drop
 * a note with no English as it edits the card (see docs/migrations.md).
 *
 * Deck format 6 states a deck's keywords per language, several per
 * language (`"capitals"@en`, `"huvudstäder"@sv`), so the app can show a
 * reader the keywords in their language; untagged keywords from older
 * formats are kept as they are, their language unknown. A format-5
 * reader reads only untagged keywords and would drop the tagged ones as
 * it saves the deck.
 *
 * Card format 6 adds a label above the front (`sm:frontLabel`), as format
 * 3 added one above the back, so a card studied both ways says what is
 * asked. Format 5 was published without it, and a published shape is
 * never edited; a format-5 card has none, so nothing else changes.
 *
 * Card format 7 keeps what a card is about (`dcterms:subject`, the IRIs
 * of the things its source names), so a copy of a library release keeps
 * them as the release states them. Format 6 was published without the
 * term, so an app that wrote format 6 dropped it as it copied a card (an
 * import, or a move or copy into another deck), though it kept it on a
 * card it rewrote in place; a format-6 card has none, so nothing else
 * changes.
 */
export const DECK_FORMAT_VERSION: number = LATEST_VERSION.deck;
export const CARD_FORMAT_VERSION: number = LATEST_VERSION.card;

/** Which side of a card a session asks: the other side is the answer. */
export type StudyDirection = "front-to-back" | "back-to-front";

/**
 * How a deck is studied. "bidirectional" makes two prompts of every card,
 * one per direction, scheduled separately: knowing a word one way says
 * nothing about knowing it the other way.
 */
export type DeckDirection = StudyDirection | "bidirectional";

export const DECK_DIRECTIONS: readonly DeckDirection[] = [
  "front-to-back",
  "back-to-front",
  "bidirectional",
];

/** A deck that states no direction is studied front→back, as format 1 did. */
export const DEFAULT_DECK_DIRECTION: DeckDirection = "front-to-back";

export function isDeckDirection(value: string): value is DeckDirection {
  return (DECK_DIRECTIONS as readonly string[]).includes(value);
}

/** The directions a deck is studied in, front→back first. */
export function studyDirections(direction: DeckDirection): StudyDirection[] {
  return direction === "bidirectional" ? ["front-to-back", "back-to-front"] : [direction];
}

/** One thing a session asks: a card, seen from one side. */
export interface Prompt {
  card: Card;
  direction: StudyDirection;
}

/** Every prompt a deck makes of its cards, card by card. */
export function promptsOf(cards: Card[], direction: DeckDirection): Prompt[] {
  const directions = studyDirections(direction);
  return cards.flatMap((card) => directions.map((direction) => ({ card, direction })));
}

/** One side of a card as shown: its text and picture, and which side it is. */
export interface CardSide {
  side: "front" | "back";
  /** The side's text in every language it is in; no language when the side is a picture only. */
  text: LangText;
  imageUrl?: string;
  /** What the picture shows, in words: its text alternative, when stated. */
  imageDescription?: LangText;
  /**
   * The side's label, above its text whichever way the card is studied:
   * what kind of thing the side is ("Country"); on the back, how the
   * answer relates to the front ("Capital").
   */
  label?: LangText;
  /** The side's note, under its text: shown once the answer is revealed, never while asking. */
  note?: LangText;
  /** How the side's text, label and note are written: the card's `textFormat`. */
  textFormat?: string;
}

/**
 * What a prompt asks and what it answers with. Any card content will do,
 * so a library deck's cards can be shown the same way before import.
 */
export function promptSides(prompt: { card: CardContent; direction: StudyDirection }): {
  question: CardSide;
  answer: CardSide;
} {
  const { card } = prompt;
  const format = card.textFormat === undefined ? {} : { textFormat: card.textFormat };
  const front: CardSide = {
    side: "front",
    text: card.front,
    ...(card.frontImageUrl === undefined ? {} : { imageUrl: card.frontImageUrl }),
    ...(card.frontImageDescription === undefined
      ? {}
      : { imageDescription: card.frontImageDescription }),
    ...(card.frontLabel === undefined ? {} : { label: card.frontLabel }),
    ...(card.frontNote === undefined ? {} : { note: card.frontNote }),
    ...format,
  };
  const back: CardSide = {
    side: "back",
    text: card.back,
    ...(card.backImageUrl === undefined ? {} : { imageUrl: card.backImageUrl }),
    ...(card.backImageDescription === undefined
      ? {}
      : { imageDescription: card.backImageDescription }),
    ...(card.backLabel === undefined ? {} : { label: card.backLabel }),
    ...(card.backNote === undefined ? {} : { note: card.backNote }),
    ...format,
  };
  return prompt.direction === "front-to-back"
    ? { question: front, answer: back }
    : { question: back, answer: front };
}

export interface Deck {
  /** Fragment id inside the catalog document (e.g. "deck-<uuid>"). */
  id: string;
  /** Full subject URL: <catalog.ttl>#<id>. The deck's identity. */
  url: string;
  /**
   * The deck's title, in every language it states it in (one of them
   * English): the app shows the reader's language and edits the English.
   */
  title: LangText;
  cardsDocumentUrl: string;
  reviewsDocumentUrl: string;
  /** ISO dateTime. */
  createdAt: string;
  /** ISO dateTime of the last change to the deck's content, when stated. */
  modifiedAt?: string;
  formatVersion: number;
  /** How the deck is studied; a deck that states none is front→back. */
  direction: DeckDirection;
  /** Who made the deck (names), when stated. Empty for most own decks. */
  authors: string[];
  /** URL of the license the deck's content is offered under, when stated. */
  license?: string;
  /**
   * A sentence or two about the deck, when stated: what it covers and,
   * for content taken from elsewhere, where it came from. In every
   * language the deck states it in, as the title.
   */
  description?: LangText;
  /** URL of the library release this one was imported from, if it was. */
  sourceUrl?: string;
  /**
   * What the deck is about: dcat:theme concepts, Solid Memo's topics
   * and the EU data themes. Absent when none is stated.
   */
  themes?: string[];
  /**
   * Free-text keywords (dcat:keyword), per language (see keywords.ts).
   * Absent when none is stated.
   */
  keywords?: LangTexts;
  /**
   * The deck's own cap on new prompts per study day, in place of the
   * instance's preference; absent means the preference (see deckPace.ts).
   */
  newCardsPerDay?: number;
  /** The deck's own cap on reviews per study day, likewise. */
  maxReviewsPerDay?: number;
  /**
   * For a course's deck, the chapters of its release (their subjects'
   * URLs) the learner has completed: `sm:completedChapter` on the catalog
   * entry. Like a deck's `sm:position`, a triple outside the deck's shape
   * that every write of the entry keeps; only completing a chapter
   * (DeckRepository.completeChapter) adds one, and adding a guest's deck
   * to an instance (DeckRepository.addDeck, docs/guest-mode.md "Adding
   * to an instance") writes the guest's with its new entry. Absent when
   * there is none.
   */
  completedChapters?: string[];
  /**
   * Set when the deck is a course's (docs/courses.md): its catalog entry
   * is also typed `schema:Course`, as its release is, written when the
   * course is started. Like `sm:completedChapter`, every write of the
   * entry keeps it, adding a guest's deck to an instance and a deck file
   * carry it, and it goes along even when a deck file leaves the
   * progress out. A copy made before the type was written lacks it: the
   * library's index, or the copy's release, tells it then (useCopies).
   */
  course?: true;
  /**
   * The language the learner wants this deck's card text shown in first
   * (fronts, backs, notes, labels, picture descriptions, wrong
   * options), as a lower-case language tag: `sm:deckCardLanguage` on the catalog entry, a triple
   * outside the deck's shape like `sm:completedChapter`. On a course it
   * ranks all of the course's text too: its title and description, its
   * chapters' titles and descriptions and its steps' theory. A text not
   * in it falls back to the usual order; the deck's keywords, and a
   * plain deck's title and description, are not affected (see
   * deckCardLanguage.ts). Absent means the usual order: the app's
   * language, then the browser's.
   */
  cardLanguage?: string;
}

/** What is on a card: its editable content, without identity. */
export interface CardContent {
  /**
   * Text on the front, in every language it is in (card format 4), or
   * untagged under the empty tag ("") when its language is not known, as
   * for text an app typed before it asked the user for the language (the
   * app keeps such text only untouched); no language when the front is a
   * picture only.
   */
  front: LangText;
  /** Text on the back, likewise. */
  back: LangText;
  /** URL of a picture shown on the front, above any text. */
  frontImageUrl?: string;
  /**
   * What the front's picture shows, in words: its text alternative for
   * whoever cannot see it. In every language it is stated in, none
   * required. While the front is asked it should not give the answer away.
   */
  frontImageDescription?: LangText;
  /**
   * A short label above the front's text that says what kind of thing it
   * is ("Country"), shown with the front, smaller, whichever way the card
   * is studied: the front's text stays the prompt itself. In every
   * language it is stated in. Card format 6.
   */
  frontLabel?: LangText;
  /**
   * A short note under the front's text ("Out of use"), shown once the
   * answer is revealed, so it never gives it away. In every language it
   * is stated in, English or not (card format 5). Card format 3.
   */
  frontNote?: LangText;
  /** URL of a picture shown on the back, above any text. */
  backImageUrl?: string;
  /** What the back's picture shows, in words, likewise. */
  backImageDescription?: LangText;
  /**
   * A short label above the back's text that says how the answer relates
   * to the front ("Replaced by", "Capital"), shown with the back,
   * smaller: the back's text stays the answer itself. In every language
   * it is stated in, English or not (card format 5). Card format 3.
   */
  backLabel?: LangText;
  /**
   * A short note under the back's text ("In version 30, 2026-05-08"),
   * shown once the answer is revealed: the back's text stays the answer
   * itself. In every language it is stated in, English or not (card
   * format 5). Card format 3.
   */
  backNote?: LangText;
  /**
   * The wrong options shown next to the back when the card is asked as a
   * multiple-choice question, as a course does (vocabulary 1.14, card
   * format 5 without a bump): the back's text is the right one. Absent
   * when the card has none.
   */
  distractors?: readonly Distractor[];
  /**
   * How the card's texts are written (`sm:textFormat`, vocabulary 1.15,
   * card format 5 without a bump): the IRI of a concept of the
   * TextFormats scheme, `sm:markdown` or `sm:plainText`, or one this app
   * does not know, which reads as plain text. It covers the sides, the
   * notes and the labels, and the card's distractors, never the pictures'
   * descriptions. Absent means plain text, shown as written.
   */
  textFormat?: string;
  /**
   * What the card is about (`dcterms:subject`, card format 7): the IRIs
   * of the things its library release names, such as a Wikidata item,
   * sorted. Kept from the release, never shown or edited; absent when
   * the card names none.
   */
  subjects?: readonly string[];
}

/**
 * A wrong option of a card asked as a multiple-choice question: a
 * subject of the document that holds the card (`#<id>`), copied with it.
 */
export interface Distractor {
  /** Fragment id, kept from the library release the card came from. */
  id: string;
  /** Its text: untagged under the empty tag, or per language, as the back's is. */
  text: LangText;
  /** Why it is wrong, shown to whoever chose it: per language. */
  note?: LangText;
  /**
   * Set when it is retired (`owl:deprecated true`): kept, with its id,
   * which a learner's answers may name, but never offered (choicesOf).
   */
  retired?: true;
}

export interface Card extends CardContent {
  /** Fragment id shared between the cards and reviews documents. */
  id: string;
  /** Full subject URL: <cardsDocument>#<id>. */
  url: string;
  /** ISO dateTime. */
  createdAt: string;
  formatVersion: number;
  /**
   * Set when the card is retired (card format 3, owl:deprecated): the
   * library deck it came from no longer uses it. It is kept, with its
   * review state, but not studied, and the Browser hides it unless asked.
   */
  retired?: true;
}

/** The cards in use: all but the retired ones, which are kept but never studied. */
export function activeCards<T extends { retired?: true }>(cards: readonly T[]): T[] {
  return cards.filter((card) => card.retired !== true);
}

/** A text of a card: a side's, a note, a label or a picture's description. */
export type CardTextPart =
  | "front"
  | "back"
  | "frontImageDescription"
  | "frontLabel"
  | "frontNote"
  | "backImageDescription"
  | "backLabel"
  | "backNote";

/** How an English error text names each text of a card ("Choose the language of {field}."). */
const PART_NOUNS: Record<CardTextPart, string> = {
  front: "the front",
  back: "the back",
  frontImageDescription: "the front picture's description",
  frontLabel: "the label above the front",
  frontNote: "the note under the front",
  backImageDescription: "the back picture's description",
  backLabel: "the label above the back",
  backNote: "the note under the back",
};

/**
 * Outcome of validating card content as entered; an error about one of
 * the card's texts names it (`part`), for the form to point at it.
 */
export type CardContentValidation =
  | { ok: true; content: CardContent }
  | { ok: false; error: AppError; part?: CardTextPart };

/**
 * A text format as it compares: absent and `sm:plainText` are the same,
 * plain text shown as written.
 */
export function textFormatOf(content: Pick<CardContent, "textFormat">): string {
  return content.textFormat ?? SM.plainText;
}

/**
 * Whether text in this format is read as Markdown (`sm:markdown`): any
 * other format, one this app does not know too, and none are shown as
 * plain text.
 */
export function isMarkdown(textFormat: string | undefined): boolean {
  return textFormat === SM.markdown;
}

/**
 * Whether text in this format keeps what plain text loses when tidied:
 * the spaces its first line starts with (a Markdown code block). Any
 * format but plain text, one this app does not know too, for it may give
 * them meaning.
 */
export function isFormatted(textFormat: string | undefined): boolean {
  return textFormat !== undefined && textFormat !== SM.plainText;
}

/**
 * Validate and normalize card content as entered: text is trimmed, an
 * empty image field is none, an empty note or label is none, as is a
 * picture description with no text or no picture to describe, and each
 * side needs text or a picture.
 * A picture must be an http(s) URL — it is shown to whoever studies the
 * card, so nothing else may end up in an `<img>`.
 *
 * Text states its language (card format 5): the app never writes
 * untagged text. A side saved before it did may keep its untagged text
 * ("") while it is as `saved` (the card edited, if any) has it; edited,
 * or given a translation (untagged and tagged text never mix), it needs
 * its language (textNeedsLanguage, textMixesUnstated). A note, a label
 * and a picture's description are always in a stated language, English
 * or not. The card's distractors, when the input states them, are tidied
 * as their own editor does (tidiedDistractor), their ids and retirement
 * kept; none stated keeps the card's (DeckRepository.updateCard). What
 * the card is about is kept as the input states it, or as `saved` has it.
 */
export function validateCardContent(
  input: CardContent,
  saved?: CardContent,
): CardContentValidation {
  const formatted = isFormatted(input.textFormat ?? saved?.textFormat);
  const subjects = input.subjects ?? saved?.subjects;
  const front = tidiedSideText(input.front, formatted);
  const back = tidiedSideText(input.back, formatted);
  const frontImageUrl = normalizeImageUrl(input.frontImageUrl);
  const backImageUrl = normalizeImageUrl(input.backImageUrl);
  const own = {
    frontImageDescription:
      frontImageUrl === undefined ? undefined : tidiedTagged(input.frontImageDescription),
    frontLabel: tidiedTagged(input.frontLabel, formatted),
    frontNote: tidiedTagged(input.frontNote, formatted),
    backLabel: tidiedTagged(input.backLabel, formatted),
    backImageDescription:
      backImageUrl === undefined ? undefined : tidiedTagged(input.backImageDescription),
    backNote: tidiedTagged(input.backNote, formatted),
  };
  if (frontImageUrl !== undefined && !isHttpUrl(frontImageUrl)) {
    return { ok: false, error: new AppError("cardFrontImageNotWebUrl") };
  }
  if (backImageUrl !== undefined && !isHttpUrl(backImageUrl)) {
    return { ok: false, error: new AppError("cardBackImageNotWebUrl") };
  }
  const unstated =
    unstatedSide("front", front, saved, formatted) ?? unstatedSide("back", back, saved, formatted);
  if (unstated !== undefined) return unstated;
  for (const part of [
    "frontImageDescription",
    "frontLabel",
    "frontNote",
    "backLabel",
    "backImageDescription",
    "backNote",
  ] as const) {
    if (own[part] !== undefined && "" in own[part]) return needsLanguage(part);
  }
  if (isEmptyText(front) && frontImageUrl === undefined) {
    return { ok: false, error: new AppError("cardFrontEmpty") };
  }
  if (isEmptyText(back) && backImageUrl === undefined) {
    return { ok: false, error: new AppError("cardBackEmpty") };
  }
  const distractors = tidiedDistractors(input.distractors ?? [], formatted);
  if (!Array.isArray(distractors)) return distractors;
  return {
    ok: true,
    content: {
      front,
      back,
      ...(frontImageUrl === undefined ? {} : { frontImageUrl }),
      ...(backImageUrl === undefined ? {} : { backImageUrl }),
      ...(own.frontImageDescription === undefined
        ? {}
        : { frontImageDescription: own.frontImageDescription }),
      ...(own.backImageDescription === undefined
        ? {}
        : { backImageDescription: own.backImageDescription }),
      ...(own.frontLabel === undefined ? {} : { frontLabel: own.frontLabel }),
      ...(own.frontNote === undefined ? {} : { frontNote: own.frontNote }),
      ...(own.backLabel === undefined ? {} : { backLabel: own.backLabel }),
      ...(own.backNote === undefined ? {} : { backNote: own.backNote }),
      ...(input.distractors === undefined ? {} : { distractors }),
      ...(input.textFormat === undefined ? {} : { textFormat: input.textFormat }),
      ...(subjects === undefined ? {} : { subjects }),
    },
  };
}

/** A card's distractors tidied as their own editor does, ids and retirement kept; the first one's error, if any. */
function tidiedDistractors(
  input: readonly Distractor[],
  formatted: boolean,
): Distractor[] | CardContentValidation {
  const distractors: Distractor[] = [];
  for (const distractor of input) {
    const tidy = tidiedDistractor(distractor, formatted);
    if (!tidy.ok) return { ok: false, error: tidy.error };
    distractors.push({
      id: distractor.id,
      text: tidy.text,
      ...(tidy.note === undefined ? {} : { note: tidy.note }),
      ...(distractor.retired ? { retired: true } : {}),
    });
  }
  return distractors;
}

function needsLanguage(part: CardTextPart): CardContentValidation {
  return { ok: false, error: new AppError("textNeedsLanguage", { field: PART_NOUNS[part] }), part };
}

/**
 * Why a side's untagged text ("") may not be saved: it has translations
 * too, or it is not the untagged text the card has saved; undefined when
 * it may (it is untouched) or the side has none.
 */
function unstatedSide(
  part: "front" | "back",
  text: LangText,
  saved: CardContent | undefined,
  formatted: boolean,
): CardContentValidation | undefined {
  if (!("" in text)) return undefined;
  if (Object.keys(text).length > 1)
    return { ok: false, error: new AppError("textMixesUnstated"), part };
  const was = saved?.[part][""];
  return was !== undefined && tidied(was, formatted) === text[""] ? undefined : needsLanguage(part);
}

function normalizeImageUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? undefined : trimmed;
}

/** Whether a side has no text: it is a picture only. */
export function isEmptyText(text: LangText): boolean {
  return Object.keys(text).length === 0;
}

/**
 * A short name for a card where one is needed (breadcrumbs, confirmation
 * prompts): its front text, else its back text — a picture-only front is
 * best named by its answer — else its id; each as `show` shows text
 * (the reader's language, else English).
 */
export function cardLabel(
  card: CardContent & { id: string },
  show: (text: LangText) => string = shown,
): string {
  const text = cardLabelText(card);
  return isEmptyText(text) ? card.id : show(text);
}

/**
 * The text `cardLabel` names a card by: its front, else its back; no text
 * when it has neither (it is named by its id, in no language).
 */
export function cardLabelText(card: CardContent): LangText {
  return isEmptyText(card.front) ? card.back : card.front;
}
