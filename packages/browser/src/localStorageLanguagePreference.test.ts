// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createLocalStorageLanguagePreference } from "./localStorageLanguagePreference";

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

describe("createLocalStorageLanguagePreference", () => {
  it("keeps the chosen language", () => {
    const storage = memoryStorage();
    const preference = createLocalStorageLanguagePreference(() => storage);
    expect(preference.chosen()).toBeNull();
    preference.choose("sv");
    expect(preference.chosen()).toBe("sv");
    expect(storage.getItem("solid-memo:language")).toBe("sv");
  });

  it("forgets a language the app does not speak", () => {
    const storage = memoryStorage();
    storage.setItem("solid-memo:language", "klingon");
    expect(createLocalStorageLanguagePreference(() => storage).chosen()).toBeNull();
  });

  it("does without storage", () => {
    const preference = createLocalStorageLanguagePreference(() => {
      throw new Error("blocked");
    });
    expect(() => preference.choose("sv")).not.toThrow();
    expect(preference.chosen()).toBeNull();
  });

  it("uses the browser's localStorage by default", () => {
    createLocalStorageLanguagePreference().choose("en");
    expect(globalThis.localStorage.getItem("solid-memo:language")).toBe("en");
  });
});
