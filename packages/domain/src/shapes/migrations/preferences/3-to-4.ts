// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { conceptOfTheme } from "../../../concepts";
import { DEFAULT_THEME_CHOICE } from "../../../theme";
import type { MigrationStep } from "../step";

/**
 * Preferences format 4 states the theme; preferences saved before there
 * was a choice look as the browser prefers.
 */
export const PREFERENCES_3_TO_4: MigrationStep<"preferences", 3, 4> = {
  shape: "preferences",
  from: 3,
  to: 4,
  up: (data) => ({ ...data, theme: conceptOfTheme(DEFAULT_THEME_CHOICE) }),
};
