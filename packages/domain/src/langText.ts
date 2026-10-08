import type { LangText, LangTexts } from "@solid-memo/vocab/types.generated";

export type { LangText, LangTexts };

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
  return Object.keys(text).sort().find((t) => t.startsWith(`${language}-`));
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
  if ("" in text && text[""].trim() !== "") throw new Error("Text whose language is stated cannot be untagged");
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
