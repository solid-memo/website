// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { english, inEnglish, sameText, shown, type LangText } from "./langText.ts";
import { escapedCharacters, HASHED_CHARACTERS } from "./pathKeys.ts";
/**
 * The DCAT side of Solid Memo's data (see docs/data-model.md): the
 * terms of the EU vocabularies it uses, and what a deck states when the
 * user has not said.
 */

/** The EU data theme every library deck has: education, culture and sport. */
export const EDUCATION_THEME = "http://publications.europa.eu/resource/authority/data-theme/EDUC";

/** The EU data theme scheme, a theme taxonomy of every catalog. */
export const DATA_THEME_SCHEME = "http://publications.europa.eu/resource/authority/data-theme";

export const TURTLE_MEDIA_TYPE = "https://www.iana.org/assignments/media-types/text/turtle";

/** A pod deck's distribution: its cards document, as a dcat:Distribution. */
export function distributionUrlOf(deckUrl: string): string {
  return `${deckUrl}-cards`;
}

/**
 * What a text written by the app has around it in a term's longest name
 * (termKeyLength in the solid package): its quotes and a two-letter
 * language tag, `@en` or `@sv`. Untagged, it has less.
 */
const TAGGED_TEXT_ROOM = 5;

/** What a name cut short ends in (namedWithin). */
const ELLIPSIS = "…";

/** How many characters a text has in a term's longest name, its escaped ones written as two. */
function keyedLength(text: string): number {
  return text.length + escapedCharacters(text);
}

/**
 * `name` between `before` and `after`, as a text the app writes: with the
 * name cut short, at a code point and an ellipsis after it, where the
 * whole would be longer than a term may be (HASHED_CHARACTERS, the bound
 * on every term the app reads and writes). A name may be as long as a
 * term, so the text around it could take it past the bound, and no
 * write of it would be accepted.
 */
export function namedWithin(before: string, name: string, after: string): string {
  const room = HASHED_CHARACTERS - TAGGED_TEXT_ROOM - keyedLength(before) - keyedLength(after);
  if (keyedLength(name) <= room) return `${before}${name}${after}`;
  let used = keyedLength(ELLIPSIS);
  let end = 0;
  for (const point of name) {
    used += keyedLength(point);
    if (used > room) break;
    end += point.length;
  }
  return `${before}${name.slice(0, end)}${ELLIPSIS}${after}`;
}

/**
 * The description a deck gets when it has none: DCAT-AP asks one of
 * every dataset, and decks made before format 3 often had none. This is
 * the English, all that formats before 4 state. A title as long as a
 * term is cut short in it (namedWithin), so that a deck always gets a
 * description it can be saved with.
 */
export function defaultDeckDescription(title: string): string {
  return namedWithin("Flashcards: ", title, ".");
}

/**
 * The default description from format 4 on: in English and Swedish, the
 * Swedish naming the deck by its Swedish title when it has one, both by
 * its English title, or (format 5, a title in no English) the one shown.
 * Each is cut short, as defaultDeckDescription's English is.
 */
export function defaultDeckDescriptionText(title: LangText): LangText {
  const name = english(title) ?? shown(title);
  return { en: defaultDeckDescription(name), sv: namedWithin("Kortlek: ", title.sv ?? name, ".") };
}

/**
 * Whether `text` is the English default description for `name`: as
 * defaultDeckDescription gives it, or whole, as the app wrote it before
 * it cut a title too long for it short. A record written then may hold
 * that one, within the bound untagged.
 */
function isDefaultEnglish(text: string | undefined, name: string): boolean {
  return text === defaultDeckDescription(name) || text === `Flashcards: ${name}.`;
}

/**
 * Whether a description is the default one the app gave a deck that had
 * none (in English, with or without its Swedish), for a deck by any of
 * `titles`: not text the user wrote, so a release's may replace it.
 */
export function isDefaultDeckDescription(
  description: LangText,
  titles: readonly LangText[],
): boolean {
  return titles.some((title) => {
    const name = english(title) ?? shown(title);
    const tags = Object.keys(description).sort().join(",");
    return (
      (tags === "en" ||
        (tags === "en,sv" && description.sv === defaultDeckDescriptionText(title).sv)) &&
      isDefaultEnglish(description.en, name)
    );
  });
}

/**
 * A format-3 description in format 4: the default one, which the app
 * wrote, in English and Swedish; any other as its English.
 */
export function descriptionInFormat4(description: string, title: string): LangText {
  return isDefaultEnglish(description, title)
    ? defaultDeckDescriptionText({ en: title })
    : inEnglish(description);
}

/**
 * The description a deck group gets: DCAT-AP asks one of every
 * catalog, and the user only names a group. In English and Swedish, as
 * a deck's, the Swedish naming the group by its Swedish name when it has
 * one, both by its English name, else the one shown. Each is cut short,
 * as a deck's is (namedWithin), so a group named as long as a term may
 * be still gets a description it can be saved with.
 */
export function defaultDeckGroupDescription(title: LangText): LangText {
  const name = english(title) ?? shown(title);
  return {
    en: namedWithin("Deck group: ", name, "."),
    sv: namedWithin("Kortleksgrupp: ", title.sv ?? name, "."),
  };
}

/**
 * Whether a group's description is the default one for its name (in
 * English, with or without its Swedish): not text the user wrote, so a
 * rename may give the group the default for its new name. The default
 * may also be whole, as the app wrote it before it cut a name too long
 * for it short.
 */
export function isDefaultDeckGroupDescription(description: LangText, title: LangText): boolean {
  const name = english(title) ?? shown(title);
  const whole = { en: `Deck group: ${name}.`, sv: `Kortleksgrupp: ${title.sv ?? name}.` };
  return [defaultDeckGroupDescription(title), whole].some(
    (generated) => sameText(description, generated) || sameText(description, { en: generated.en }),
  );
}
