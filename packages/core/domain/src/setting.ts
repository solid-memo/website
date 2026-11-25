// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A choice of how the app is shown that the device keeps for the first
 * paint (docs/theme.md): the values it may take, and the one it has
 * until the user says otherwise, which the device keeps as no choice at
 * all. The theme (THEME_SETTING), the palette (PALETTE_SETTING) and the
 * text size (TEXT_SIZE_SETTING) are each one.
 */
export interface SettingKind<T extends string> {
  /** Whether a value kept on the device is one of the setting's: any other is read as no choice. */
  readonly isValue: (value: string) => value is T;
  /** The value until the user says otherwise. */
  readonly fallback: T;
}
