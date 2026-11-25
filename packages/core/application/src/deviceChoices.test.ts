// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { CustomPalette } from "@solid-memo/domain/customPalette";
import { deviceChoices } from "./deviceChoices";
import type { DeviceStore, DeviceValueKind } from "./ports/device";

const READING: CustomPalette = {
  url: "https://pod.example/solid-memo/main/palettes.ttl#palette-reading",
  title: { en: "Reading" },
  basedOn: "parchment",
  light: { "--text": "#2b2118" },
  dark: {},
};

/**
 * A DeviceStore over a map of texts, kept as the port says a store keeps
 * them: as its text for a kind that keeps it, else as JSON of what the
 * kind encodes, and the fallback as no text at all. With what each kind
 * was given, so a test can see its bound.
 */
function textStore() {
  const texts = new Map<string, string>();
  const kinds = new Map<string, DeviceValueKind<unknown>>();
  const store: DeviceStore = {
    value<T>(key: string, kind: DeviceValueKind<T>) {
      kinds.set(key, kind as DeviceValueKind<unknown>);
      return {
        read() {
          const text = texts.get(key);
          if (text === undefined) return kind.fallback;
          return kind.decode(kind.text === true ? text : JSON.parse(text));
        },
        write(value: T) {
          if (value === kind.fallback) texts.delete(key);
          else
            texts.set(
              key,
              kind.text === true
                ? String(value)
                : JSON.stringify(kind.encode === undefined ? value : kind.encode(value)),
            );
        },
      };
    },
    byInstance: () => {
      throw new Error("No choice is kept by instance.");
    },
  };
  return { store, texts, kinds };
}

describe("deviceChoices", () => {
  it("keeps the language and each setting as its text, under the key index.html reads", () => {
    const { store, texts } = textStore();
    const choices = deviceChoices(store);
    choices.languagePreference.write("sv");
    choices.themePreference.write("dark");
    choices.palettePreference.write("high-contrast");
    choices.textSizePreference.write("larger");
    expect(Object.fromEntries(texts)).toEqual({
      "solid-memo:language": "sv",
      "solid-memo:theme": "dark",
      "solid-memo:palette": "high-contrast",
      "solid-memo:textSize": "larger",
    });
    expect(choices.languagePreference.read()).toBe("sv");
    expect(choices.themePreference.read()).toBe("dark");
    expect(choices.palettePreference.read()).toBe("high-contrast");
    expect(choices.textSizePreference.read()).toBe("larger");
  });

  it("keeps a setting's fallback as no choice at all", () => {
    const { store, texts } = textStore();
    const { themePreference } = deviceChoices(store);
    themePreference.write("dark");
    themePreference.write("system");
    expect(texts.has("solid-memo:theme")).toBe(false);
    expect(themePreference.read()).toBe("system");
  });

  it("reads a language the app does not speak, and a setting's value it does not have, as none", () => {
    const { store, texts } = textStore();
    texts.set("solid-memo:language", "xx");
    texts.set("solid-memo:theme", "sepia");
    texts.set("solid-memo:textSize", "huge");
    const choices = deviceChoices(store);
    expect(choices.languagePreference.read()).toBeNull();
    expect(choices.themePreference.read()).toBe("system");
    expect(choices.textSizePreference.read()).toBe("default");
  });

  it("keeps the ids seen as a JSON list, and reads anything else as none", () => {
    const { store, texts } = textStore();
    const { seenHighlights } = deviceChoices(store);
    seenHighlights.write(["b", "a"]);
    expect(texts.get("solid-memo:seenHighlights")).toBe('["b","a"]');
    expect(seenHighlights.read()).toEqual(["b", "a"]);
    texts.set("solid-memo:seenHighlights", '["a",7]');
    expect(seenHighlights.read()).toEqual(["a"]);
    texts.set("solid-memo:seenHighlights", '{"a":1}');
    expect(seenHighlights.read()).toBeNull();
  });

  it("keeps of a custom palette only what the first paint needs, in fewer characters than any value", () => {
    const { store, texts, kinds } = textStore();
    const { customPalettePreference } = deviceChoices(store);
    customPalettePreference.write({ ...READING, title: { en: "A".repeat(16_000) } });
    const kept = JSON.parse(texts.get("solid-memo:palette-colors")!);
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
    expect(customPalettePreference.read()).toEqual({ ...READING, title: {} });
    expect(kinds.get("solid-memo:palette-colors")?.maxCharacters).toBe(8192);
    customPalettePreference.write(null);
    expect(texts.has("solid-memo:palette-colors")).toBe(false);
  });

  it("reads a palette an earlier version kept whole, without its name", () => {
    const { store, texts } = textStore();
    texts.set("solid-memo:palette-colors", JSON.stringify({ palette: READING }));
    expect(deviceChoices(store).customPalettePreference.read()).toEqual({ ...READING, title: {} });
  });

  it("holds a custom palette read back to the palette's rules", () => {
    const { store, texts } = textStore();
    const { customPalettePreference } = deviceChoices(store);
    texts.set(
      "solid-memo:palette-colors",
      JSON.stringify({ ...READING, light: { "--text": "red; x: url(y)" } }),
    );
    expect(customPalettePreference.read()).toEqual({ ...READING, title: {}, light: {} });
    for (const text of ["{}", "null", "7"]) {
      texts.set("solid-memo:palette-colors", text);
      expect(customPalettePreference.read(), text).toBeNull();
    }
  });
});
