// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { PENDING_LOGIN_KEY } from "./oidcLogin";
import { SESSION_LOCK } from "./oidcSession";
import {
  CURRENT,
  DATABASE,
  DATABASE_VERSION,
  REGISTRATIONS,
  SESSIONS,
  type StoredSession,
} from "./oidcStore";

/** Every field of the stored session, so a field added or dropped fails the typecheck until noted here. */
const SESSION_FIELDS: Record<keyof StoredSession, null> = {
  issuer: null,
  client: null,
  redirectUrl: null,
  keys: null,
  webId: null,
  refreshToken: null,
};

/**
 * What a build with this sign-in client keeps in the browser, part of
 * the app's public API (docs/releasing.md#the-public-api): the
 * IndexedDB database a session is restored from, the sessionStorage key
 * a login under way waits under, and the Web Lock the session's writes
 * share. A line that goes, a key renamed or a database raised, is a
 * breaking change, which `npm run check:breaking` holds to a commit
 * that says so.
 */
it("keeps api/browser-storage/solid-memo-client.txt to what the browser keeps", async () => {
  const lines = [
    `indexedDB: ${DATABASE} version ${DATABASE_VERSION}, stores ${[REGISTRATIONS, SESSIONS].sort().join(", ")}`,
    `indexedDB: ${DATABASE} store ${REGISTRATIONS}, keyed by issuer and redirect URL`,
    `indexedDB: ${DATABASE} store ${SESSIONS}, under key ${CURRENT}: ${Object.keys(SESSION_FIELDS).sort().join(", ")}`,
    `sessionStorage: ${PENDING_LOGIN_KEY}`,
    `Web Locks: ${SESSION_LOCK}`,
  ];
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../api/browser-storage/solid-memo-client.txt",
  );
});
