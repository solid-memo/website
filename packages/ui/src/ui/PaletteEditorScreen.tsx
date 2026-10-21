// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId, useMemo, useState } from "preact/hooks";
import {
  checkPalette,
  effectiveColors,
  PALETTE_ROLES,
  paletteVerdict,
  type CustomPalette,
  type PairCheck,
  type PaletteColors,
  type PaletteDraft,
  type PaletteRole,
} from "@solid-memo/domain/customPalette";
import { shown } from "@solid-memo/domain/langText";
import { PALETTES, type Palette } from "@solid-memo/domain/palette";
import { THEMES, type Theme } from "@solid-memo/domain/theme";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText, type I18n } from "./i18n";
import { PALETTE_MESSAGES, ResetColors } from "./PreferencesScreen";
import { paletteStyle } from "./theme";

/** The answer buttons' grades, 0 to 5, by their names in study. */
const GRADES = ["blackout", "wrong", "almost", "hard", "good", "easy"] as const;

/** Each role's message, by its name; a grade's says which button it is. */
const ROLE_MESSAGES = {
  "--bg": "bg",
  "--surface": "surface",
  "--surface-sunken": "surfaceSunken",
  "--surface-hover": "surfaceHover",
  "--text": "text",
  "--text-muted": "textMuted",
  "--border": "border",
  "--control-border": "controlBorder",
  "--primary": "primary",
  "--primary-fill": "primaryFill",
  "--primary-hover": "primaryHover",
  "--primary-soft": "primarySoft",
  "--on-primary": "onPrimary",
  "--link": "link",
  "--danger": "danger",
  "--danger-soft": "dangerSoft",
  "--warning-text": "warningText",
  "--warning-soft": "warningSoft",
} as const;

/** What a role is called: the answer buttons by their grade's name in study. */
function roleName(role: string, t: I18n["t"]): string {
  const grade = /^--grade-(\d)$/.exec(role);
  if (grade !== null)
    return t("paletteEditor.role.grade", {
      grade: t(`study.quality.${GRADES[Number(grade[1])]!}`),
    });
  return t(`paletteEditor.role.${ROLE_MESSAGES[role as keyof typeof ROLE_MESSAGES]}`);
}

/**
 * The editor of a palette of the user's own (docs/theme.md, Palettes of
 * one's own): its name, the palette it is based on, and a color for
 * each role it may set, in the light theme and in the dark, each
 * starting at its base's. A preview in each theme shows the colors as
 * they are, and a table measures every pair that holds text against the
 * contrast it needs, as the colors change; a live region says how they
 * stand. A palette whose text cannot be read on the background is not
 * saved; one with a pair below what it needs is saved only with "Use
 * anyway". "Reset colors" goes back to the Standard colors, drawn in
 * them, whatever this palette does to the page.
 */
export function PaletteEditorScreen({
  palette,
  busy,
  error,
  cancelHref,
  onSave,
}: {
  /** The palette edited; a new one when absent. */
  palette?: CustomPalette;
  busy: boolean;
  error: ErrorText | null;
  /** Where Cancel leads: the preferences. */
  cancelHref: string;
  onSave: (draft: PaletteDraft, useAnyway: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const id = useId();
  const [name, setName] = useState(() =>
    palette === undefined ? "" : shown(palette.title, [locale]),
  );
  const [basedOn, setBasedOn] = useState<Palette>(palette?.basedOn ?? "standard");
  const [colors, setColors] = useState<Record<Theme, PaletteColors>>(() => ({
    light: palette?.light ?? {},
    dark: palette?.dark ?? {},
  }));
  /** The pairs below what they need were shown: the next save is the user's "Use anyway". */
  const [warned, setWarned] = useState(false);
  const [refusedShown, setRefusedShown] = useState(false);

  const settings = { basedOn, ...colors };
  const checks = useMemo(() => checkPalette(settings), [basedOn, colors]);
  const verdict = paletteVerdict(checks);
  const low = checks.filter((check) => check.verdict !== "pass").length;

  function change(update: () => void) {
    update();
    setWarned(false);
    setRefusedShown(false);
  }

  function draft(): PaletteDraft {
    return {
      url: palette?.url ?? null,
      // The name in the page's language, the others it has kept.
      title: { ...palette?.title, [locale]: name.trim() },
      basedOn,
      light: colors.light,
      dark: colors.dark,
    };
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (verdict === "refused") return setRefusedShown(true);
    if (verdict === "low") return setWarned(true);
    onSave(draft(), false);
  }

  return (
    <section class="palette-editor">
      <header>
        <h2>
          {t(palette === undefined ? "paletteEditor.headingNew" : "paletteEditor.headingEdit")}
        </h2>
        <p class="hint">{t("paletteEditor.intro")}</p>
      </header>
      <form onSubmit={handleSubmit}>
        <label for={`${id}-name`}>{t("paletteEditor.name")}</label>
        <input
          id={`${id}-name`}
          type="text"
          value={name}
          onInput={(event) => setName(event.currentTarget.value)}
          required
          disabled={busy}
        />
        <fieldset aria-describedby={`${id}-base-hint`}>
          <legend>{t("paletteEditor.basedOn")}</legend>
          {PALETTES.map((option) => (
            <label key={option} class="radio-option">
              <input
                type="radio"
                name={`${id}-base`}
                value={option}
                checked={basedOn === option}
                onChange={() => change(() => setBasedOn(option))}
                disabled={busy}
              />
              {t(`palette.${PALETTE_MESSAGES[option]}.name`)}
            </label>
          ))}
          <p id={`${id}-base-hint`} class="hint">
            {t("paletteEditor.basedOnHint")}
          </p>
        </fieldset>
        {THEMES.map((theme) => (
          <ThemeColors
            key={theme}
            theme={theme}
            settings={settings}
            checks={checks.filter((check) => check.theme === theme)}
            busy={busy}
            onChange={(role, color) =>
              change(() =>
                setColors((was) => ({ ...was, [theme]: { ...was[theme], [role]: color } })),
              )
            }
            onClear={() => change(() => setColors((was) => ({ ...was, [theme]: {} })))}
          />
        ))}
        <p class="palette-status" role="status">
          {verdict === "refused"
            ? t("paletteEditor.status.refused")
            : verdict === "low"
              ? t("paletteEditor.status.low", { count: low })
              : t("paletteEditor.status.pass")}
        </p>
        {refusedShown && <ErrorMessage error={t("errors.paletteUnreadable")} />}
        {warned && (
          <div class="palette-warning" role="alert">
            <p>{t("errors.paletteContrastLow")}</p>
            <button type="button" disabled={busy} onClick={() => onSave(draft(), true)}>
              {t("paletteEditor.useAnyway")}
            </button>
          </div>
        )}
        {error !== null && <ErrorMessage error={error} />}
        <div class="palette-editor-actions">
          <button type="submit" class="primary" disabled={busy}>
            {busy ? t("paletteEditor.saving") : t("paletteEditor.save")}
          </button>
          <a class="button" href={cancelHref}>
            {t("paletteEditor.cancel")}
          </a>
          <ResetColors />
        </div>
      </form>
    </section>
  );
}

/**
 * One theme's colors: a color field for each role, at the palette's or
 * its base's color, a preview in them, and the table of their pairs.
 */
function ThemeColors({
  theme,
  settings,
  checks,
  busy,
  onChange,
  onClear,
}: {
  theme: Theme;
  settings: { basedOn: Palette; light: PaletteColors; dark: PaletteColors };
  checks: readonly PairCheck[];
  busy: boolean;
  onChange: (role: PaletteRole, color: string) => void;
  onClear: () => void;
}) {
  const { t, locale } = useI18n();
  const id = useId();
  const colors = effectiveColors(settings, theme);
  const ratio = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (
    <div class="palette-theme">
      <fieldset>
        <legend>{t(`paletteEditor.${theme}`)}</legend>
        <div class="color-fields">
          {PALETTE_ROLES.map((role) => (
            <div key={role} class="color-field">
              <input
                id={`${id}${role}`}
                type="color"
                value={colors[role]}
                onInput={(event) => onChange(role, event.currentTarget.value)}
                disabled={busy}
              />
              <label for={`${id}${role}`}>{roleName(role, t)}</label>
              {/* What the field holds, for the eye; a screen reader hears the field's own value. */}
              <code aria-hidden="true">{colors[role]}</code>
            </div>
          ))}
        </div>
        <button type="button" onClick={onClear} disabled={busy}>
          {t(`paletteEditor.clear.${theme}`)}
        </button>
      </fieldset>
      {/* Every color here is held to #rrggbb (paletteStyle); the preview says nothing the table does not. */}
      <div class="palette-preview" style={paletteStyle(colors)} aria-hidden="true">
        <p class="preview-heading">{t("paletteEditor.preview.heading")}</p>
        <p class="preview-muted">{t("paletteEditor.preview.muted")}</p>
        <p>
          <span class="preview-link">{t("paletteEditor.preview.link")}</span>{" "}
          <span class="preview-danger">{t("paletteEditor.preview.danger")}</span>{" "}
          <span class="preview-warning">{t("paletteEditor.preview.warning")}</span>
        </p>
        <p>
          <span class="preview-button">{t("paletteEditor.preview.button")}</span>{" "}
          <span class="preview-field">{t("paletteEditor.preview.field")}</span>
        </p>
        <p class="preview-grades">
          {GRADES.map((grade, at) => (
            <span key={grade} class={`preview-grade-${at}`}>
              {at}
            </span>
          ))}
        </p>
      </div>
      <h3 id={`${id}-contrast`}>{t(`paletteEditor.contrast.${theme}`)}</h3>
      <div class="table-scroll" role="region" aria-labelledby={`${id}-contrast`} tabIndex={0}>
        <table class="contrast-table">
          <thead>
            <tr>
              <th scope="col">{t("paletteEditor.contrast.front")}</th>
              <th scope="col">{t("paletteEditor.contrast.back")}</th>
              <th scope="col">{t("paletteEditor.contrast.ratio")}</th>
              <th scope="col">{t("paletteEditor.contrast.needs")}</th>
              <th scope="col">{t("paletteEditor.contrast.result")}</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => (
              <tr key={`${check.front} ${check.back} ${check.tint}`} class={check.verdict}>
                <td>{roleName(check.front, t)}</td>
                <td>
                  {check.tint === undefined
                    ? roleName(check.back, t)
                    : t(`paletteEditor.contrast.tint.${check.tint}`, {
                        button: roleName(check.back, t),
                      })}
                </td>
                <td>
                  {t("paletteEditor.contrast.ratioValue", { ratio: ratio.format(check.ratio) })}
                </td>
                <td>
                  {t("paletteEditor.contrast.ratioValue", { ratio: ratio.format(check.target) })}
                </td>
                <td>{t(`paletteEditor.contrast.${check.verdict}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
