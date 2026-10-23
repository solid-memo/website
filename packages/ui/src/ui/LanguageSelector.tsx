// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { LOCALES, type Locale } from "@solid-memo/domain/locale";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { GlobeIcon } from "./icons";

/** Each language named in itself, so it is found whichever is spoken now. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
  es: "Español",
  fr: "Français",
  sv: "Svenska",
  ko: "한국어",
};

/**
 * Choose a language, and say so when its messages could not be fetched
 * (offline): the screen stays in the language it was in.
 */
export function useChooseLocale(): {
  choose: (locale: Locale) => void;
  failure: ErrorText | null;
} {
  const { chooseLocale, tx } = useI18n();
  const [failed, setFailed] = useState<Locale | null>(null);
  function choose(chosen: Locale) {
    setFailed(null);
    chooseLocale(chosen).catch(() => setFailed(chosen));
  }
  const failure =
    failed === null ? null : (
      <>
        {tx("language.unavailable", {
          language: <span lang={failed}>{LANGUAGE_NAMES[failed]}</span>,
        })}
      </>
    );
  return { choose, failure };
}

/**
 * The languages the app speaks, as a list of their names behind a globe,
 * the one spoken now chosen: a list, not a flag per language, since a
 * language is not a country's and the masthead has room for only so many.
 */
export function LanguageSelector() {
  const { locale, t } = useI18n();
  const { choose, failure } = useChooseLocale();
  return (
    <>
      <label class="language-selector">
        <GlobeIcon />
        <select
          aria-label={t("language.label")}
          value={locale}
          // The options are LOCALES, so the value chosen is one.
          onInput={(event) => choose(event.currentTarget.value as Locale)}
        >
          {LOCALES.map((option) => (
            <option key={option} value={option} lang={option}>
              {LANGUAGE_NAMES[option]}
            </option>
          ))}
        </select>
      </label>
      <ErrorMessage error={failure} />
    </>
  );
}
