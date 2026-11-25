// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { CustomPalette } from "@solid-memo/domain/customPalette";
import { storyInstance } from "../storyData";

/**
 * Data the stories of the preferences share (src/ui/Preferences*.stories.tsx,
 * PaletteEditor*.stories.tsx, DeckPreferences*): palettes of the user's
 * own. Nothing here is read from or written to a pod.
 */

/** A warm palette for reading, named in two languages, based on Parchment. */
export const readingPalette: CustomPalette = {
  url: `${storyInstance.url}palettes.ttl#palette-reading`,
  title: { en: "Reading", sv: "Läsning" },
  basedOn: "parchment",
  light: { "--bg": "#f4ecd8", "--primary": "#8a4b14" },
  dark: {},
};

/** A palette whose muted text is too faint in the dark theme: a pair below what it needs. */
export const faintPalette: CustomPalette = {
  url: `${storyInstance.url}palettes.ttl#palette-night`,
  title: { en: "Night shift with very soft gray notes for late study sessions" },
  basedOn: "standard",
  light: {},
  dark: { "--text-muted": "#404040" },
};
