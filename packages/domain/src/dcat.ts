import { english, inEnglish, sameText, shown, type LangText } from "./langText";
/**
 * The DCAT side of Solid Memo's data (see docs/data-model.md): the
 * terms of the EU vocabularies it uses, and what a deck states when the
 * user has not said.
 */

/** The EU data theme every library deck has: education, culture and sport. */
export const EDUCATION_THEME = "http://publications.europa.eu/resource/authority/data-theme/EDUC";

/** The EU data theme scheme, a theme taxonomy of every catalogue. */
export const DATA_THEME_SCHEME = "http://publications.europa.eu/resource/authority/data-theme";

export const TURTLE_MEDIA_TYPE = "https://www.iana.org/assignments/media-types/text/turtle";

/** A pod deck's distribution: its cards document, as a dcat:Distribution. */
export function distributionUrlOf(deckUrl: string): string {
  return `${deckUrl}-cards`;
}

/**
 * The description a deck gets when it has none: DCAT-AP asks one of
 * every dataset, and decks made before format 3 often had none. This is
 * the English, all that formats before 4 state.
 */
export function defaultDeckDescription(title: string): string {
  return `Flashcards: ${title}.`;
}

/**
 * The default description from format 4 on: in English and Swedish, the
 * Swedish naming the deck by its Swedish title when it has one, both by
 * its English title, or (format 5, a title in no English) the one shown.
 */
export function defaultDeckDescriptionText(title: LangText): LangText {
  const name = english(title) ?? shown(title);
  return { en: defaultDeckDescription(name), sv: `Kortlek: ${title.sv ?? name}.` };
}

/**
 * Whether a description is the default one the app gave a deck that had
 * none (in English, with or without its Swedish), for a deck by any of
 * `titles`: not text the user wrote, so a release's may replace it.
 */
export function isDefaultDeckDescription(description: LangText, titles: readonly LangText[]): boolean {
  return titles.some((title) => {
    const name = english(title) ?? shown(title);
    const tags = Object.keys(description).sort().join(",");
    return (
      (tags === "en" || (tags === "en,sv" && description.sv === defaultDeckDescriptionText(title).sv)) &&
      description.en === defaultDeckDescription(name)
    );
  });
}

/**
 * A format-3 description in format 4: the default one, which the app
 * wrote, in English and Swedish; any other as its English.
 */
export function descriptionInFormat4(description: string, title: string): LangText {
  return description === defaultDeckDescription(title) ? defaultDeckDescriptionText({ en: title }) : inEnglish(description);
}

/**
 * The description a deck group gets: DCAT-AP asks one of every
 * catalogue, and the user only names a group. In English and Swedish, as
 * a deck's, the Swedish naming the group by its Swedish name when it has
 * one, both by its English name, else the one shown.
 */
export function defaultDeckGroupDescription(title: LangText): LangText {
  const name = english(title) ?? shown(title);
  return { en: `Deck group: ${name}.`, sv: `Kortleksgrupp: ${title.sv ?? name}.` };
}

/**
 * Whether a group's description is the default one for its name (in
 * English, with or without its Swedish): not text the user wrote, so a
 * rename may give the group the default for its new name.
 */
export function isDefaultDeckGroupDescription(description: LangText, title: LangText): boolean {
  const generated = defaultDeckGroupDescription(title);
  return sameText(description, generated) || sameText(description, { en: generated.en! });
}
