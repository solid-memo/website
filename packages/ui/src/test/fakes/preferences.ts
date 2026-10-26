// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { InstanceUseCases } from "@solid-memo/application/instances";
import type { PreferenceUseCases } from "@solid-memo/application/preferences";

/**
 * The use cases of the preferences, faked (a `vi.fn` each), as the real
 * ones relate to one another; `overrides` replace any of them. They are
 * made in `fake`, the object a test calls, and call one another through
 * it, so a method a test replaces is the one the others call.
 */
export function makePreferenceUseCasesFake(
  overrides: Partial<PreferenceUseCases> = {},
  // Alone, a login finds the learner has no instances.
  fake: PreferenceUseCases & Pick<InstanceUseCases, "listInstances"> = {
    listInstances: vi.fn(async () => []),
  } as unknown as PreferenceUseCases & Pick<InstanceUseCases, "listInstances">,
): PreferenceUseCases {
  return Object.assign(
    fake,
    {
      language: vi.fn(() => "en" as const),
      chooseLanguage: vi.fn(),
      themeChoice: vi.fn(() => "system" as const),
      instanceTheme: vi.fn(async () => null),
      chooseTheme: vi.fn(async () => undefined),
      paletteChoice: vi.fn(() => "standard" as const),
      instancePalette: vi.fn(async () => null),
      choosePalette: vi.fn(async () => undefined),
      customPaletteChoice: vi.fn(() => null),
      chooseCustomPalette: vi.fn(async () => undefined),
      listPalettes: vi.fn(async () => []),
      savePalette: vi.fn(async (_instanceUrl, draft) => ({
        ...draft,
        url: draft.url ?? `${_instanceUrl}palettes.ttl#palette-new`,
      })),
      textSizeChoice: vi.fn(() => "default" as const),
      instanceTextSize: vi.fn(async () => null),
      chooseTextSize: vi.fn(async () => undefined),
      getPreferences: vi.fn(async () => DEFAULT_PREFERENCES),
      savePreferences: vi.fn(async () => undefined),
      switchScheduler: vi.fn(async () => ({
        switched: true,
        decks: 0,
        replayed: 0,
        estimated: 0,
        failed: [],
      })),
      dismissSchedulerInvitation: vi.fn(async () => undefined),
      // Nothing says to skip the Connected screen: it shows, as it did before the choice was offered.
      connectedScreenChoice: vi.fn(async (session) => ({
        instances: await fake.listInstances(session),
        skipped: false,
      })),
      skipConnectedScreen: vi.fn(async () => undefined),
      connectedScreenShown: vi.fn(async () => true),
      chooseConnectedScreen: vi.fn(async () => undefined),
    } satisfies PreferenceUseCases,
    overrides,
  );
}
