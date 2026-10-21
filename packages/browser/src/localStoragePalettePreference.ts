// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { PalettePreference } from "@solid-memo/application/ports";
import { DEFAULT_PALETTE, isPalette } from "@solid-memo/domain/palette";

/** Also read by the script in index.html that sets the palette before the first paint. */
export const KEY = "solid-memo:palette";

/**
 * The PalettePreference in the browser's localStorage. Browser storage
 * may be missing or refuse (a private window, blocked site data), so
 * every access is guarded: without it the app is in its standard
 * colors. Standard is kept as no choice at all, which is how the script
 * in index.html reads it.
 */
export function createLocalStoragePalettePreference(
  storage: () => Storage = () => globalThis.localStorage,
): PalettePreference {
  return {
    chosen() {
      try {
        const stored = storage().getItem(KEY);
        return stored !== null && isPalette(stored) ? stored : DEFAULT_PALETTE;
      } catch {
        return DEFAULT_PALETTE;
      }
    },
    choose(palette) {
      try {
        if (palette === DEFAULT_PALETTE) storage().removeItem(KEY);
        else storage().setItem(KEY, palette);
      } catch {
        // Without storage the choice lasts until the page is left.
      }
    },
  };
}
