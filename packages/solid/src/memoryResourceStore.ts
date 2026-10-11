// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ResourceStore, StoredResource } from "@solid-memo/application/ports";

/**
 * A ResourceStore in memory, for one page: what a guest's pod keeps when
 * the browser keeps nothing (no IndexedDB), and what tests use. Exclusive
 * work runs one at a time, in the order asked for.
 */
export function createMemoryResourceStore(): ResourceStore {
  const resources = new Map<string, StoredResource>();
  let queue: Promise<unknown> = Promise.resolve();
  return {
    get: async (url) => resources.get(url),
    async set(url, resource) {
      resources.set(url, resource);
    },
    async delete(url) {
      resources.delete(url);
    },
    urls: async () => [...resources.keys()],
    async clear() {
      resources.clear();
    },
    exclusive(work) {
      const run = queue.then(() => work());
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
