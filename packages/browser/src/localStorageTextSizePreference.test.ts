// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createLocalStorageTextSizePreference } from "./localStorageTextSizePreference";

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

describe("createLocalStorageTextSizePreference", () => {
  it("keeps the chosen size", () => {
    const storage = memoryStorage();
    const preference = createLocalStorageTextSizePreference(() => storage);
    expect(preference.chosen()).toBe("default");
    preference.choose("larger");
    expect(preference.chosen()).toBe("larger");
    expect(storage.getItem("solid-memo:textSize")).toBe("larger");
  });

  it("keeps the default size as no choice at all", () => {
    const storage = memoryStorage();
    const preference = createLocalStorageTextSizePreference(() => storage);
    preference.choose("largest");
    preference.choose("default");
    expect(storage.getItem("solid-memo:textSize")).toBeNull();
    expect(preference.chosen()).toBe("default");
  });

  it("forgets a size the app does not have", () => {
    const storage = memoryStorage();
    storage.setItem("solid-memo:textSize", "huge");
    expect(createLocalStorageTextSizePreference(() => storage).chosen()).toBe("default");
  });

  it("does without storage", () => {
    const preference = createLocalStorageTextSizePreference(() => {
      throw new Error("blocked");
    });
    expect(() => preference.choose("large")).not.toThrow();
    expect(preference.chosen()).toBe("default");
  });

  it("uses the browser's localStorage by default", () => {
    createLocalStorageTextSizePreference().choose("large");
    expect(globalThis.localStorage.getItem("solid-memo:textSize")).toBe("large");
  });
});
