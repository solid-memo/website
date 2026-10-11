// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ResourceStore, StoredResource } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";

const DATABASE = "solid-memo-guest-pod";
const RESOURCES = "resources";
const LOCK = "solid-memo-guest-pod";

/** Runs work holding a lock of that name: the Web Locks API's request, or what stands in for it. */
export type Lock = <T>(name: string, work: () => Promise<T>) => Promise<T>;

/**
 * The guest's pod (docs/guest-mode.md) in IndexedDB, one record per
 * resource keyed by its URL, so it outlives the page — above all the
 * page the login redirect leaves. Exclusive work holds a Web Lock, which
 * every tab of the site shares; without Web Locks, only this tab's work
 * is kept apart.
 */
export function createIndexedDbResourceStore({
  indexedDB = globalThis.indexedDB,
  lock = webLock(),
}: {
  indexedDB?: IDBFactory;
  lock?: Lock;
} = {}): ResourceStore {
  let opened: Promise<IDBDatabase> | null = null;

  function database(): Promise<IDBDatabase> {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(RESOURCES);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // A failed open is tried again next time.
    opened.catch(() => (opened = null));
    return opened;
  }

  async function run<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const db = await database();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(RESOURCES, mode);
      const request = operation(transaction.objectStore(RESOURCES));
      transaction.oncomplete = () => resolve(request.result as T);
      // A failed request aborts its transaction.
      transaction.onabort = () => reject(transaction.error ?? new AppError("guestStorageAborted"));
    });
  }

  return {
    get: (url) => run<StoredResource | undefined>("readonly", (store) => store.get(url)),
    set: (url, resource) =>
      run<void>("readwrite", (store) => store.put(resource, url)).then(() => undefined),
    delete: (url) => run<void>("readwrite", (store) => store.delete(url)).then(() => undefined),
    urls: () =>
      run<IDBValidKey[]>("readonly", (store) => store.getAllKeys()).then((keys) =>
        keys.map(String),
      ),
    clear: () => run<void>("readwrite", (store) => store.clear()).then(() => undefined),
    exclusive: (work) => lock(LOCK, work),
  };
}

/** The Web Locks API where the browser has it; else a queue for this tab. */
export function webLock(locks: LockManager | null | undefined = globalThis.navigator?.locks): Lock {
  if (locks != null) return (name, work) => locks.request(name, work);
  let queue: Promise<unknown> = Promise.resolve();
  return (_name, work) => {
    const run = queue.then(() => work());
    queue = run.catch(() => undefined);
    return run;
  };
}
