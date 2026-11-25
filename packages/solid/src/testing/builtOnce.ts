// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ResourceStore } from "@solid-memo/application/ports/device";

/** The work of one run of a growth test, timed. */
type Work = () => Promise<unknown>;

/** What `build` put in place: how to put the pod back as it left it, and how to start a run. */
type Built = { restore: () => unknown; start: () => Work | Promise<Work> };

/**
 * A setup of one run for growthAfterSetup
 * (packages/domain/src/testing/growth.ts) whose input takes as long to
 * put in place as the work takes, or longer: `build` puts it in a pod
 * once, at the first run of a size, and every later run puts the pod
 * back as `build` left it instead. `start` gives each run its work, over
 * a repository of its own, so nothing one run learned is left to the
 * next but what the pod holds.
 */
export function builtOnce(build: () => Promise<Built>): () => Promise<Work> {
  let built: Built | undefined;
  return async () => {
    if (built === undefined) built = await build();
    else await built.restore();
    return built.start();
  };
}

/**
 * What `store` holds now; the returned function puts it back. A local
 * pod writes a resource anew, never changes one in place, so the
 * resources are shared, not copied.
 */
export async function saved(store: ResourceStore): Promise<() => Promise<void>> {
  const resources = await Promise.all(
    (await store.urls()).map(async (url) => [url, (await store.get(url))!] as const),
  );
  return async () => {
    await store.clear();
    for (const [url, resource] of resources) await store.set(url, resource);
  };
}
