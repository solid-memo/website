// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { withPause, withResume } from "@solid-memo/domain/deckPause";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import type { DeckPauseUseCases } from "@solid-memo/application/deckPauses";

/**
 * The use cases of pausing a deck, faked (a `vi.fn` each), at the default
 * day boundary of 4 as the real ones are by the preferences; `overrides`
 * replace any of them. Nothing has been studied (no outlook) and no
 * deck comes back from a pause, unless a test says so.
 */
export function makeDeckPauseUseCasesFake(
  overrides: Partial<DeckPauseUseCases> = {},
  fake: DeckPauseUseCases = {} as DeckPauseUseCases,
): DeckPauseUseCases {
  return Object.assign(
    fake,
    {
      pauseDeck: vi.fn(async (_instanceUrl, deck, resumesOn, now) =>
        withPause(deck, now, resumesOn, studyDayOf(now, 4)),
      ),
      resumeDeck: vi.fn(async (_instanceUrl, deck, now) => withResume(deck, studyDayOf(now, 4))),
      getPauseOutlook: vi.fn(async (_instanceUrl, _deck, resumesOn) => ({
        day: resumesOn ?? "2026-01-31",
        recall: null,
      })),
      getComeback: vi.fn(async () => null),
    } satisfies DeckPauseUseCases,
    overrides,
  );
}
