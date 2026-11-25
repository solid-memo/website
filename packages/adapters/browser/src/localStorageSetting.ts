// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { SettingKind } from "@solid-memo/domain/setting";

/*
 * The keys of the settings kept as they are, each also read by the
 * script in index.html that sets the theme, the palette and the text
 * size before the first paint.
 */
/** The theme (THEME_SETTING). */
export const THEME_KEY = "solid-memo:theme";
/** The palette (PALETTE_SETTING). */
export const PALETTE_KEY = "solid-memo:palette";
/** The text size (TEXT_SIZE_SETTING). */
export const TEXT_SIZE_KEY = "solid-memo:textSize";

/**
 * A setting (SettingKind) in the browser's localStorage, under `key`.
 * Browser storage may be missing or refuse (a private window, blocked
 * site data), so every access is guarded: without it the setting is
 * its fallback. The fallback is kept as no choice at all, which is how
 * the script in index.html reads it, and a value that is not one of the
 * setting's is read as the fallback.
 */
export function createLocalStorageSetting<T extends string>(
  key: string,
  { isValue, fallback }: SettingKind<T>,
  storage: () => Storage = () => globalThis.localStorage,
): { chosen(): T; choose(value: T): void } {
  return {
    chosen() {
      try {
        const stored = storage().getItem(key);
        return stored !== null && isValue(stored) ? stored : fallback;
      } catch {
        return fallback;
      }
    },
    choose(value) {
      try {
        if (value === fallback) storage().removeItem(key);
        else storage().setItem(key, value);
      } catch {
        // Without storage the choice lasts until the page is left.
      }
    },
  };
}
