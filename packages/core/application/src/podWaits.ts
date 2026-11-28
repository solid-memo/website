// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { PodWait, PodWaits } from "./ports/pod";

/** A server's wait, as the screens read it: they import no port. */
export type { PodWait };

export interface PodWaitUseCases {
  /** The waits servers asked of the app that aren't over yet, the one that ends first first. */
  podWaits(): PodWait[];
  /** Calls `listener` each time a server's wait starts or grows longer. Returns a function that stops it. */
  watchPodWaits(listener: () => void): () => void;
}

/**
 * The waits servers asked of the app, for a screen to tell the learner
 * why their pod is slow to answer, and when the app tries again
 * (docs/architecture.md#a-request-on-its-way-to-a-pod).
 */
export function createPodWaitUseCases({ podWaits }: { podWaits: PodWaits }): PodWaitUseCases {
  return {
    podWaits: () => podWaits.current(),
    watchPodWaits: (listener) => podWaits.listen(listener),
  };
}
