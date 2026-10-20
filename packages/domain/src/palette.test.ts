// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DEFAULT_PALETTE, isPalette, PALETTES } from "./palette";

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
