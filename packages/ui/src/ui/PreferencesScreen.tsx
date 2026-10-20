// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useState } from "preact/hooks";
import type { AnswerScale } from "@solid-memo/domain/answerScale";
import {
  INVALID_DATA_POLICIES,
  type InvalidDataPolicy,
} from "@solid-memo/domain/invalidDataPolicy";
import { LOCALES } from "@solid-memo/domain/locale";
import type { Scheduler } from "@solid-memo/domain/fsrs";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import { PALETTES, type Palette } from "@solid-memo/domain/palette";
import { TEXT_SCALES, TEXT_SIZES } from "@solid-memo/domain/textSize";
import { THEME_CHOICES } from "@solid-memo/domain/theme";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type I18n, type ErrorText } from "./i18n";
import { LANGUAGE_NAMES } from "./LanguageSelector";
import { useTheme } from "./theme";

/** Each palette's messages, by its id. */
const PALETTE_MESSAGES = {
  standard: "standard",
  "high-contrast": "highContrast",
  "color-vision": "colorVision",
  parchment: "parchment",
} as const satisfies Record<Palette, string>;

/** The browser's wish for more contrast, which High contrast answers. */
const MORE_CONTRAST_QUERY = "(prefers-contrast: more)";

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
 * The schedulers on offer, each with its label and meaning: FSRS-6
 * first, as the recommended one, its hint saying why.
 */
function schedulerOptions(
  t: I18n["t"],
): { value: Scheduler; label: string; hint: string; recommended: boolean }[] {
  return [
    {
      value: "fsrs6",
      label: t("preferences.scheduler.fsrs6.label"),
      hint: t("preferences.scheduler.fsrs6.hint"),
      recommended: true,
    },
    {
      value: "sm2",
      label: t("preferences.scheduler.sm2.label"),
      hint: t("preferences.scheduler.sm2.hint"),
      recommended: false,
    },
  ];
}

/** The desired retention as the field shows it: a whole percent. */
function percentOf(share: number): string {
  return String(Math.round(share * 100));
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

/**
 * The study preferences, saved together. The scheduler is one of them:
 * the caller decides what saving a change of it takes (switchScheduler).
 * The desired retention, a percent from 70 to 97, can be set only while
 * FSRS-6 is chosen, and the answer buttons only while SM-2 is, as FSRS-6
 * always uses the four; each keeps its value meanwhile.
 */
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
  const {
    choice: themeChoice,
    chooseTheme,
    palette,
    choosePalette,
    textSize,
    chooseTextSize,
  } = useTheme();
  const [moreContrast, setMoreContrast] = useState(() => matchMedia(MORE_CONTRAST_QUERY).matches);
  const showContrastHint = moreContrast && palette !== "high-contrast";

  // The browser's wish as it changes while the screen is open.
  useEffect(() => {
    const query = matchMedia(MORE_CONTRAST_QUERY);
    const follow = () => setMoreContrast(query.matches);
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);
  const [newCardsPerDay, setNewCardsPerDay] = useState(String(preferences.newCardsPerDay));
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState(String(preferences.maxReviewsPerDay));
  const [dayBoundaryHour, setDayBoundaryHour] = useState(String(preferences.dayBoundaryHour));

  const [scheduler, setScheduler] = useState<Scheduler>(preferences.scheduler);
  const [retention, setRetention] = useState(percentOf(preferences.desiredRetention));
  const [answerScale, setAnswerScale] = useState<AnswerScale>(preferences.answerScale);
  const fsrs = scheduler === "fsrs6";
  const [developerMode, setDeveloperMode] = useState(preferences.developerMode);
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
      scheduler,
      // The field is disabled, so unchecked, while SM-2 is chosen: what
      // it holds then is not the learner's to save.
      desiredRetention: fsrs ? Number(retention) / 100 : preferences.desiredRetention,
      schedulerInvitationDismissed: preferences.schedulerInvitationDismissed,
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
        <fieldset
          aria-describedby={
            showContrastHint ? "pref-palette-contrast-hint pref-palette-hint" : "pref-palette-hint"
          }
        >
          <legend>{t("preferences.palette.legend")}</legend>
          {PALETTES.map((option) => (
            <label key={option} class="radio-option">
              <input
                type="radio"
                name="palette"
                value={option}
                checked={palette === option}
                onChange={() => choosePalette(option)}
              />
              {/* The palette's own colors, which its data-palette gives (palettes.css). */}
              <span class="palette-swatch" data-palette={option} aria-hidden="true">
                <i class="swatch-text" />
                <i class="swatch-primary" />
                <i class="swatch-worst" />
                <i class="swatch-best" />
              </span>
              {t(`palette.${PALETTE_MESSAGES[option]}.name`)}
              <span class="hint">{t(`palette.${PALETTE_MESSAGES[option]}.description`)}</span>
            </label>
          ))}
          {showContrastHint && (
            <p id="pref-palette-contrast-hint" class="hint">
              {t("preferences.palette.moreContrast")}
            </p>
          )}
          <p id="pref-palette-hint" class="hint">
            {t("preferences.palette.hint")}
          </p>
        </fieldset>
        <fieldset aria-describedby="pref-text-size-hint">
          <legend>{t("preferences.textSize.legend")}</legend>
          {TEXT_SIZES.map((option) => (
            <label key={option} class="radio-option">
              <input
                type="radio"
                name="textSize"
                value={option}
                checked={textSize === option}
                onChange={() => chooseTextSize(option)}
              />
              {t(`textSize.${option}`)}
              {/* At the size it names, whatever size the page is at now. */}
              <span
                class="hint text-size-sample"
                style={{ fontSize: `calc(1rem * ${TEXT_SCALES[option]} / var(--text-scale))` }}
                aria-hidden="true"
              >
                {t("preferences.textSize.sample")}
              </span>
            </label>
          ))}
          <p id="pref-text-size-hint" class="hint">
            {t("preferences.textSize.hint")}
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
        <fieldset aria-describedby="pref-scheduler-hint">
          <legend>{t("preferences.scheduler.legend")}</legend>
          {schedulerOptions(t).map((option) => (
            <label key={option.value} class="radio-option">
              <input
                type="radio"
                name="scheduler"
                value={option.value}
                checked={scheduler === option.value}
                onChange={() => setScheduler(option.value)}
                disabled={busy}
              />
              {option.label}
              {option.recommended && (
                <span class="recommended-tag">{t("preferences.scheduler.recommended")}</span>
              )}
              <span class="hint">{option.hint}</span>
            </label>
          ))}
          <p id="pref-scheduler-hint" class="hint">
            {t("preferences.scheduler.hint")}
          </p>
        </fieldset>
        <label for="pref-retention">{t("preferences.desiredRetention")}</label>
        <input
          id="pref-retention"
          type="number"
          min="70"
          max="97"
          step="1"
          value={retention}
          onInput={(e) => setRetention(e.currentTarget.value)}
          aria-describedby="pref-retention-hint"
          required
          disabled={busy || !fsrs}
        />
        <p id="pref-retention-hint" class="hint">
          {t("preferences.desiredRetentionHint")}
        </p>
        {/* Under FSRS-6 the whole group is disabled, its hint saying why. */}
        <fieldset disabled={fsrs} aria-describedby={fsrs ? "pref-answer-scale-hint" : undefined}>
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
          {fsrs && (
            <p id="pref-answer-scale-hint" class="hint">
              {t("preferences.answerScale.fsrs6Hint")}
            </p>
          )}
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
