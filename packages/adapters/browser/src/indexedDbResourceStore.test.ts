// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { createIndexedDbResourceStore, webLock } from "./indexedDbResourceStore";

const URL_A = "https://guest.example/a";
const URL_B = "https://guest.example/b";

describe("createIndexedDbResourceStore", () => {
  it("keeps, lists, deletes and forgets resources, bytes included", async () => {
    const store = createIndexedDbResourceStore({ indexedDB: new IDBFactory() });
    await store.set(URL_A, {
      kind: "file",
      etag: '"1"',
      contentType: "image/png",
      bytes: new Uint8Array([1, 2]),
    });
    await store.set(URL_B, { kind: "rdf", etag: '"2"', triples: ["<a> <b> <c> ."] });
    expect(await store.get(URL_A)).toEqual({
      kind: "file",
      etag: '"1"',
      contentType: "image/png",
      bytes: new Uint8Array([1, 2]),
    });
    expect((await store.urls()).sort()).toEqual([URL_A, URL_B]);
    await store.delete(URL_A);
    expect(await store.get(URL_A)).toBeUndefined();
    await store.clear();
    expect(await store.urls()).toEqual([]);
  });

  it("keeps resources for the next page", async () => {
    const indexedDB = new IDBFactory();
    await createIndexedDbResourceStore({ indexedDB }).set(URL_A, {
      kind: "container",
      etag: '"1"',
    });
    expect(await createIndexedDbResourceStore({ indexedDB }).get(URL_A)).toEqual({
      kind: "container",
      etag: '"1"',
    });
  });

  it("runs exclusive work under the guest pod's lock", async () => {
    const lock = vi.fn((_name: string, work: () => Promise<unknown>) => work()) as never;
    const store = createIndexedDbResourceStore({ indexedDB: new IDBFactory(), lock });
    expect(await store.exclusive(async () => 7)).toBe(7);
    expect(lock).toHaveBeenCalledWith("solid-memo-guest-pod", expect.any(Function));
  });

  it("fails when the database cannot be opened, and tries again next time", async () => {
    const indexedDB = new IDBFactory();
    const open = indexedDB.open.bind(indexedDB);
    let refuse = true;
    vi.spyOn(indexedDB, "open").mockImplementation((name, version) => {
      if (!refuse) return open(name, version);
      const request = {} as IDBOpenDBRequest;
      Object.defineProperty(request, "error", { value: new Error("blocked") });
      setTimeout(() => request.onerror!(new Event("error")));
      return request;
    });
    const store = createIndexedDbResourceStore({ indexedDB });
    await expect(store.urls()).rejects.toThrow("blocked");
    refuse = false;
    expect(await store.urls()).toEqual([]);
  });

  it("fails when its transaction is aborted", async () => {
    const store = createIndexedDbResourceStore({ indexedDB: new IDBFactory() });
    const get = vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(function (
      this: IDBObjectStore,
    ) {
      this.transaction.abort();
      return {} as IDBRequest;
    });
    await expect(store.get(URL_A)).rejects.toMatchObject({ code: "guestStorageAborted" });
    get.mockRestore();
  });

  it("fails when a write fails", async () => {
    const store = createIndexedDbResourceStore({ indexedDB: new IDBFactory() });
    // A function cannot be stored: the put throws a DataCloneError before any transaction event.
    await expect(
      store.set(URL_A, { kind: "container", etag: (() => "") as never }),
    ).rejects.toThrow();
  });
});

describe("webLock", () => {
  it("uses the Web Locks API when there is one", async () => {
    const request = vi.fn((_name: string, work: () => Promise<unknown>) => work());
    const lock = webLock({ request } as unknown as LockManager);
    expect(await lock("x", async () => 1)).toBe(1);
    expect(request).toHaveBeenCalledWith("x", expect.any(Function));
  });

  it("queues this tab's work without it, past failures", async () => {
    const lock = webLock(null);
    const order: number[] = [];
    let release!: () => void;
    const first = lock("x", async () => {
      await new Promise<void>((resolve) => (release = resolve));
      order.push(1);
      throw new Error("failed");
    });
    const second = lock("x", async () => order.push(2));
    await Promise.resolve();
    release();
    await expect(first).rejects.toThrow("failed");
    await second;
    expect(order).toEqual([1, 2]);
  });
});
