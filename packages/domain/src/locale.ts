/** The languages the app's own text comes in, in the order of their names in themselves. */
export const LOCALES = ["de", "en", "es", "fr", "sv", "ko"] as const;

export type Locale = (typeof LOCALES)[number];

/** The language the app speaks when nothing else is known. */
export const DEFAULT_LOCALE: Locale = "en";

/** The locale a language tag names ("sv-SE" names "sv"); null for one the app does not speak. */
export function localeOf(tag: string): Locale | null {
  const language = tag.toLowerCase().split("-")[0];
  return LOCALES.find((locale) => locale === language) ?? null;
}

/**
 * The language to speak: the user's choice, else the first of the
 * browser's preferred languages (most preferred first, as
 * navigator.languages lists them) the app speaks, else English.
 */
export function pickLocale(chosen: Locale | null, preferred: readonly string[]): Locale {
  if (chosen !== null) return chosen;
  for (const tag of preferred) {
    const locale = localeOf(tag);
    if (locale !== null) return locale;
  }
  return DEFAULT_LOCALE;
}
