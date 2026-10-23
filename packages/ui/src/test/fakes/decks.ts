// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import { withAbout } from "@solid-memo/domain/deckAbout";
import { withCardLanguage } from "@solid-memo/domain/deckCardLanguage";
import { withProvenance } from "@solid-memo/domain/deckProvenance";
import { applyDeckTreeEdit } from "@solid-memo/domain/deckTree";
import type { DeckUseCases } from "@solid-memo/application/decks";

/**
 * The use cases of the decks, faked (a `vi.fn` each), as the real ones
 * relate to one another; `overrides` replace any of them. They are made
 * in `fake`, the object a test calls, and call one another through it,
 * so a method a test replaces is the one the others call.
 */
export function makeDeckUseCasesFake(
  overrides: Partial<DeckUseCases> = {},
  fake: DeckUseCases = {} as DeckUseCases,
): DeckUseCases {
  return Object.assign(
    fake,
    {
      listDecks: vi.fn(async () => []),
      createDeck: vi.fn(async () => {
        throw new Error("createDeck fake not configured");
      }),
      renameDeck: vi.fn(async (deck, title) => ({ ...deck, title })),
      // As the real ones relate to them: every listed deck at the top level, an edit made to that tree.
      listDeckTree: vi.fn(async (instanceUrl) => ({
        children: (await fake.listDecks(instanceUrl)).map((deck) => ({
          kind: "deck" as const,
          deck,
        })),
        readOnly: false,
      })),
      newDeckGroup: vi.fn((instanceUrl, title) => ({
        url: `${instanceUrl}catalog.ttl#group-fake`,
        title,
      })),
      editDeckTree: vi.fn(async (instanceUrl, edit) =>
        applyDeckTreeEdit(await fake.listDeckTree(instanceUrl), edit),
      ),
      setDeckDirection: vi.fn(async (deck, direction) => ({ ...deck, direction })),
      // As the real one does: keywords tidied, and left off when there are none.
      describeDeck: vi.fn(async (deck, about) => withAbout(deck, about)),
      setDeckPace: vi.fn(async (deck, pace) => ({ ...deck, ...pace })),
      // As the real one does: the tag in lower case, and left off for null.
      setDeckCardLanguage: vi.fn(async (deck, language) => withCardLanguage(deck, language)),
      // As the real one does: authors tidied, the license one offered.
      setDeckProvenance: vi.fn(async (deck, provenance) => withProvenance(deck, provenance)),
      setDecksDirection: vi.fn(async (decks: readonly Deck[], direction) =>
        decks.map((deck) => ({ ...deck, direction })),
      ),
      setDecksPace: vi.fn(async (decks: readonly Deck[], pace) =>
        decks.map((deck) => ({ ...deck, ...pace })),
      ),
      removeDeck: vi.fn(async () => ({ keptDocuments: [] })),
      removeDecks: vi.fn(async () => ({ keptDocuments: [] })),
    } satisfies DeckUseCases,
    overrides,
  );
}
