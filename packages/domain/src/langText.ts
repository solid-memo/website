// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { LangText } from "@solid-memo/vocab/types.generated";

export type { LangText };

/**
 * Text in several languages: a language tag (lower case) to the text in
 * that language, as deck format 5 states titles and descriptions and card
 * format 5 notes and labels; a card side may instead hold one untagged
 * text (""), saved before the user stated its language. The app shows the
 * text in the reader's language when there is one, and edits each
 * language's text under the tag the user states, keeping the others as
 * they are.
 */

/** The tag of the English text: "en", or a regional English ("en-gb"). */
function englishTag(text: LangText): string | undefined {
  return matchingTag(text, "en");
}

/**
 * The tag in the text for a wanted language: the tag itself, else the
 * same language without a region ("sv-SE" finds "sv"), else a regional
 * one ("en" finds "en-gb").
 */
function matchingTag(text: LangText, wanted: string): string | undefined {
  const tag = wanted.toLowerCase();
  if (tag in text) return tag;
  const language = tag.split("-")[0];
  if (language in text) return language;
  return Object.keys(text)
    .sort()
    .find((t) => t.startsWith(`${language}-`));
}

/** The English text; undefined when there is none. */
export function english(text: LangText): string | undefined {
  const tag = englishTag(text);
  return tag === undefined ? undefined : text[tag];
}

/**
 * The tag of the text to show a reader who prefers `languages` (most
 * preferred first, as navigator.languages lists them): the first of those
 * the text is in, else the English, else the first language's (by tag);
 * undefined when the text is in no language. The page marks text in
 * another language than its own by this tag.
 */
export function shownTag(text: LangText, languages: readonly string[] = []): string | undefined {
  for (const language of languages) {
    const tag = matchingTag(text, language);
    if (tag !== undefined) return tag;
  }
  return englishTag(text) ?? Object.keys(text).sort()[0];
}

/** The text to show a reader who prefers `languages`: the one `shownTag` picks; empty when there is none. */
export function shown(text: LangText, languages: readonly string[] = []): string {
  const tag = shownTag(text, languages);
  return tag === undefined ? "" : text[tag];
}

/**
 * Text as entered, its languages as the form states them: every
 * language's text trimmed and an empty one left out, for clearing a
 * language's text removes that language. A card side may keep untagged
 * text (""), but only as it was saved (see validateCardContent). Text
 * written in a format (`formatted`, Markdown) keeps the spaces its first
 * line starts with, which may make it a code block, and loses only the
 * blank lines before it and the white space after it.
 */
export function tidiedSideText(text: LangText, formatted = false): LangText {
  return Object.fromEntries(
    Object.entries(text)
      .map(([tag, value]) => [tag, tidied(value, formatted)])
      .filter(([, value]) => value !== ""),
  );
}

/** One text trimmed, or for text in a format only its blank lines before and white space after (see tidiedSideText). */
export function tidied(value: string, formatted = false): string {
  return formatted ? value.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd() : value.trim();
}

/** Arabic's optional marks: the short vowels, tanwin, shadda, sukun and their kin, the dagger alef, and the tatweel. */
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g;

/** Arabic letters written for one another: an alef with a hamza or madda, or a wasla, and the Persian yeh. */
const ARABIC_LETTERS: Readonly<Record<string, string>> = {
  "\u0622": "\u0627",
  "\u0623": "\u0627",
  "\u0625": "\u0627",
  "\u0671": "\u0627",
  "\u0649": "\u064A",
  "\u06CC": "\u064A",
  "\u0629": "\u0647",
};

/**
 * Arabic as a search compares it: without its optional marks — the
 * vowels and the other marks above and below the letters (harakat), which
 * most writing leaves out, and the tatweel that only stretches a line —
 * and with the letters often written for one another taken as one: every
 * alef as the bare alef (أ إ آ ٱ as ا), alef maqsura and the Persian yeh
 * as yeh (ى ی as ي), ta marbuta as heh (ة as ه). Text in other scripts is
 * left as it is. Composed text in, composed text out.
 */
export function arabicFolded(text: string): string {
  return text
    .replace(ARABIC_MARKS, "")
    .replace(/[\u0622\u0623\u0625\u0671\u0649\u06CC\u0629]/g, (letter) => ARABIC_LETTERS[letter]!);
}

/** Text as it is searched: lower case, without diacritics ("Ö" is "o"), Arabic folded as arabicFolded does it ("كِتَاب" is "كتاب"). */
export function folded(text: string): string {
  return arabicFolded(text.normalize("NFD").replace(/\p{M}/gu, "")).toLowerCase();
}

/** A letter of a script written right to left: Arabic, Hebrew, Syriac, Thaana, N'Ko, Adlam and the like. */
const RIGHT_TO_LEFT =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Mandaic}\p{Script=Samaritan}]/u;

/**
 * Text set into a sentence in another language (a card's name in "Remove
 * {card}?"), isolated between U+2068 and U+2069 when it holds a letter
 * written right to left, so the sentence's own punctuation and numbers
 * stay where its language puts them; other text as it is. Text in an
 * element marked with its language is isolated by the style sheet instead.
 */
export function isolated(text: string): string {
  return RIGHT_TO_LEFT.test(text) ? `\u2068${text}\u2069` : text;
}

/** Whether two texts say the same in the same languages. */
export function sameText(a: LangText | undefined, b: LangText | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const tags = Object.keys(a);
  return tags.length === Object.keys(b).length && tags.every((tag) => a[tag] === b[tag]);
}

/** Untagged text as English: how a format-3 deck's text reads in format 4. */
export function inEnglish(value: string): LangText {
  return { en: value };
}

/**
 * Language-tagged text that needs no English (a note, a label, a
 * picture's description) as entered, as `tidiedSideText`; undefined when
 * none is left. Untagged text ("") is kept, not refused: such text must
 * state its language, and validateCardContent, meeting it, asks the user
 * for the language of that very part (textNeedsLanguage).
 */
export function tidiedTagged(text: LangText | undefined, formatted = false): LangText | undefined {
  if (text === undefined) return undefined;
  const kept = tidiedSideText(text, formatted);
  return Object.keys(kept).length === 0 ? undefined : kept;
}

/**
 * Text whose languages the user stated (a deck's name or description) as
 * entered: every language's text trimmed and an empty one left out, for
 * clearing a language's text removes that language; empty when none is
 * left. Each value is under the tag the user chose, or the app inferred
 * from the text's own tags, the deck's or the device's recent choices —
 * never one guessed from the page — and tags are kept lower case, as the
 * pod reads them. Untagged text ("") states no language, which such
 * text must, and two tags that differ only in case are one language
 * twice: the app asks for the language, and refuses one the text already
 * has, before it saves, so meeting either is a mistake in the app, not
 * the user's.
 *
 * The same words under several tags are text in several languages
 * ("Stockholm" in English and Swedish, "1969" in Swedish and Italian),
 * kept as they are: that includes the identical English copies the
 * formats once asked for, which the app cannot tell from a translation.
 */
export function tidiedStated(text: LangText): LangText {
  if ("" in text && text[""].trim() !== "")
    throw new Error("Text whose language is stated cannot be untagged");
  const tidied: Record<string, string> = {};
  for (const [tag, value] of Object.entries(text)) {
    const trimmed = value.trim();
    if (trimmed === "") continue;
    const lower = tag.toLowerCase();
    if (lower in tidied) throw new Error(`Text whose language is stated has ${lower} twice`);
    tidied[lower] = trimmed;
  }
  return tidied;
}

/**
 * The tag the texts use most, counting each text once per tag it has;
 * the first one met on a tie. Untagged text ("") states no language, so
 * it is no evidence of one: undefined when no text has a tag.
 */
export function usualTag(texts: readonly LangText[]): string | undefined {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const tag of Object.keys(text)) {
      if (tag !== "") counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  let usual: string | undefined;
  for (const [tag, count] of counts) {
    if (usual === undefined || count > counts.get(usual)!) usual = tag;
  }
  return usual;
}
