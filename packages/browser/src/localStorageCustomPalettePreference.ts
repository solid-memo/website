// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { CustomPalettePreference } from "@solid-memo/application/ports";
import { paintedColors, parsePalette } from "@solid-memo/domain/customPalette";

/** Also read by the script in index.html that paints the palette's colors before the first paint. */
export const KEY = "solid-memo:palette-colors";

/**
 * The most characters the kept value may have. The colors of every
 * painted role in both themes take a small part of it; the rest is for
 * the palette's address. A value any longer is neither kept nor read.
 */
const MAX_STORED_CHARACTERS = 8192;

/**
 * The CustomPalettePreference in the browser's localStorage, as JSON:
 * only what the first paint needs, the palette's address (`url`), its
 * base (`basedOn`) and the colors to paint in the light theme and in the
 * dark (`light`, `dark`, each by role: paintedColors), which the script
 * in index.html sets on the root before the first paint, each held there
 * again to its role and to `#rrggbb`. Its name is not kept: a screen
 * that shows it reads it from the pod. What is read back is held to the
 * palette's rules again (parsePalette): storage is the user's, but any
 * script of the site's origin may have written it. A value above
 * MAX_STORED_CHARACTERS is dropped, and one kept whole by an earlier
 * version (under `palette`) is read as the palette it holds, without
 * its name. Guarded as the other preferences are: without storage, the
 * first paint is in the palette's base.
 */
export function createLocalStorageCustomPalettePreference(
  storage: () => Storage = () => globalThis.localStorage,
): CustomPalettePreference {
  return {
    chosen() {
      try {
        const stored = storage().getItem(KEY);
        if (stored === null) return null;
        if (stored.length > MAX_STORED_CHARACTERS) {
          storage().removeItem(KEY);
          return null;
        }
        const value = JSON.parse(stored);
        const palette = parsePalette(value?.palette ?? value);
        return palette === null ? null : { ...palette, title: {} };
      } catch {
        return null;
      }
    },
    choose(palette) {
      try {
        const kept =
          palette === null
            ? null
            : JSON.stringify({
                url: palette.url,
                basedOn: palette.basedOn,
                light: paintedColors(palette, "light"),
                dark: paintedColors(palette, "dark"),
              });
        if (kept === null || kept.length > MAX_STORED_CHARACTERS) storage().removeItem(KEY);
        else storage().setItem(KEY, kept);
      } catch {
        // Without storage the colors are painted from the pod's palette once the instance is read.
      }
    },
  };
}
