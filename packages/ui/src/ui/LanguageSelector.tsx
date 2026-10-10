import { LOCALES, type Locale } from "@solid-memo/domain/locale";
import { useI18n } from "./i18n";
import { GlobeIcon } from "./icons";

/** Each language named in itself, so it is found whichever is spoken now. */
export const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", sv: "Svenska", ko: "한국어" };

/**
 * The languages the app speaks, as a list of their names behind a globe,
 * the one spoken now chosen: a list, not a flag per language, since a
 * language is not a country's and the masthead has room for only so many.
 */
export function LanguageSelector() {
  const { locale, chooseLocale, t } = useI18n();
  return (
    <label class="language-selector">
      <GlobeIcon />
      <select
        aria-label={t("language.label")}
        value={locale}
        // The options are LOCALES, so the value chosen is one.
        onInput={(event) => chooseLocale(event.currentTarget.value as Locale)}
      >
        {LOCALES.map((option) => (
          <option key={option} value={option} lang={option}>
            {LANGUAGE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
