// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { HASHED_CHARACTERS } from "@solid-memo/domain/pathKeys";
import { memoryStorage } from "./testing/memoryStorage";
import {
  createWebStorageDeviceStore,
  KEPT_INSTANCES,
  MAX_INSTANCES_CHARACTERS,
  MAX_VALUE_CHARACTERS,
} from "./webStorageDeviceStore";

/** A list of strings, as a screen would keep one: none of anything else. */
const STRINGS = {
  decode: (stored: unknown): string[] =>
    Array.isArray(stored) ? stored.filter((each): each is string => typeof each === "string") : [],
  fallback: [] as string[],
};

/** A WebID, kept as its text. */
const TEXT = {
  decode: (stored: unknown): string | null =>
    typeof stored === "string" && stored.startsWith("https://") ? stored : null,
  fallback: null,
  text: true,
};

const blocked = () => {
  throw new Error("blocked");
};

const instance = (index: number) => `https://pod.example/i${index}/`;

describe("createWebStorageDeviceStore value", () => {
  it("keeps a value as JSON, and reads it back as its kind reads it", () => {
    const storage = memoryStorage();
    const value = createWebStorageDeviceStore(() => storage).value("k", STRINGS);
    expect(value.read()).toEqual([]);
    value.write(["a", "b"]);
    expect(storage.getItem("k")).toBe('["a","b"]');
    expect(value.read()).toEqual(["a", "b"]);
    storage.setItem("k", '["a",7]');
    expect(value.read()).toEqual(["a"]);
  });

  it("reads what is not JSON as the fallback", () => {
    const storage = memoryStorage();
    storage.setItem("k", "{not json");
    expect(
      createWebStorageDeviceStore(() => storage)
        .value("k", STRINGS)
        .read(),
    ).toEqual([]);
  });

  it("keeps the fallback, or a value written as it, as no value", () => {
    const storage = memoryStorage();
    const value = createWebStorageDeviceStore(() => storage).value("k", STRINGS);
    value.write(["a"]);
    value.write([]);
    expect(storage.getItem("k")).toBeNull();
    value.write(["a"]);
    value.write(STRINGS.fallback);
    expect(storage.getItem("k")).toBeNull();
  });

  it("keeps a text value as its text", () => {
    const storage = memoryStorage();
    const value = createWebStorageDeviceStore(() => storage).value("webId", TEXT);
    value.write("https://alice.example/card#me");
    expect(storage.getItem("webId")).toBe("https://alice.example/card#me");
    expect(value.read()).toBe("https://alice.example/card#me");
    storage.setItem("webId", "not a WebID");
    expect(value.read()).toBeNull();
    value.write(null);
    expect(storage.getItem("webId")).toBeNull();
  });

  it("keeps no value longer than it keeps, and reads one kept before as none", () => {
    const storage = memoryStorage();
    const value = createWebStorageDeviceStore(() => storage).value("k", STRINGS);
    value.write(["a"]);
    // Two quotes and two brackets around it, with the key: one character over.
    value.write(["x".repeat(MAX_VALUE_CHARACTERS - "k".length - 3)]);
    expect(storage.getItem("k")).toBeNull();
    value.write(["x".repeat(MAX_VALUE_CHARACTERS - "k".length - 4)]);
    expect(value.read()).toHaveLength(1);
    storage.setItem("k", `["${"x".repeat(MAX_VALUE_CHARACTERS)}"]`);
    expect(value.read()).toEqual([]);
  });

  it("keeps a value in fewer characters when its kind says so, and never more than it keeps", () => {
    const storage = memoryStorage();
    const store = createWebStorageDeviceStore(() => storage);
    const value = store.value("k", { ...STRINGS, maxCharacters: 9 });
    // `["abcd"]` and the key: nine characters.
    value.write(["abcd"]);
    expect(value.read()).toEqual(["abcd"]);
    value.write(["abcde"]);
    expect(storage.getItem("k")).toBeNull();
    storage.setItem("k", '["abcde"]');
    expect(value.read()).toEqual([]);
    const above = store.value("k", { ...STRINGS, maxCharacters: MAX_VALUE_CHARACTERS * 2 });
    above.write(["x".repeat(MAX_VALUE_CHARACTERS)]);
    expect(storage.getItem("k")).toBeNull();
  });

  it("keeps what its kind encodes of a value", () => {
    const storage = memoryStorage();
    const value = createWebStorageDeviceStore(() => storage).value("k", {
      ...STRINGS,
      encode: (list: string[]) => list.slice(0, 1),
    });
    value.write(["a", "b"]);
    expect(storage.getItem("k")).toBe('["a"]');
    expect(value.read()).toEqual(["a"]);
  });

  it("does without storage", () => {
    const value = createWebStorageDeviceStore(blocked).value("k", STRINGS);
    expect(() => value.write(["a"])).not.toThrow();
    expect(value.read()).toEqual([]);
  });

  it("uses the browser's localStorage by default", () => {
    createWebStorageDeviceStore().value("solid-memo:test", STRINGS).write(["a"]);
    expect(globalThis.localStorage.getItem("solid-memo:test")).toBe('["a"]');
    globalThis.localStorage.removeItem("solid-memo:test");
  });
});

describe("createWebStorageDeviceStore byInstance", () => {
  it("keeps a value for each instance under one key, the one written last first", () => {
    const storage = memoryStorage();
    const values = createWebStorageDeviceStore(() => storage).byInstance("k", STRINGS);
    expect(values.read(instance(1))).toEqual([]);
    values.write(instance(1), ["a"]);
    values.write(instance(2), ["b"]);
    expect(values.read(instance(1))).toEqual(["a"]);
    expect(values.read(instance(2))).toEqual(["b"]);
    expect(Object.keys(JSON.parse(storage.getItem("k")!))).toEqual([instance(2), instance(1)]);
    values.write(instance(1), ["c"]);
    expect(Object.keys(JSON.parse(storage.getItem("k")!))).toEqual([instance(1), instance(2)]);
  });

  it("keeps an instance's fallback as nothing, and none for no instance", () => {
    const storage = memoryStorage();
    const values = createWebStorageDeviceStore(() => storage).byInstance("k", STRINGS);
    values.write(instance(1), ["a"]);
    values.write(instance(2), ["b"]);
    values.write(instance(1), []);
    expect(JSON.parse(storage.getItem("k")!)).toEqual({ [instance(2)]: ["b"] });
    values.write(instance(2), []);
    expect(storage.getItem("k")).toBeNull();
  });

  it("keeps KEPT_INSTANCES instances, letting go of those written longest ago", () => {
    const storage = memoryStorage();
    const values = createWebStorageDeviceStore(() => storage).byInstance("k", STRINGS);
    for (let index = 0; index <= KEPT_INSTANCES; index++) values.write(instance(index), ["a"]);
    expect(values.read(instance(0))).toEqual([]);
    expect(values.read(instance(1))).toEqual(["a"]);
    expect(Object.keys(JSON.parse(storage.getItem("k")!))).toHaveLength(KEPT_INSTANCES);
  });

  it("keeps those that fit in MAX_INSTANCES_CHARACTERS, and skips one that does not", () => {
    const storage = memoryStorage();
    const values = createWebStorageDeviceStore(() => storage).byInstance("k", STRINGS);
    const half = "x".repeat(MAX_INSTANCES_CHARACTERS / 2);
    values.write(instance(1), ["small"]);
    values.write(instance(2), [half]);
    values.write(instance(3), [half]);
    // The newest is kept; the one before it no longer fits beside it, and the small one still does.
    expect(values.read(instance(3))).toEqual([half]);
    expect(values.read(instance(2))).toEqual([]);
    expect(values.read(instance(1))).toEqual(["small"]);
    expect(storage.getItem("k")!.length).toBeLessThanOrEqual(MAX_INSTANCES_CHARACTERS);
  });

  it("keeps nothing for an instance URL longer than a term the app reads", () => {
    const storage = memoryStorage();
    const values = createWebStorageDeviceStore(() => storage).byInstance("k", STRINGS);
    const long = `https://pod.example/${"x".repeat(HASHED_CHARACTERS)}/`;
    values.write(long, ["a"]);
    expect(values.read(long)).toEqual([]);
    expect(storage.getItem("k")).toBeNull();
  });

  it("writes back what it keeps of what is stored, once read", () => {
    const storage = memoryStorage();
    const long = `https://pod.example/${"x".repeat(HASHED_CHARACTERS)}/`;
    storage.setItem(
      "k",
      JSON.stringify({ [instance(1)]: ["a", 7], [long]: ["b"], [instance(2)]: "not a list" }),
    );
    const values = createWebStorageDeviceStore(() => storage).byInstance("k", STRINGS);
    expect(values.read(instance(1))).toEqual(["a"]);
    expect(storage.getItem("k")).toBe(JSON.stringify({ [instance(1)]: ["a"] }));
    storage.setItem("k", "[1,2]");
    expect(values.read(instance(1))).toEqual([]);
    expect(storage.getItem("k")).toBeNull();
    storage.setItem("k", "{not json");
    expect(values.read(instance(1))).toEqual([]);
    expect(storage.getItem("k")).toBeNull();
  });

  it("moves the values kept one key an instance into its key, once, after those it keeps", () => {
    const storage = memoryStorage();
    storage.setItem("k", JSON.stringify({ [instance(1)]: ["new"] }));
    storage.setItem(`old.${instance(1)}`, '["old"]');
    storage.setItem(`old.${instance(2)}`, '["b"]');
    storage.setItem(`old.${instance(3)}`, "{not json");
    storage.setItem("other", '["c"]');
    const store = createWebStorageDeviceStore(() => storage);
    const values = store.byInstance("k", { ...STRINGS, legacyPrefix: "old." });
    expect(values.read(instance(1))).toEqual(["new"]);
    expect(values.read(instance(2))).toEqual(["b"]);
    expect(values.read(instance(3))).toEqual([]);
    expect(JSON.parse(storage.getItem("k")!)).toEqual({
      [instance(1)]: ["new"],
      [instance(2)]: ["b"],
    });
    expect([storage.getItem(`old.${instance(1)}`), storage.getItem(`old.${instance(2)}`)]).toEqual([
      null,
      null,
    ]);
    expect(storage.getItem(`old.${instance(3)}`)).toBeNull();
    expect(storage.getItem("other")).toBe('["c"]');
    // Moved once: a key with the prefix written after is not looked for again.
    storage.setItem(`old.${instance(4)}`, '["d"]');
    expect(store.byInstance("k", { ...STRINGS, legacyPrefix: "old." }).read(instance(4))).toEqual(
      [],
    );
  });

  it("does without storage", () => {
    const values = createWebStorageDeviceStore(blocked).byInstance("k", {
      ...STRINGS,
      legacyPrefix: "old.",
    });
    expect(() => values.write(instance(1), ["a"])).not.toThrow();
    expect(values.read(instance(1))).toEqual([]);
  });
});
