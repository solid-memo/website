// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { CARD_FORMAT_VERSION, DECK_FORMAT_VERSION } from "@solid-memo/domain/deck";
import { describedCatalog } from "@solid-memo/domain/catalog";
import { PREFERENCES_FORMAT_VERSION } from "@solid-memo/domain/preferences";
import { REVIEW_STATE_FORMAT_VERSION } from "@solid-memo/domain/review";
import type { InstanceUseCases } from "@solid-memo/application/instances";

/**
 * The use cases of the instances, faked (a `vi.fn` each), as the real
 * ones relate to one another; `overrides` replace any of them. They are
 * made in `fake`, the object a test calls, and call one another through
 * it, so a method a test replaces is the one the others call.
 */
export function makeInstanceUseCasesFake(
  overrides: Partial<InstanceUseCases> = {},
  fake: InstanceUseCases = {} as InstanceUseCases,
): InstanceUseCases {
  return Object.assign(
    fake,
    {
      listStorages: vi.fn(async () => []),
      addManualStorage: vi.fn(async () => ({
        url: "https://pod.example/",
        source: "manual" as const,
      })),
      listInstances: vi.fn(async () => []),
      getRegistrationOptions: vi.fn(async () => ({
        privateIndexExists: true,
        publicIndexExists: true,
      })),
      createInstance: vi.fn(async () => ({
        url: "https://pod.example/solid-memo/main/",
        name: "Main",
      })),
      attachInstanceByUrl: vi.fn(async () => ({
        url: "https://pod.example/solid-memo/main/",
        name: "Main",
      })),
      deleteInstance: vi.fn(async () => ({
        keptFolder: null,
        keptReleases: false,
        keptDocuments: [],
      })),
      dataClassRegistrations: vi.fn(async () => ({
        registrations: (
          ["instance", "catalog", "deck", "card", "reviewState", "answer", "draft"] as const
        ).map((dataClass) => ({
          dataClass,
          index: "private" as const,
          registered: true,
        })),
        privateIndexMissing: false,
        unreadableIndexes: [],
      })),
      registerDataClasses: vi.fn(async () => undefined),
      planMigration: vi.fn(async () => ({
        decks: [],
        deckCount: 0,
        cardCount: 0,
        reviewCount: 0,
        preferencesOutdated: false,
        instanceOutdated: false,
        catalogMissing: false,
        oldestFormat: {
          deck: DECK_FORMAT_VERSION,
          card: CARD_FORMAT_VERSION,
          reviewState: REVIEW_STATE_FORMAT_VERSION,
          preferences: PREFERENCES_FORMAT_VERSION,
        },
      })),
      updateInstance: vi.fn(async () => ({ updated: [], failed: [] })),
      renameInstance: vi.fn(async (_session, instance, name) => ({
        ...instance,
        name: name.trim(),
      })),
      readCatalog: vi.fn(async (instanceUrl) => ({
        title: "Main",
        description: "My decks.",
        publisher: { webId: `${new URL(instanceUrl).origin}/profile/card#me`, name: "Alice" },
      })),
      // As the real one does: of the catalog as it is read.
      describeCatalog: vi.fn(async (instanceUrl, about) =>
        describedCatalog((await fake.readCatalog(instanceUrl))!, about),
      ),
    } satisfies InstanceUseCases,
    overrides,
  );
}
