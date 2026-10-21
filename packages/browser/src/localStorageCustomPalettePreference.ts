// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { CustomPalettePreference } from "@solid-memo/application/ports";
import { paintedColors, parsePalette } from "@solid-memo/domain/customPalette";

/** Also read by the script in index.html that paints the palette's colors before the first paint. */
export const KEY = "solid-memo:palette-colors";

/**
 * The CustomPalettePreference in the browser's localStorage, as JSON:
 * the palette (`palette`), and the colors to paint in the light theme
 * and in the dark (`light`, `dark`, each by role: paintedColors), which
 * the script in index.html sets on the root before the first paint, each
 * held there again to its role and to `#rrggbb`. What is read back is
 * held to the palette's rules again (parsePalette): storage is the
 * user's, but any script of the site's origin may have written it.
 * Guarded as the other preferences are: without storage, the first paint
 * is in the palette's base.
 */
export function createLocalStorageCustomPalettePreference(
  storage: () => Storage = () => globalThis.localStorage,
): CustomPalettePreference {
  return {
    chosen() {
      try {
        const stored = storage().getItem(KEY);
        return stored === null ? null : parsePalette(JSON.parse(stored).palette);
      } catch {
        return null;
      }
    },
    choose(palette) {
      try {
        if (palette === null) storage().removeItem(KEY);
        else
          storage().setItem(
            KEY,
            JSON.stringify({
              palette,
              light: paintedColors(palette, "light"),
              dark: paintedColors(palette, "dark"),
            }),
          );
      } catch {
        // Without storage the colors are painted from the pod's palette once the instance is read.
      }
    },
  };
}
