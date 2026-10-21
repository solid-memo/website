// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { conceptOfPalette, conceptOfTextSize } from "../../../concepts";
import { DEFAULT_PALETTE } from "../../../palette";
import { DEFAULT_TEXT_SIZE } from "../../../textSize";
import type { MigrationStep } from "../step";

/**
 * Preferences format 6 states the palette and the text size; preferences
 * saved before there was a choice are in the standard colors, with the
 * text at the browser's own size.
 */
export const PREFERENCES_5_TO_6: MigrationStep<"preferences", 5, 6> = {
  shape: "preferences",
  from: 5,
  to: 6,
  up: (data) => ({
    ...data,
    palette: conceptOfPalette(DEFAULT_PALETTE),
    textSize: conceptOfTextSize(DEFAULT_TEXT_SIZE),
  }),
};
