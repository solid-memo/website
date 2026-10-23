// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { TrialOpeningUseCases } from "@solid-memo/application/trial";

/**
 * The use cases of opening a trial, faked (a `vi.fn` each), as the real
 * ones relate to one another; `overrides` replace any of them. They are
 * made in `fake`, the object a test calls, and call one another through
 * it, so a method a test replaces is the one the others call.
 */
export function makeTrialOpeningUseCasesFake(
  overrides: Partial<TrialOpeningUseCases> = {},
  fake: TrialOpeningUseCases = {} as TrialOpeningUseCases,
): TrialOpeningUseCases {
  return Object.assign(
    fake,
    {
      openTrial: vi.fn(async () => ({ ok: false as const, problems: [] })),
    } satisfies TrialOpeningUseCases,
    overrides,
  );
}
