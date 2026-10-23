// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { SessionUseCases } from "@solid-memo/application/session";

/**
 * The use cases of the session and the guest's study, faked (a `vi.fn`
 * each), as the real ones relate to one another; `overrides` replace
 * any of them. They are made in `fake`, the object a test calls, and
 * call one another through it, so a method a test replaces is the one
 * the others call.
 */
export function makeSessionUseCasesFake(
  overrides: Partial<SessionUseCases> = {},
  fake: SessionUseCases = {} as SessionUseCases,
): SessionUseCases {
  return Object.assign(
    fake,
    {
      restoreSession: vi.fn(async () => null),
      startGuest: vi.fn(async () => ({
        webId: "https://guest.solid-memo.invalid/profile/card#me",
        guest: true as const,
      })),
      discardGuest: vi.fn(async () => undefined),
      findGuestStudy: vi.fn(async () => null),
      transferGuestStudy: vi.fn(async () => ({
        ok: true as const,
        instance: { url: "https://pod.example/solid-memo/main/", name: "My study" },
        tidied: true,
      })),
      planGuestMerge: vi.fn(async () => ({ decks: [], drafts: 0 })),
      mergeGuestStudy: vi.fn(async (_session, _guest, target) => ({
        ok: true as const,
        instance: target,
        added: [],
        tidied: true,
      })),
      loginWithWebId: vi.fn(async () => undefined),
      loginWithProvider: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      onSessionExpired: vi.fn(() => () => undefined),
      discoverAccount: vi.fn(async (session) => ({
        webId: session.webId,
        podUrl: "https://pod.example/",
        oidcIssuer: "https://issuer.example",
      })),
      viewWebIdDocument: vi.fn(async () => ({ url: "", subjects: [] })),
      findInterruptedGuestMove: vi.fn(async () => null),
      removeInterruptedGuestMove: vi.fn(async () => undefined),
    } satisfies SessionUseCases,
    overrides,
  );
}
