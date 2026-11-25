// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { paintedColors, parsePalette, type CustomPalette } from "@solid-memo/domain/customPalette";
import { localeOf, type Locale } from "@solid-memo/domain/locale";
import { PALETTE_SETTING, type Palette } from "@solid-memo/domain/palette";
import type { SettingKind } from "@solid-memo/domain/setting";
import { TEXT_SIZE_SETTING, type TextSize } from "@solid-memo/domain/textSize";
import { THEME_SETTING, type ThemeChoice } from "@solid-memo/domain/theme";
import {
  CUSTOM_PALETTE_KEY,
  LANGUAGE_KEY,
  PALETTE_KEY,
  SEEN_HIGHLIGHTS_KEY,
  TEXT_SIZE_KEY,
  THEME_KEY,
  type DeviceStore,
  type DeviceValue,
  type DeviceValueKind,
} from "./ports/device";

/**
 * The language the user chose, as its text: none when none was chosen,
 * and for text that is no language of the app's. Without it the app
 * speaks the browser's language.
 */
const LANGUAGE: DeviceValueKind<Locale | null> = {
  decode: (stored) => localeOf(String(stored)),
  fallback: null,
  text: true,
};

/**
 * A setting (SettingKind), as its text: the fallback is kept as no
 * choice at all, which is how the script in index.html reads it, and a
 * value that is not one of the setting's is read as the fallback.
 */
function settingValue<T extends string>({ isValue, fallback }: SettingKind<T>): DeviceValueKind<T> {
  return {
    decode: (stored) => {
      const text = String(stored);
      return isValue(text) ? text : fallback;
    },
    fallback,
    text: true,
  };
}

/**
 * The most characters the custom palette's copy takes, its key and its
 * text together. The colors of every painted role in both themes take a
 * small part of it; the rest is for the palette's address.
 */
const MAX_CUSTOM_PALETTE_CHARACTERS = 8192;

/**
 * The user's own palette being shown, kept as only what the first paint
 * needs: its address (`url`), its base (`basedOn`) and the colors to
 * paint in the light theme and in the dark (`light`, `dark`, each by
 * role: paintedColors), which the script in index.html sets on the root
 * before the first paint, each held there again to its role and to
 * `#rrggbb`. Its name is not kept: a screen that shows it reads it from
 * the pod. What is read back is held to the palette's rules again
 * (parsePalette): storage is the user's, but any script of the site's
 * origin may have written it. One kept whole by an earlier version
 * (under `palette`) is read as the palette it holds, without its name.
 * Without it, the first paint is in the palette's base.
 */
const CUSTOM_PALETTE: DeviceValueKind<CustomPalette | null> = {
  decode: (stored) => {
    const palette = parsePalette((stored as { palette?: unknown } | null)?.palette ?? stored);
    return palette === null ? null : { ...palette, title: {} };
  },
  // Never given none, the fallback, which is kept as no key.
  encode: (palette) => ({
    url: palette!.url,
    basedOn: palette!.basedOn,
    light: paintedColors(palette!, "light"),
    dark: paintedColors(palette!, "dark"),
  }),
  fallback: null,
  maxCharacters: MAX_CUSTOM_PALETTE_CHARACTERS,
};

/**
 * The ids of the highlights of new versions this browser has shown, or
 * spared a first visit: none when none are kept, or something else is,
 * and each visit is then a first one, which shows nothing.
 */
const SEEN_HIGHLIGHTS: DeviceValueKind<string[] | null> = {
  decode: (stored) =>
    Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : null,
  fallback: null,
};

/**
 * The choices the use cases keep on this device, since they are needed
 * before any pod is reached: the language, and how the app is shown on
 * the sign-in screens and at the first paint. An instance's preferences,
 * once it has them, keep how the app is shown too and win. Best effort,
 * as every value the store keeps is: a choice forgotten is its fallback
 * (the browser's language and theme, the standard colors, the browser's
 * own text size).
 */
export interface DeviceChoices {
  languagePreference: DeviceValue<Locale | null>;
  themePreference: DeviceValue<ThemeChoice>;
  palettePreference: DeviceValue<Palette>;
  /** A copy of the user's own palette being shown; none when a built-in one is. */
  customPalettePreference: DeviceValue<CustomPalette | null>;
  textSizePreference: DeviceValue<TextSize>;
  /** The highlights of new versions this browser has shown. */
  seenHighlights: DeviceValue<string[] | null>;
}

/** The choices kept in `store`. */
export function deviceChoices(store: DeviceStore): DeviceChoices {
  return {
    languagePreference: store.value(LANGUAGE_KEY, LANGUAGE),
    themePreference: store.value(THEME_KEY, settingValue(THEME_SETTING)),
    palettePreference: store.value(PALETTE_KEY, settingValue(PALETTE_SETTING)),
    customPalettePreference: store.value(CUSTOM_PALETTE_KEY, CUSTOM_PALETTE),
    textSizePreference: store.value(TEXT_SIZE_KEY, settingValue(TEXT_SIZE_SETTING)),
    seenHighlights: store.value(SEEN_HIGHLIGHTS_KEY, SEEN_HIGHLIGHTS),
  };
}
