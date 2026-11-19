// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { derivedOnce, derivedOnceOf } from "./frozen";

describe("derivedOnce", () => {
  it("works out what is derived of a frozen array once, for every caller", () => {
    const kept = new WeakMap<readonly number[], number>();
    const derive = vi.fn((all: readonly number[]) => all.length);
    const frozen = Object.freeze([1, 2, 3]);
    expect(derivedOnce(kept, frozen, derive)).toBe(3);
    expect(derivedOnce(kept, frozen, derive)).toBe(3);
    expect(derive).toHaveBeenCalledTimes(1);
    // Another array, even of the same values, is worked out on its own.
    expect(derivedOnce(kept, Object.freeze([1, 2, 3]), derive)).toBe(3);
    expect(derive).toHaveBeenCalledTimes(2);
  });

  it("keeps a falsy result too", () => {
    const derive = vi.fn(() => false);
    const kept = new WeakMap<readonly number[], boolean>();
    const frozen = Object.freeze([]);
    expect(derivedOnce(kept, frozen, derive)).toBe(false);
    expect(derivedOnce(kept, frozen, derive)).toBe(false);
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it("works out what is derived of an array that may still change each time", () => {
    const kept = new WeakMap<readonly number[], number>();
    const derive = (all: readonly number[]) => all.length;
    const open = [1, 2];
    expect(derivedOnce(kept, open, derive)).toBe(2);
    open.push(3);
    expect(derivedOnce(kept, open, derive)).toBe(3);
  });
});

describe("derivedOnceOf", () => {
  it("works out what is derived of two frozen values once per key", () => {
    const kept = new WeakMap<readonly number[], WeakMap<object, Map<string, number>>>();
    const first = Object.freeze([1, 2]);
    const second = Object.freeze({});
    const derive = vi.fn(() => 7);
    expect(derivedOnceOf(kept, first, second, "a", derive)).toBe(7);
    expect(derivedOnceOf(kept, first, second, "a", derive)).toBe(7);
    expect(derive).toHaveBeenCalledTimes(1);
    expect(derivedOnceOf(kept, first, second, "b", derive)).toBe(7);
    expect(derivedOnceOf(kept, first, Object.freeze({}), "a", derive)).toBe(7);
    expect(derive).toHaveBeenCalledTimes(3);
  });

  it("works it out each time when either value may still change", () => {
    const kept = new WeakMap<readonly number[], WeakMap<object, Map<string, number>>>();
    const derive = vi.fn(() => 7);
    const frozen = Object.freeze([1]);
    derivedOnceOf(kept, frozen, {}, "a", derive);
    derivedOnceOf(kept, [1], Object.freeze({}), "a", derive);
    const open = {};
    derivedOnceOf(kept, frozen, open, "a", derive);
    derivedOnceOf(kept, frozen, open, "a", derive);
    expect(derive).toHaveBeenCalledTimes(4);
  });
});

describe("a value kept", () => {
  it("is looked up before it is asked whether it is frozen, which may take a pass over its keys", () => {
    const kept = new WeakMap<object, number>();
    const pairs = new WeakMap<object, WeakMap<object, Map<string, number>>>();
    const value = Object.freeze({ a: 1 });
    const other = Object.freeze({});
    derivedOnce(kept, value, () => 1);
    derivedOnceOf(pairs, value, other, "k", () => 2);
    const isFrozen = vi.spyOn(Object, "isFrozen");
    try {
      expect(derivedOnce(kept, value, () => 3)).toBe(1);
      expect(derivedOnceOf(pairs, value, other, "k", () => 4)).toBe(2);
      expect(isFrozen).not.toHaveBeenCalled();
    } finally {
      isFrozen.mockRestore();
    }
  });
});
