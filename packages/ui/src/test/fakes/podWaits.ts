// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { PodWait, PodWaitUseCases } from "@solid-memo/application/podWaits";

/**
 * The use cases of the waits servers asked for, faked (a `vi.fn` each):
 * no server asked for one, and no listener is ever told of one;
 * `overrides` replace any of them. They are made in `fake`, the object
 * a test calls.
 */
export function makePodWaitUseCasesFake(
  overrides: Partial<PodWaitUseCases> = {},
  fake: PodWaitUseCases = {} as PodWaitUseCases,
): PodWaitUseCases {
  return Object.assign(
    fake,
    {
      podWaits: vi.fn((): PodWait[] => []),
      watchPodWaits: vi.fn(() => () => undefined),
    } satisfies PodWaitUseCases,
    overrides,
  );
}
