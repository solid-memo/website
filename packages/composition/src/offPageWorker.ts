// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { WorkerLike } from "@solid-memo/solid/offPage";
import OffPageWorker from "@solid-memo/solid/offPageWorker?worker";

/**
 * A worker the page runs its work on documents the app did not write in
 * (offPage.ts): the build bundles it as a module of its own, served
 * from the site's origin, as its scripts are.
 */
export function spawnOffPageWorker(): WorkerLike {
  return new OffPageWorker() as unknown as WorkerLike;
}
