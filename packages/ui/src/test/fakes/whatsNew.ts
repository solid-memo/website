// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { WhatsNewUseCases } from "@solid-memo/application/whatsNew";

/**
 * The use cases of what is new in a version, faked (a `vi.fn` each):
 * every highlight seen; `overrides` replace any of them. They are made
 * in `fake`, the object a test calls.
 */
export function makeWhatsNewUseCasesFake(
  overrides: Partial<WhatsNewUseCases> = {},
  fake: WhatsNewUseCases = {} as WhatsNewUseCases,
): WhatsNewUseCases {
  return Object.assign(
    fake,
    {
      unseenHighlights: vi.fn((): string[] => []),
      dismissHighlights: vi.fn(),
    } satisfies WhatsNewUseCases,
    overrides,
  );
}
