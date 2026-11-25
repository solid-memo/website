// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DEFAULT_TEXT_SIZE, isTextSize, TEXT_SIZES } from "./textSize";

describe("isTextSize", () => {
  it("names a size", () => {
    for (const size of TEXT_SIZES) expect(isTextSize(size)).toBe(true);
    expect(isTextSize(DEFAULT_TEXT_SIZE)).toBe(true);
  });

  it("is false for anything else", () => {
    expect(isTextSize("huge")).toBe(false);
    expect(isTextSize("")).toBe(false);
  });
});
