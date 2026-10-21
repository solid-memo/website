// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createLocalStoragePalettePreference } from "./localStoragePalettePreference";

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

describe("createLocalStoragePalettePreference", () => {
  it("keeps the chosen palette", () => {
    const storage = memoryStorage();
    const preference = createLocalStoragePalettePreference(() => storage);
    expect(preference.chosen()).toBe("standard");
    preference.choose("high-contrast");
    expect(preference.chosen()).toBe("high-contrast");
    expect(storage.getItem("solid-memo:palette")).toBe("high-contrast");
  });

  it("keeps Standard as no choice at all", () => {
    const storage = memoryStorage();
    const preference = createLocalStoragePalettePreference(() => storage);
    preference.choose("high-contrast");
    preference.choose("standard");
    expect(storage.getItem("solid-memo:palette")).toBeNull();
    expect(preference.chosen()).toBe("standard");
  });

  it("forgets a palette the app does not have", () => {
    const storage = memoryStorage();
    storage.setItem("solid-memo:palette", "sepia");
    expect(createLocalStoragePalettePreference(() => storage).chosen()).toBe("standard");
  });

  it("does without storage", () => {
    const preference = createLocalStoragePalettePreference(() => {
      throw new Error("blocked");
    });
    expect(() => preference.choose("high-contrast")).not.toThrow();
    expect(preference.chosen()).toBe("standard");
  });

  it("uses the browser's localStorage by default", () => {
    createLocalStoragePalettePreference().choose("high-contrast");
    expect(globalThis.localStorage.getItem("solid-memo:palette")).toBe("high-contrast");
  });
});
