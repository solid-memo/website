// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * An authenticated session with a Solid identity provider, or a guest's
 * (`guest: true`), who studies in a pod on their device before logging
 * in (domain/guest.ts).
 */
export interface Session {
  webId: string;
  guest?: true;
}

/**
 * How a session came about: "login" when the user just completed the
 * login redirect, "restored" when an earlier session was silently resumed.
 */
export type SessionOrigin = "login" | "restored";

/** A session together with how it was established. */
export interface EstablishedSession {
  session: Session;
  origin: SessionOrigin;
}
