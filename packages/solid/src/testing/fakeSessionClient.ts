// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { RestoredSession, SessionClient } from "../client/session";

/**
 * A sign-in client for tests: restore finds no one until a test says
 * otherwise, login and logout only record their calls, and fetch answers
 * 200 unless a test gives it another implementation, and no one is
 * logged in.
 */
export function fakeSessionClient() {
  const restored: RestoredSession = { webId: null, fromLogin: false, restoredFrom: null };
  return {
    restore: vi.fn<SessionClient["restore"]>(async () => restored),
    login: vi.fn<SessionClient["login"]>(async () => {}),
    logout: vi.fn<SessionClient["logout"]>(async () => {}),
    fetch: vi.fn<SessionClient["fetch"]>(async () => new Response("ok")),
    webId: vi.fn<SessionClient["webId"]>(() => undefined),
  } satisfies SessionClient;
}
