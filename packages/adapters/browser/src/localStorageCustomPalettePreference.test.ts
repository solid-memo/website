// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { CustomPalette } from "@solid-memo/domain/customPalette";
import { createLocalStorageCustomPalettePreference } from "./localStorageCustomPalettePreference";
import { memoryStorage } from "./testing/memoryStorage";

const READING: CustomPalette = {
  url: "https://pod.example/solid-memo/main/palettes.ttl#palette-reading",
  title: { en: "Reading" },
  basedOn: "parchment",
  light: { "--text": "#2b2118" },
  dark: {},
};

describe("createLocalStorageCustomPalettePreference", () => {
  it("keeps the palette's address and base, and the colors to paint in each theme for the first paint", () => {
    const storage = memoryStorage();
    const preference = createLocalStorageCustomPalettePreference(() => storage);
    expect(preference.chosen()).toBeNull();
    preference.choose(READING);
    expect(preference.chosen()).toEqual({ ...READING, title: {} });
    const kept = JSON.parse(storage.getItem("solid-memo:palette-colors")!);
    expect(Object.keys(kept)).toEqual(["url", "basedOn", "light", "dark"]);
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

  it("keeps no name, however large the palette's name is", () => {
    const storage = memoryStorage();
    const preference = createLocalStorageCustomPalettePreference(() => storage);
    const title = Object.fromEntries(
      Array.from({ length: 300 }, (_, at) => [`x-${at}`, "A".repeat(16_000)]),
    );
    preference.choose({ ...READING, title });
    const kept = storage.getItem("solid-memo:palette-colors")!;
    expect(kept.length).toBeLessThan(2000);
    expect(kept).not.toContain("AAAA");
    expect(preference.chosen()).toEqual({ ...READING, title: {} });
  });

  it("keeps no value too large to read back", () => {
    const storage = memoryStorage();
    const preference = createLocalStorageCustomPalettePreference(() => storage);
    preference.choose(READING);
    preference.choose({ ...READING, url: `https://pod.example/${"a".repeat(9000)}#p` });
    expect(storage.getItem("solid-memo:palette-colors")).toBeNull();
  });

  it("reads a palette an earlier version kept whole, without its name", () => {
    const storage = memoryStorage();
    storage.setItem("solid-memo:palette-colors", JSON.stringify({ palette: READING }));
    expect(createLocalStorageCustomPalettePreference(() => storage).chosen()).toEqual({
      ...READING,
      title: {},
    });
  });

  it("drops a kept value above its size, and reads it no more", () => {
    const storage = memoryStorage();
    storage.setItem(
      "solid-memo:palette-colors",
      JSON.stringify({ palette: { ...READING, title: { en: "A".repeat(10_000) } } }),
    );
    expect(createLocalStorageCustomPalettePreference(() => storage).chosen()).toBeNull();
    expect(storage.getItem("solid-memo:palette-colors")).toBeNull();
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
      JSON.stringify({ ...READING, light: { "--text": "red; x: url(y)" } }),
    );
    expect(createLocalStorageCustomPalettePreference(() => storage).chosen()).toEqual({
      ...READING,
      title: {},
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
