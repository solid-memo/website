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

  it("keeps a name with a line break inside it whole", () => {
    expect(parseAuthor("Anton\nWiklund <anton@example.com>")).toEqual({
      name: "Anton\nWiklund <anton@example.com>",
    });
    expect(parseAuthor("Anton\n<anton@example.com>")).toEqual({
      name: "Anton",
      email: "anton@example.com",
    });
  });

  it("reads every short literal as the earlier pattern did", () => {
    // The pattern parseAuthor used before, fine on literals this short.
    const earlier = /^\s*(.*?)\s*<([^\s<>@]+@[^\s<>@]+)>\s*$/;
    const expected = (literal: string) => {
      const match = literal.match(earlier);
      if (match === null) return { name: literal.trim() };
      const [, name, email] = match;
      return { name: name === "" ? email : name, email };
    };
    const alphabet = [" ", "\n", "a", "<", ">", "@"];
    let literals = [""];
    for (let length = 1; length <= 6; length++) {
      literals = literals.flatMap((literal) => alphabet.map((character) => literal + character));
      for (const literal of literals) {
        expect(parseAuthor(literal), JSON.stringify(literal)).toEqual(expected(literal));
      }
    }
  });

  it.each([`${" ".repeat(10_000)}x`, `${" ".repeat(10_000)}<${"a".repeat(10_000)}@>`])(
    "reads a long run of whitespace in one pass (%#)",
    (literal) => {
      // The earlier pattern took time cubic in the leading whitespace, far
      // past this budget on these; one pass takes a tiny part of it.
      const started = performance.now();
      expect(parseAuthor(literal)).toEqual({ name: literal.trim() });
      expect(performance.now() - started).toBeLessThan(1000);
    },
  );
});
