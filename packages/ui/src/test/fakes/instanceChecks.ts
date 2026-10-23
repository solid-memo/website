// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { deckHealth } from "@solid-memo/domain/deckHealth";
import type { InstanceCheckUseCases } from "@solid-memo/application/instanceChecks";
import type { CardUseCases } from "@solid-memo/application/cards";

/**
 * The use cases of the instance checks, faked (a `vi.fn` each), as the
 * real ones relate to one another; `overrides` replace any of them.
 * They are made in `fake`, the object a test calls, and call one
 * another through it, so a method a test replaces is the one the others
 * call.
 */
export function makeInstanceCheckUseCasesFake(
  overrides: Partial<InstanceCheckUseCases> = {},
  // Alone, a deck's check finds the deck has no cards.
  fake: InstanceCheckUseCases & Pick<CardUseCases, "listCards"> = {
    listCards: vi.fn(async () => []),
  } as unknown as InstanceCheckUseCases & Pick<CardUseCases, "listCards">,
): InstanceCheckUseCases {
  return Object.assign(
    fake,
    {
      validateInstance: vi.fn(async (instanceUrl) => ({
        instanceUrl,
        documents: [],
        violationCount: 0,
        conforms: true,
      })),
      planRepair: vi.fn(() => ({ repairs: [], unrepairable: [] })),
      applyRepairs: vi.fn(async () => undefined),
      checkInstance: vi.fn((instanceUrl) => fake.validateInstance(instanceUrl)),
      claimDeckDocuments: vi.fn(async () => undefined),
      // A deck's health, of the instance's check, its cards, and no release.
      checkDeck: vi.fn(async (instanceUrl, deck, text) =>
        deckHealth(
          deck,
          await fake.checkInstance(instanceUrl),
          await fake.listCards(deck),
          [],
          text,
        ),
      ) as InstanceCheckUseCases["checkDeck"],
    } satisfies InstanceCheckUseCases,
    overrides,
  );
}
