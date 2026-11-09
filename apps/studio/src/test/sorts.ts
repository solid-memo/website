// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { onTestFinished, vi } from "vitest";

/** Counts the table sorts from here on: each collates with a new numeric Intl.Collator. */
export function countSorts(): () => number {
  const collator = vi.spyOn(Intl, "Collator");
  onTestFinished(() => collator.mockRestore());
  return () => collator.mock.calls.filter(([, options]) => options?.numeric === true).length;
}
