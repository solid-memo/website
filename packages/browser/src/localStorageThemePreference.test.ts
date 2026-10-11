// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createLocalStorageThemePreference } from "./localStorageThemePreference";

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

describe("createLocalStorageThemePreference", () => {
  it("keeps the chosen theme", () => {
    const storage = memoryStorage();
    const preference = createLocalStorageThemePreference(() => storage);
    expect(preference.chosen()).toBe("system");
    preference.choose("dark");
    expect(preference.chosen()).toBe("dark");
    expect(storage.getItem("solid-memo:theme")).toBe("dark");
  });

  it("keeps the browser's theme as no choice at all", () => {
    const storage = memoryStorage();
    const preference = createLocalStorageThemePreference(() => storage);
    preference.choose("dark");
    preference.choose("system");
    expect(storage.getItem("solid-memo:theme")).toBeNull();
    expect(preference.chosen()).toBe("system");
  });

  it("forgets a theme the app does not have", () => {
    const storage = memoryStorage();
    storage.setItem("solid-memo:theme", "sepia");
    expect(createLocalStorageThemePreference(() => storage).chosen()).toBe("system");
  });

  it("does without storage", () => {
    const preference = createLocalStorageThemePreference(() => {
      throw new Error("blocked");
    });
    expect(() => preference.choose("dark")).not.toThrow();
    expect(preference.chosen()).toBe("system");
  });

  it("uses the browser's localStorage by default", () => {
    createLocalStorageThemePreference().choose("light");
    expect(globalThis.localStorage.getItem("solid-memo:theme")).toBe("light");
  });
});
