// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { InstanceGraphUseCases } from "@solid-memo/application/instanceGraph";

/**
 * The use cases of the instance graph, faked (a `vi.fn` each), as the
 * real ones relate to one another; `overrides` replace any of them.
 * They are made in `fake`, the object a test calls, and call one
 * another through it, so a method a test replaces is the one the others
 * call.
 */
export function makeInstanceGraphUseCasesFake(
  overrides: Partial<InstanceGraphUseCases> = {},
  fake: InstanceGraphUseCases = {} as InstanceGraphUseCases,
): InstanceGraphUseCases {
  return Object.assign(
    fake,
    {
      readInstanceGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
    } satisfies InstanceGraphUseCases,
    overrides,
  );
}
