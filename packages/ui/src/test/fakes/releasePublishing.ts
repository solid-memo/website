// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { ReleasePublishingUseCases } from "@solid-memo/application/releasePublishing";

/**
 * The use cases of publishing releases, faked (a `vi.fn` each), as the
 * real ones relate to one another; `overrides` replace any of them.
 * They are made in `fake`, the object a test calls, and call one
 * another through it, so a method a test replaces is the one the others
 * call.
 */
export function makeReleasePublishingUseCasesFake(
  overrides: Partial<ReleasePublishingUseCases> = {},
  fake: ReleasePublishingUseCases = {} as ReleasePublishingUseCases,
): ReleasePublishingUseCases {
  return Object.assign(
    fake,
    {
      publishRelease: vi.fn(async (_draft, url) => ({ url, public: true })),
      makeReleasePublic: vi.fn(async () => undefined),
      isReleasePublic: vi.fn(async () => true),
      downloadRelease: vi.fn(async () => ({
        name: "release-v1.ttl",
        url: "https://solid-memo.com/decks/release/v1.ttl",
      })),
      listPublishedReleases: vi.fn(async () => []),
    } satisfies ReleasePublishingUseCases,
    overrides,
  );
}
