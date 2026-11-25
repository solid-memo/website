// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { PALETTE_SETTING } from "@solid-memo/domain/palette";
import type { SettingKind } from "@solid-memo/domain/setting";
import { TEXT_SIZE_SETTING } from "@solid-memo/domain/textSize";
import { THEME_SETTING } from "@solid-memo/domain/theme";
import {
  createLocalStorageSetting,
  PALETTE_KEY,
  TEXT_SIZE_KEY,
  THEME_KEY,
} from "./localStorageSetting";
import { memoryStorage } from "./testing/memoryStorage";

/** Each setting kept, under its key, with a value of its own other than its fallback. */
const SETTINGS: { name: string; key: string; kind: SettingKind<string>; chosen: string }[] = [
  { name: "theme", key: THEME_KEY, kind: THEME_SETTING, chosen: "dark" },
  { name: "palette", key: PALETTE_KEY, kind: PALETTE_SETTING, chosen: "high-contrast" },
  { name: "text size", key: TEXT_SIZE_KEY, kind: TEXT_SIZE_SETTING, chosen: "larger" },
];

it("keeps each setting under the key index.html reads", () => {
  expect([THEME_KEY, PALETTE_KEY, TEXT_SIZE_KEY]).toEqual([
    "solid-memo:theme",
    "solid-memo:palette",
    "solid-memo:textSize",
  ]);
});

describe.each(SETTINGS)("createLocalStorageSetting, the $name", ({ key, kind, chosen }) => {
  it("keeps the chosen value", () => {
    const storage = memoryStorage();
    const setting = createLocalStorageSetting(key, kind, () => storage);
    expect(setting.chosen()).toBe(kind.fallback);
    setting.choose(chosen);
    expect(setting.chosen()).toBe(chosen);
    expect(storage.getItem(key)).toBe(chosen);
  });

  it("keeps the fallback as no choice at all", () => {
    const storage = memoryStorage();
    const setting = createLocalStorageSetting(key, kind, () => storage);
    setting.choose(chosen);
    setting.choose(kind.fallback);
    expect(storage.getItem(key)).toBeNull();
    expect(setting.chosen()).toBe(kind.fallback);
  });

  it("forgets a value the app does not have", () => {
    const storage = memoryStorage();
    storage.setItem(key, "sepia");
    expect(createLocalStorageSetting(key, kind, () => storage).chosen()).toBe(kind.fallback);
  });

  it("does without storage", () => {
    const setting = createLocalStorageSetting(key, kind, () => {
      throw new Error("blocked");
    });
    expect(() => setting.choose(chosen)).not.toThrow();
    expect(setting.chosen()).toBe(kind.fallback);
  });

  it("uses the browser's localStorage by default", () => {
    createLocalStorageSetting(key, kind).choose(chosen);
    expect(globalThis.localStorage.getItem(key)).toBe(chosen);
  });
});
