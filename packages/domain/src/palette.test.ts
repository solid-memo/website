// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { contrastTargets, DEFAULT_PALETTE, isPalette, PALETTES } from "./palette";

describe("isPalette", () => {
  it("names a palette", () => {
    for (const palette of PALETTES) expect(isPalette(palette)).toBe(true);
    expect(isPalette(DEFAULT_PALETTE)).toBe(true);
  });

  it("is false for anything else", () => {
    expect(isPalette("sepia")).toBe(false);
    expect(isPalette("")).toBe(false);
  });
});

describe("contrastTargets", () => {
  it("asks AA of every palette, and more of High contrast", () => {
    expect(contrastTargets("standard")).toEqual({ text: 4.5, edge: 3 });
    expect(contrastTargets("parchment")).toEqual({ text: 4.5, edge: 3 });
    expect(contrastTargets("high-contrast")).toEqual({ text: 7, edge: 4.5 });
  });
});
