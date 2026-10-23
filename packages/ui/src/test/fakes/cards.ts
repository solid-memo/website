// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { CardUseCases } from "@solid-memo/application/cards";

/**
 * The use cases of the cards, faked (a `vi.fn` each), as the real ones
 * relate to one another; `overrides` replace any of them. They are made
 * in `fake`, the object a test calls, and call one another through it,
 * so a method a test replaces is the one the others call.
 */
export function makeCardUseCasesFake(
  overrides: Partial<CardUseCases> = {},
  fake: CardUseCases = {} as CardUseCases,
): CardUseCases {
  return Object.assign(
    fake,
    {
      listCards: vi.fn(async () => []),
      listDeckReviewStates: vi.fn(async () => ({ sm2: [], fsrs: [] })),
      addCard: vi.fn(async () => {
        throw new Error("addCard fake not configured");
      }),
      updateCard: vi.fn(async () => {
        throw new Error("updateCard fake not configured");
      }),
      removeCard: vi.fn(async () => undefined),
      stateCardLanguages: vi.fn(async () => 0),
      editCards: vi.fn(async (_instanceUrl, _deck, _ids, _edit, previewed) => previewed),
      undoCardEdit: vi.fn(async () => undefined),
      resetCards: vi.fn(async (_instanceUrl, _deck, ids) => ids.length),
      exportDeckFile: vi.fn(async () => undefined),
      openDeckFile: vi.fn(async () => null),
      importDeckFile: vi.fn(async () => {
        throw new Error("importDeckFile fake not configured");
      }),
      rescheduleCards: vi.fn(async (_instanceUrl, _deck, ids) => ids.length),
      transferCards: vi.fn(async (_instanceUrl, _from, _to, ids) => ({
        cards: ids.map((id: string) => ({ from: id, to: id, present: false })),
        missing: [],
        target: { save: [], reviewSaves: [], reviewRemovals: [], fsrsSaves: [], fsrsRemovals: [] },
        source: { remove: [], reviewRemovals: [] },
      })),
    } satisfies CardUseCases,
    overrides,
  );
}
