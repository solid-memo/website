import { useState } from "preact/hooks";
import type { AnswerScale } from "@solid-memo/domain/answerScale";
import {
  INVALID_DATA_POLICIES,
  type InvalidDataPolicy,
} from "@solid-memo/domain/invalidDataPolicy";
import { LOCALES } from "@solid-memo/domain/locale";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import { THEME_CHOICES } from "@solid-memo/domain/theme";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type I18n, type ErrorText } from "./i18n";
import { LANGUAGE_NAMES } from "./LanguageSelector";
import { useTheme } from "./theme";

/** The answer scales on offer, each with its label and meaning. */
function answerScaleOptions(t: I18n["t"]): {
  value: AnswerScale;
  label: string;
  hint: string;
}[] {
  return [
    {
      value: "sm2",
      label: t("preferences.answerScale.sm2.label"),
      hint: t("preferences.answerScale.sm2.hint"),
    },
    {
      value: "minimal",
      label: t("preferences.answerScale.minimal.label"),
      hint: t("preferences.answerScale.minimal.hint"),
    },
  ];
}

/**
 * Each policy with its label and meaning, in the user's language; the
 * English ones are the vocabulary concept scheme's labels and definitions.
 */
function policyOption(
  value: InvalidDataPolicy,
  t: I18n["t"],
): { value: InvalidDataPolicy; label: string; hint: string } {
  switch (value) {
    case "block-instance":
      return {
        value,
        label: t("preferences.policy.blockInstance.label"),
        hint: t("preferences.policy.blockInstance.hint"),
      };
    case "block-subject":
      return {
        value,
        label: t("preferences.policy.blockSubject.label"),
        hint: t("preferences.policy.blockSubject.hint"),
      };
    case "warn-only":
      return {
        value,
        label: t("preferences.policy.warnOnly.label"),
        hint: t("preferences.policy.warnOnly.hint"),
      };
  }
}

export function PreferencesScreen({
  preferences,
  busy,
  error,
  onSave,
}: {
  preferences: StudyPreferences;
  busy: boolean;
  error: ErrorText | null;
  onSave: (preferences: StudyPreferences) => void;
}) {
  const { t, locale, chooseLocale } = useI18n();
  const { choice: themeChoice, chooseTheme } = useTheme();
  const [newCardsPerDay, setNewCardsPerDay] = useState(
    String(preferences.newCardsPerDay),
  );
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState(
    String(preferences.maxReviewsPerDay),
  );
  const [dayBoundaryHour, setDayBoundaryHour] = useState(
    String(preferences.dayBoundaryHour),
  );

  const [answerScale, setAnswerScale] = useState<AnswerScale>(
    preferences.answerScale,
  );
  const [developerMode, setDeveloperMode] = useState(
    preferences.developerMode,
  );
  const [invalidDataPolicy, setInvalidDataPolicy] = useState<InvalidDataPolicy>(
    preferences.invalidDataPolicy,
  );

  function handleSubmit(event: Event) {
    event.preventDefault();
    onSave({
      newCardsPerDay: Number(newCardsPerDay),
      maxReviewsPerDay: Number(maxReviewsPerDay),
      dayBoundaryHour: Number(dayBoundaryHour),
      answerScale,
      developerMode,
      invalidDataPolicy,
      theme: themeChoice,
    });
  }

  return (
    <section>
      <header>
        <h2>{t("preferences.heading")}</h2>
      </header>
      <form onSubmit={handleSubmit}>
        {/* Each group's hint is its description, heard as focus enters it. */}
        <fieldset aria-describedby="pref-language-hint">
          <legend>{t("preferences.language.legend")}</legend>
          {LOCALES.map((option) => (
            <label key={option} class="radio-option" lang={option}>
              <input
                type="radio"
                name="language"
                value={option}
                checked={locale === option}
                onChange={() => chooseLocale(option)}
              />
              {LANGUAGE_NAMES[option]}
            </label>
          ))}
          <p id="pref-language-hint" class="hint">
            {t("preferences.language.hint")}
          </p>
        </fieldset>
        <fieldset aria-describedby="pref-theme-hint">
          <legend>{t("preferences.theme.legend")}</legend>
          {THEME_CHOICES.map((option) => (
            <label key={option} class="radio-option">
              <input
                type="radio"
                name="theme"
                value={option}
                checked={themeChoice === option}
                onChange={() => chooseTheme(option)}
              />
              {t(`theme.${option}`)}
            </label>
          ))}
          <p id="pref-theme-hint" class="hint">
            {t("preferences.theme.hint")}
          </p>
        </fieldset>
        <label for="pref-new">{t("preferences.newCardsPerDay")}</label>
        <input
          id="pref-new"
          type="number"
          min="0"
          value={newCardsPerDay}
          onInput={(e) => setNewCardsPerDay(e.currentTarget.value)}
          aria-describedby="pref-new-hint"
          required
          disabled={busy}
        />
        <p id="pref-new-hint" class="hint">
          {t("studyPace.startSmall")}
        </p>
        <label for="pref-max">{t("preferences.maxReviewsPerDay")}</label>
        <input
          id="pref-max"
          type="number"
          min="0"
          value={maxReviewsPerDay}
          onInput={(e) => setMaxReviewsPerDay(e.currentTarget.value)}
          required
          disabled={busy}
        />
        <label for="pref-boundary">{t("preferences.dayBoundaryHour")}</label>
        <input
          id="pref-boundary"
          type="number"
          min="0"
          max="23"
          value={dayBoundaryHour}
          onInput={(e) => setDayBoundaryHour(e.currentTarget.value)}
          aria-describedby="pref-boundary-hint"
          required
          disabled={busy}
        />
        <p id="pref-boundary-hint" class="hint">
          {t("preferences.dayBoundaryHint")}
        </p>
        <fieldset>
          <legend>{t("preferences.answerScale.legend")}</legend>
          {answerScaleOptions(t).map((option) => (
            <label key={option.value} class="radio-option">
              <input
                type="radio"
                name="answer-scale"
                value={option.value}
                checked={answerScale === option.value}
                onChange={() => setAnswerScale(option.value)}
                disabled={busy}
              />
              {option.label}
              <span class="hint">{option.hint}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{t("preferences.policy.legend")}</legend>
          {INVALID_DATA_POLICIES.map((value) => policyOption(value, t)).map((option) => (
            <label key={option.value} class="radio-option">
              <input
                type="radio"
                name="invalid-data-policy"
                value={option.value}
                checked={invalidDataPolicy === option.value}
                onChange={() => setInvalidDataPolicy(option.value)}
                disabled={busy}
              />
              {option.label}
              <span class="hint">{option.hint}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{t("preferences.developer.legend")}</legend>
          <label>
            <input
              type="checkbox"
              checked={developerMode}
              onChange={(e) => setDeveloperMode(e.currentTarget.checked)}
              aria-describedby="pref-developer-hint"
              disabled={busy}
            />
            {t("preferences.developer.mode")}
          </label>
          <p id="pref-developer-hint" class="hint">
            {t("preferences.developer.hint")}
          </p>
        </fieldset>
        <button type="submit" disabled={busy}>
          {t("preferences.save")}
        </button>
      </form>
      <ErrorMessage error={error} />
    </section>
  );
}
