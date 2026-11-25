// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * sessionStorage: this tab has left for the identity provider, to log in
 * or to restore a session silently, and expects it to send the user
 * back. A provider's answer on the page's URL is handed to the library
 * only then, and only when its `state` is one the library sent: it takes
 * any `code` and `state`, or `error`, it finds there for a redirect to
 * complete, and ends the stored session when that fails, so an answer
 * to no request of this tab's would log the user out. In a module of
 * its own, not session.ts, so the key stays the same whichever client
 * SOLID_CLIENT puts in place of session.ts (scripts/solidClient.ts).
 */
export const PROVIDER_REDIRECT_KEY = "solid-memo:provider-redirect";
