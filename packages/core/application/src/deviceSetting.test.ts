// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { TEXT_SIZE_SETTING } from "@solid-memo/domain/textSize";
import { unkeptSetting } from "./deviceSetting";

it("keeps no choice: the setting is always its fallback", () => {
  const setting = unkeptSetting(TEXT_SIZE_SETTING);
  setting.choose("largest");
  expect(setting.chosen()).toBe("default");
});
