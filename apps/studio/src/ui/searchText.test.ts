// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { searchedText } from "./searchText";

describe("searchedText", () => {
  it("folds case and accents", () => {
    expect(searchedText("Ärlig ÉTÉ")).toBe("arlig ete");
  });

  it("keeps only the first 200 characters of a long text", () => {
    const text = `${"é".repeat(199)}ab${"é".repeat(16_000)}`;
    expect(searchedText(text)).toBe(`${"e".repeat(199)}a`);
  });
});
