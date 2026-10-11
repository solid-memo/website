// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ThemePreference } from "@solid-memo/application/ports";
import { isThemeChoice } from "@solid-memo/domain/theme";

/** Also read by the script in index.html that sets the theme before the first paint. */
const KEY = "solid-memo:theme";

/**
 * The ThemePreference in the browser's localStorage. Browser storage may
 * be missing or refuse (a private window, blocked site data), so every
 * access is guarded: without it the app looks as the browser prefers.
 * "system" is kept as no choice at all, which is how the script in
 * index.html reads it.
 */
export function createLocalStorageThemePreference(
  storage: () => Storage = () => globalThis.localStorage,
): ThemePreference {
  return {
    chosen() {
      try {
        const stored = storage().getItem(KEY);
        return stored !== null && isThemeChoice(stored) ? stored : "system";
      } catch {
        return "system";
      }
    },
    choose(choice) {
      try {
        if (choice === "system") storage().removeItem(KEY);
        else storage().setItem(KEY, choice);
      } catch {
        // Without storage the choice lasts until the page is left.
      }
    },
  };
}
