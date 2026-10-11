// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/** The looks the app comes in. */
export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

/**
 * The theme a user chose: one of the themes, or "system" for whichever
 * the browser prefers. A preference, stored as a concept of
 * solid-memo:Themes whose notation is the value here.
 */
export const THEME_CHOICES = ["system", "light", "dark"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** Until the user says otherwise, the app looks as the browser prefers. */
export const DEFAULT_THEME_CHOICE: ThemeChoice = "system";

export function isThemeChoice(value: string): value is ThemeChoice {
  return (THEME_CHOICES as readonly string[]).includes(value);
}

/** The theme to show: the one chosen, else (for "system") the one the browser prefers. */
export function resolveTheme(choice: ThemeChoice, preferred: Theme): Theme {
  return choice === "system" ? preferred : choice;
}
