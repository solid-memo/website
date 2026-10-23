// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { MistakeReportUseCases } from "@solid-memo/application/mistakeReports";

/**
 * The use cases of where a mistake is reported, faked (a `vi.fn` each),
 * as the real ones relate to one another; `overrides` replace any of
 * them. They are made in `fake`, the object a test calls, and call one
 * another through it, so a method a test replaces is the one the others
 * call.
 */
export function makeMistakeReportUseCasesFake(
  overrides: Partial<MistakeReportUseCases> = {},
  fake: MistakeReportUseCases = {} as MistakeReportUseCases,
): MistakeReportUseCases {
  return Object.assign(
    fake,
    {
      reportPlace: vi.fn(async () => ({ library: false as const })),
    } satisfies MistakeReportUseCases,
    overrides,
  );
}
