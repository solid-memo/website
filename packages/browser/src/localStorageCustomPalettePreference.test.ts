// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { CustomPalette } from "@solid-memo/domain/customPalette";
import { createLocalStorageCustomPalettePreference } from "./localStorageCustomPalettePreference";

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

const READING: CustomPalette = {
  url: "https://pod.example/solid-memo/main/palettes.ttl#palette-reading",
  title: { en: "Reading" },
  basedOn: "parchment",
  light: { "--text": "#2b2118" },
  dark: {},
};

describe("createLocalStorageCustomPalettePreference", () => {
  it("keeps the palette, and the colors to paint in each theme for the first paint", () => {
    const storage = memoryStorage();
    const preference = createLocalStorageCustomPalettePreference(() => storage);
    expect(preference.chosen()).toBeNull();
    preference.choose(READING);
    expect(preference.chosen()).toEqual(READING);
    const kept = JSON.parse(storage.getItem("solid-memo:palette-colors")!);
    // The text, and the roles mixed from it: a hovered surface's, a strong border's, a pressed button's, a link's hover.
    expect(Object.keys(kept.light)).toEqual([
      "--text",
      "--surface-hover",
      "--border-strong",
      "--primary-hover",
      "--link-hover-bg",
    ]);
    expect(kept.dark).toEqual({});
  });

  it("keeps none as no key at all", () => {
    const storage = memoryStorage();
    const preference = createLocalStorageCustomPalettePreference(() => storage);
    preference.choose(READING);
    preference.choose(null);
    expect(storage.getItem("solid-memo:palette-colors")).toBeNull();
  });

  it("holds what it reads back to the palette's rules", () => {
    const storage = memoryStorage();
    storage.setItem(
      "solid-memo:palette-colors",
      JSON.stringify({ palette: { ...READING, light: { "--text": "red; x: url(y)" } } }),
    );
    expect(createLocalStorageCustomPalettePreference(() => storage).chosen()).toEqual({
      ...READING,
      light: {},
    });
    for (const text of ["not json", "{}", "null"]) {
      storage.setItem("solid-memo:palette-colors", text);
      expect(createLocalStorageCustomPalettePreference(() => storage).chosen(), text).toBeNull();
    }
  });

  it("does without storage", () => {
    const preference = createLocalStorageCustomPalettePreference(() => {
      throw new Error("blocked");
    });
    expect(() => preference.choose(READING)).not.toThrow();
    expect(preference.chosen()).toBeNull();
  });

  it("uses the browser's localStorage by default", () => {
    createLocalStorageCustomPalettePreference().choose(READING);
    expect(globalThis.localStorage.getItem("solid-memo:palette-colors")).not.toBeNull();
  });
});
