// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { ReleaseDraftUseCases } from "@solid-memo/application/releaseDrafts";

/**
 * The use cases of the release drafts, faked (a `vi.fn` each), as the
 * real ones relate to one another; `overrides` replace any of them.
 * They are made in `fake`, the object a test calls, and call one
 * another through it, so a method a test replaces is the one the others
 * call.
 */
export function makeReleaseDraftUseCasesFake(
  overrides: Partial<ReleaseDraftUseCases> = {},
  fake: ReleaseDraftUseCases = {} as ReleaseDraftUseCases,
): ReleaseDraftUseCases {
  return Object.assign(
    fake,
    {
      listReleaseDrafts: vi.fn(async () => []),
      createReleaseDraft: vi.fn(async () => null),
      copyReleaseDraft: vi.fn(async () => {
        throw new Error("copyReleaseDraft fake not configured");
      }),
      getReleaseDraft: vi.fn(async () => {
        throw new Error("getReleaseDraft fake not configured");
      }),
      readReleaseDraft: vi.fn(async () => {
        throw new Error("readReleaseDraft fake not configured");
      }),
      editReleaseDraft: vi.fn(async () => {
        throw new Error("editReleaseDraft fake not configured");
      }),
      deleteReleaseDraft: vi.fn(async () => ({ keptDocuments: [] })),
      checkReleaseDraft: vi.fn(async (_draft, _check, _policy, options) => ({
        rules: [],
        library: [],
        drops: [],
        markdown: [],
        shapes: options?.shapes === true ? [] : null,
      })),
      diffReleaseDraft: vi.fn(async () => null),
    } satisfies ReleaseDraftUseCases,
    overrides,
  );
}
