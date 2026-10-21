// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  builtInColors,
  CHECKED_PAIRS,
  isReadable,
  checkPalette,
  DERIVED_ROLES,
  effectiveColors,
  isHexColor,
  paintedColors,
  PAINTED_ROLES,
  PALETTE_ROLES,
  paletteVerdict,
  parsePalette,
  type CustomPalette,
} from "./customPalette";
import { PALETTES } from "./palette";

const READING: CustomPalette = {
  url: "https://pod.example/solid-memo/main/palettes.ttl#palette-reading",
  title: { en: "Reading" },
  basedOn: "parchment",
  light: {},
  dark: {},
};

describe("the roles a palette of one's own sets", () => {
  it("are opaque colors of every built-in palette, and paint the roles mixed from them too", () => {
    expect(PALETTE_ROLES).toHaveLength(19);
    expect(PAINTED_ROLES).toEqual([...PALETTE_ROLES, ...DERIVED_ROLES]);
    for (const palette of PALETTES)
      for (const theme of ["light", "dark"] as const) {
        const colors = builtInColors(palette, theme);
        expect(Object.keys(colors)).toEqual(PAINTED_ROLES);
        expect(Object.values(colors).every(isHexColor), `${palette} ${theme}`).toBe(true);
      }
  });

  it("are written #rrggbb, nothing else", () => {
    expect(isHexColor("#A0b1C2")).toBe(true);
    for (const value of ["#fff", "#ffffff80", "red", "var(--bg)", " #ffffff", 0xffffff, null])
      expect(isHexColor(value), String(value)).toBe(false);
  });
});

describe("parsePalette", () => {
  it("keeps a palette as it is when it keeps to the rules, its colors in lower case", () => {
    expect(parsePalette({ ...READING, light: { "--text": "#2B2118" } })).toEqual({
      ...READING,
      light: { "--text": "#2b2118" },
    });
  });

  it("leaves out every color not of a listed role or not #rrggbb, and every name not text", () => {
    expect(
      parsePalette({
        ...READING,
        title: { en: "Reading", sv: 42, "x y": "no", "": "Kept" },
        light: {
          "--text": "red; background: url(https://evil.example/x)",
          "--bg": "var(--text)",
          "--masthead-bg": "#000000",
          "background-image": "#000000",
          "--link": "#123456",
        },
        dark: "#ffffff",
      }),
    ).toEqual({
      ...READING,
      title: { en: "Reading", "": "Kept" },
      light: { "--link": "#123456" },
      dark: {},
    });
  });

  it("bases one on Standard when its base is no palette this version has", () => {
    expect(parsePalette({ ...READING, basedOn: "sepia" })?.basedOn).toBe("standard");
    expect(parsePalette({ ...READING, basedOn: undefined, title: null })).toEqual({
      ...READING,
      basedOn: "standard",
      title: {},
    });
  });

  it("is null for anything without an address", () => {
    for (const value of [null, "palette", 7, {}, { url: "" }, { url: 3 }])
      expect(parsePalette(value), JSON.stringify(value)).toBeNull();
  });

  it("does not take a color from the object's prototype", () => {
    const colors = Object.create({ "--text": "#000000" }) as object;
    expect(parsePalette({ ...READING, light: colors })?.light).toEqual({});
  });
});

describe("the colors a palette paints", () => {
  it("are none while it sets none, so it looks as its base", () => {
    expect(paintedColors(READING, "light")).toEqual({});
    expect(effectiveColors(READING, "dark")).toEqual(builtInColors("parchment", "dark"));
  });

  it("are those it sets, and the roles mixed from a color it changes", () => {
    const painted = paintedColors({ ...READING, light: { "--danger": "#ff0000" } }, "light");
    expect(painted).toEqual({
      "--danger": "#ff0000",
      // 10% and 30% of the danger color over Parchment's surface, #fbf3db.
      "--danger-soft": "#fbdbc5",
      "--danger-border": "#fcaa99",
    });
  });

  it("mix nothing from a color set to its base's own", () => {
    const base = builtInColors("parchment", "light")["--surface"]!;
    expect(paintedColors({ ...READING, light: { "--surface": base } }, "light")).toEqual({
      "--surface": base,
    });
  });

  it("hold the colors to the rules again, whatever the palette was given", () => {
    const given = { ...READING, light: { "--text": "url(x)" } } as CustomPalette;
    expect(paintedColors(given, "light")).toEqual({});
  });
});

describe("checkPalette", () => {
  it("passes every built-in palette in both themes, at its own targets", () => {
    for (const palette of PALETTES) {
      const checks = checkPalette({ ...READING, basedOn: palette });
      expect(checks).toHaveLength(CHECKED_PAIRS.length * 2);
      expect(
        checks.filter((check) => check.verdict !== "pass"),
        palette,
      ).toEqual([]);
      expect(paletteVerdict(checks)).toBe("pass");
    }
  });

  it("holds text to 4.5:1 and edges to 3:1, or a palette based on High contrast to 7:1 and 4.5:1", () => {
    const targets = (palette: CustomPalette) =>
      new Set(
        checkPalette(palette).map((check) => `${check.edge ? "edge" : "text"} ${check.target}`),
      );
    expect(targets(READING)).toEqual(new Set(["text 4.5", "edge 3"]));
    expect(targets({ ...READING, basedOn: "high-contrast" })).toEqual(
      new Set(["text 7", "edge 4.5"]),
    );
  });

  it("finds a pair below its target low, and the text below 3:1 on a surface refused", () => {
    const faint = { ...READING, light: { "--text-muted": "#9a9080" } };
    const low = checkPalette(faint).filter((check) => check.verdict !== "pass");
    expect(low.length).toBeGreaterThan(0);
    expect(low.every((check) => check.verdict === "low" && check.front === "--text-muted")).toBe(
      true,
    );
    expect(paletteVerdict(low)).toBe("low");

    const unreadable = checkPalette({ ...READING, dark: { "--text": "#26221b" } });
    const refused = unreadable.filter((check) => check.verdict === "refused");
    expect(refused.map(({ theme, front, back }) => `${theme} ${front} ${back}`)).toEqual([
      "dark --text --bg",
      "dark --text --surface",
      "dark --text --surface-sunken",
      "dark --text --surface-hover",
    ]);
    expect(paletteVerdict(unreadable)).toBe("refused");
    // The text on an answer button's tint is held to its target, never refused.
    expect(unreadable.find((check) => check.tint && check.theme === "dark")?.verdict).toBe("low");
  });

  it("finds low the muted text on the course card and on an answer button's tints", () => {
    const muted = checkPalette({
      basedOn: "standard",
      light: { "--text-muted": "#626a76", "--grade-0": "#a01808", "--primary": "#1a3060" },
      dark: {},
    }).filter((check) => check.verdict !== "pass");
    const pairs = muted.map(({ front, back, tint }) => `${front} ${back} ${tint ?? ""}`);
    expect(pairs).toEqual(
      expect.arrayContaining([
        "--text-muted --primary-soft ",
        "--text-muted --grade-0 12",
        "--text-muted --grade-0 24",
      ]),
    );
    expect(muted.every((check) => check.front === "--text-muted" && check.theme === "light")).toBe(
      true,
    );
    expect(paletteVerdict(muted)).toBe("low");
  });

  it("finds a palette readable unless its text on a surface is refused", () => {
    expect(isReadable(READING)).toBe(true);
    expect(isReadable({ ...READING, light: { "--text-muted": "#9a9080" } })).toBe(true);
    expect(isReadable({ ...READING, dark: { "--text": "#26221b" } })).toBe(false);
  });

  it("measures a chart's steps as its base mixes them from the colors the palette sets", () => {
    // A lighter green still holds an edge on the surfaces, but its faintest step does not.
    const light = checkPalette({
      basedOn: "standard",
      light: { "--primary": "#3a8a4f" },
      dark: {},
    });
    const passing = (front: string) =>
      light
        .filter((check) => check.theme === "light" && check.front === front)
        .map((check) => check.verdict);
    expect(passing("--primary")).toEqual(["pass", "pass"]);
    expect(passing("--series-1")).toContain("low");
    expect(passing("--series-4")).toEqual(["pass", "pass"]);
  });

  it("measures an answer button's text on its grade's tint over the surface, and the focus ring as an edge", () => {
    const checks = checkPalette({ ...READING, light: { "--grade-0": "#000000" } });
    const tint = checks.find(
      (check) => check.theme === "light" && check.tint && check.back === "--grade-0",
    )!;
    // Black at 24% over Parchment's surface: darker, so the dark text has less contrast on it.
    const plain = checkPalette(READING).find(
      (check) => check.theme === "light" && check.tint && check.back === "--grade-0",
    )!;
    expect(tint.ratio).toBeLessThan(plain.ratio);
    expect(
      checks.some((check) => check.front === "--primary" && check.edge && check.back === "--bg"),
    ).toBe(true);
  });
});
