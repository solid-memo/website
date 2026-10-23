// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { LibraryUseCases } from "@solid-memo/application/library";

/**
 * The use cases of the deck library, faked (a `vi.fn` each), as the
 * real ones relate to one another; `overrides` replace any of them.
 * They are made in `fake`, the object a test calls, and call one
 * another through it, so a method a test replaces is the one the others
 * call.
 */
export function makeLibraryUseCasesFake(
  overrides: Partial<LibraryUseCases> = {},
  fake: LibraryUseCases = {} as LibraryUseCases,
): LibraryUseCases {
  return Object.assign(
    fake,
    {
      listLibraryDecks: vi.fn(async () => []),
      importLibraryDeck: vi.fn(async () => {
        throw new Error("importLibraryDeck fake not configured");
      }),
      listLibraryCards: vi.fn(async () => []),
      readReleaseFromLink: vi.fn(async () => {
        throw new Error("readReleaseFromLink fake not configured");
      }),
      importReleaseFromUrl: vi.fn(async () => {
        throw new Error("importReleaseFromUrl fake not configured");
      }),
      planLibraryUpgrade: vi.fn(async () => null),
      listLibraryUpdates: vi.fn(async () => []),
      addReleaseLanguages: vi.fn(async () => null),
      deckRelease: vi.fn(async () => null),
      applyLibraryUpgrade: vi.fn(async (deck, plan) => ({
        ok: true as const,
        deck: { ...deck, sourceUrl: plan.releaseUrl },
      })),
    } satisfies LibraryUseCases,
    overrides,
  );
}
