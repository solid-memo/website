// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { SettingKind } from "@solid-memo/domain/setting";
import type { DeviceSetting } from "./ports/device";

/**
 * A DeviceSetting kept nowhere: always the setting's fallback, and a
 * choice is dropped. For an app that keeps no choice of how it is
 * shown, such as a Studio trial, whose page is the app's.
 */
export function unkeptSetting<T extends string>({ fallback }: SettingKind<T>): DeviceSetting<T> {
  return { chosen: () => fallback, choose: () => undefined };
}
