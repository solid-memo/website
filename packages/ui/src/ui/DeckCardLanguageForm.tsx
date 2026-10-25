// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { useI18n } from "./i18n";

/** The form's words for a deck's card language. */
const CARD_WORDS = {
  label: "deckPreferences.cardLanguage.label",
  hint: "deckPreferences.cardLanguage.hint",
  none: "deckPreferences.cardLanguage.none",
  save: "deckPreferences.cardLanguage.save",
} as const;

/** The form's words for a course's language. */
const COURSE_WORDS = {
  label: "deckPreferences.courseLanguage.label",
  hint: "deckPreferences.courseLanguage.hint",
  none: "deckPreferences.courseLanguage.none",
  save: "deckPreferences.courseLanguage.save",
} as const;

/**
 * The language a deck's cards are shown in first (Deck.cardLanguage,
 * docs/i18n.md "Which language"), chosen from a list: the app's
 * language, which is the default and clears the choice, then each
 * language the deck's cards state (preferableCardLanguages), named in
 * full (languageLabel), then the deck's choice when its cards no longer
 * state it, so it shows and can be cleared. Nothing else is offered: a
 * language no card has would change nothing. While the cards are read
 * (`languages` undefined), the list holds the default and the choice
 * only; when they state none, the hint says so.
 *
 * Its own form, with its own Save, so a choice is saved apart from the
 * daily limits and the screen stays. The select is labeled and described
 * by the hint; while a change saves it is disabled and Save keeps the
 * focus (aria-disabled), as the screen's other buttons do.
 *
 * A course's deck (`course`) names it its course language, with words of
 * its own: there it ranks the course's own text too, its title, chapters
 * and theory, and lists the languages the course states
 * (preferableCourseLanguages).
 */
export function DeckCardLanguageForm({
  value,
  languages,
  course = false,
  busy,
  onSave,
}: {
  /** The deck's card language; undefined for the app's. */
  value: string | undefined;
  /** The languages the deck's cards state, in order; undefined while they are read. */
  languages: readonly string[] | undefined;
  /** The deck is a course's: the choice is its course language. */
  course?: boolean;
  busy: boolean;
  /** Save the choice: a tag, or null for the app's language. */
  onSave: (language: string | null) => void;
}) {
  const { t, languageLabel } = useI18n();
  /** The option chosen, "" for the app's language. */
  const [chosen, setChosen] = useState(value ?? "");
  const listed = languages ?? [];
  const options = value === undefined || listed.includes(value) ? listed : [...listed, value];
  const words = course ? COURSE_WORDS : CARD_WORDS;

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (busy) return;
    onSave(chosen === "" ? null : chosen);
  }

  return (
    <form class="deck-card-language" onSubmit={handleSubmit}>
      <label for="deck-card-language">{t(words.label)}</label>
      <select
        id="deck-card-language"
        value={chosen}
        disabled={busy}
        aria-describedby="deck-card-language-hint"
        onInput={(event) => setChosen(event.currentTarget.value)}
      >
        <option value="">{t("deckPreferences.cardLanguage.default")}</option>
        {options.map((tag) => (
          <option key={tag} value={tag}>
            {languageLabel(tag)}
          </option>
        ))}
      </select>
      <p id="deck-card-language-hint" class="hint">
        {languages !== undefined && languages.length === 0 ? t(words.none) : t(words.hint)}
      </p>
      <button type="submit" aria-disabled={busy}>
        {t(words.save)}
      </button>
    </form>
  );
}
