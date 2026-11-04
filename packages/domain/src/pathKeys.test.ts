// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { jsonPath, PathMap, pathKeys } from "./pathKeys";
import { growth } from "./testing/growth";

/** As long as a term the app reads may be. */
const BOUND = 16_383;

describe("PathMap", () => {
  it("holds a value by its path, each step a key of its own", () => {
    const map = new PathMap<number>();
    map.set(["a", "b c"], 1).set(["a"], 2).set([], 3);
    expect(map.get(["a", "b c"])).toBe(1);
    expect(map.get(["a b", "c"])).toBeUndefined();
    expect(map.get(["a"])).toBe(2);
    expect(map.get([])).toBe(3);
    expect(map.has(["a", "b"])).toBe(false);
    expect(map.has(["a", "b c", "d"])).toBe(false);
    expect(map.size).toBe(3);
    map.set(["a"], 4);
    expect(map.get(["a"])).toBe(4);
    expect(map.size).toBe(3);
    expect([...map.values()]).toEqual([1, 4, 3]);
  });

  it("tells a path that ends on the way to another from one it holds, an undefined value too", () => {
    const map = new PathMap<undefined>();
    map.set(["a", "b"], undefined);
    expect(map.has(["a"])).toBe(false);
    expect(map.has(["a", "b"])).toBe(true);
  });

  it("finds many paths of long steps, each as long as a term may be, in time linear in them", () => {
    // V8 hashes a string longer than 16,383 characters by its length
    // alone: the steps joined into one key would be compared with every
    // other of its length. Eight times the paths must take less than four
    // times as long as an eighth of them done eight times over (testing.md).
    const step = (i: number) => `${"x".repeat(BOUND - 6)}${String(i).padStart(6, "0")}`;
    const ratio = growth(
      (count) => {
        const paths = Array.from({ length: count }, (_, i) => [step(i), "p", step(i)]);
        return () => {
          const map = new PathMap<number>();
          for (const [i, path] of paths.entries()) map.set(path, i);
          for (const path of paths) map.get(path);
        };
      },
      250,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("pathKeys", () => {
  it("keys the same path the same, and any other path anew", () => {
    const keyOf = pathKeys();
    const first = keyOf(["a", "b c"]);
    expect(keyOf(["a b", "c"])).not.toBe(first);
    expect(keyOf(["a", "b c"])).toBe(first);
    expect(keyOf(["a"])).not.toBe(first);
    expect(new Set([keyOf([]), keyOf([""]), keyOf(["", ""]), first]).size).toBe(4);
    const long = "x".repeat(BOUND);
    expect(keyOf([long, long])).toBe(keyOf([long, long]));
    expect(keyOf([long, long])).not.toBe(keyOf([long, `${long.slice(1)}y`]));
  });
});

describe("jsonPath", () => {
  it("gives values alike the same path, and values that differ paths of their own", () => {
    const values = [
      "a",
      1,
      "1",
      true,
      null,
      [],
      [""],
      ["a", "b"],
      [["a"], "b"],
      {},
      { a: "b" },
      { a: ["b"] },
      { a: "b", c: 1 },
    ];
    const keyOf = pathKeys();
    expect(new Set(values.map((value) => keyOf(jsonPath(value)))).size).toBe(values.length);
    expect(jsonPath({ a: "b", c: undefined })).toEqual(jsonPath({ a: "b" }));
    expect(jsonPath({ a: [1, { b: null }] })).toEqual(jsonPath({ a: [1, { b: null }] }));
  });
});
