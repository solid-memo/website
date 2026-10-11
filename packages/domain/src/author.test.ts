// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { parseAuthor } from "./author";

describe("parseAuthor", () => {
  it("splits a name and a bracketed address", () => {
    expect(parseAuthor("Anton Wiklund <anton@example.com>")).toEqual({
      name: "Anton Wiklund",
      email: "anton@example.com",
    });
  });

  it("tolerates stray whitespace around either part", () => {
    expect(parseAuthor("  Anton Wiklund   <anton@example.com>  ")).toEqual({
      name: "Anton Wiklund",
      email: "anton@example.com",
    });
    expect(parseAuthor("  Anton Wiklund  ")).toEqual({ name: "Anton Wiklund" });
  });

  it("names a bare address after itself", () => {
    expect(parseAuthor("<anton@example.com>")).toEqual({
      name: "anton@example.com",
      email: "anton@example.com",
    });
  });

  it.each([
    "Anton Wiklund",
    "Wikipedia contributors",
    "Anton <not an address>",
    "Anton <anton@example.com> and friends",
    "Anton <@example.com>",
  ])("takes %j as a name alone", (literal) => {
    expect(parseAuthor(literal)).toEqual({ name: literal });
  });
});
