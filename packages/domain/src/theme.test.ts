// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { isThemeChoice, resolveTheme } from "./theme";

describe("isThemeChoice", () => {
  it("names a choice", () => {
    expect(isThemeChoice("system")).toBe(true);
    expect(isThemeChoice("light")).toBe(true);
    expect(isThemeChoice("dark")).toBe(true);
  });

  it("is false for anything else", () => {
    expect(isThemeChoice("sepia")).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("shows the chosen theme above all", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  it("shows the browser's for the system choice", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
  });
});
