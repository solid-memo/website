// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createMemoryResourceStore } from "./memoryResourceStore";

describe("createMemoryResourceStore", () => {
  it("keeps, lists, deletes and forgets resources", async () => {
    const store = createMemoryResourceStore();
    await store.set("https://x.example/a", { kind: "container", etag: '"1"' });
    await store.set("https://x.example/b", { kind: "rdf", etag: '"2"', triples: [] });
    expect(await store.get("https://x.example/a")).toEqual({ kind: "container", etag: '"1"' });
    expect((await store.urls()).sort()).toEqual(["https://x.example/a", "https://x.example/b"]);
    await store.delete("https://x.example/a");
    expect(await store.get("https://x.example/a")).toBeUndefined();
    await store.clear();
    expect(await store.urls()).toEqual([]);
  });

  it("runs exclusive work one at a time, in order, past failures", async () => {
    const store = createMemoryResourceStore();
    const order: string[] = [];
    let release!: () => void;
    const first = store.exclusive(async () => {
      await new Promise<void>((resolve) => (release = resolve));
      order.push("first");
      throw new Error("failed");
    });
    const second = store.exclusive(async () => {
      order.push("second");
      return 2;
    });
    await Promise.resolve();
    release();
    await expect(first).rejects.toThrow("failed");
    expect(await second).toBe(2);
    expect(order).toEqual(["first", "second"]);
  });
});
