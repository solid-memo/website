// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { CustomPalette } from "./customPalette";
import { colorSetToRecord, paletteFromRecord, paletteToRecord } from "./paletteRecord";

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const URL = "https://pod.example/solid-memo/main/palettes.ttl#palette-reading";

const READING: CustomPalette = {
  url: URL,
  title: { en: "Reading" },
  basedOn: "parchment",
  light: { "--bg": "#f4ecd8", "--grade-5": "#2f8a4a" },
  dark: { "--text": "#ffffff" },
};

describe("palette records", () => {
  it("round-trip the name, the base and each theme's colors", () => {
    const record = paletteToRecord(READING, `${URL}-light`, `${URL}-dark`);
    expect(record).toEqual({
      title: { en: "Reading" },
      basedOn: `${SM}parchmentPalette`,
      lightColors: `${URL}-light`,
      darkColors: `${URL}-dark`,
    });
    const light = colorSetToRecord(READING.light);
    expect(light).toEqual({ backgroundColor: "#f4ecd8", grade5Color: "#2f8a4a" });
    expect(paletteFromRecord(URL, record, light, colorSetToRecord(READING.dark))).toEqual(READING);
  });

  it("read a base this version does not know as Standard, a missing color set as no colors, and only #rrggbb", () => {
    expect(
      paletteFromRecord(
        URL,
        {
          title: { en: "Later" },
          basedOn: `${SM}sepiaPalette`,
          lightColors: `${URL}-light`,
          darkColors: `${URL}-dark`,
        },
        { textColor: "#ABCDEF", linkColor: "var(--text)" },
        null,
      ),
    ).toEqual({
      url: URL,
      title: { en: "Later" },
      basedOn: "standard",
      light: { "--text": "#abcdef" },
      dark: {},
    });
  });
});
