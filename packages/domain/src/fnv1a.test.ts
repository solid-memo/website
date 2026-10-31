// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fnv1a } from "./fnv1a";

describe("fnv1a", () => {
  it("gives the published FNV-1a test vectors", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
  });

  it("is unsigned", () => {
    expect(fnv1a("b")).toBeGreaterThan(0x7fffffff);
  });
});
