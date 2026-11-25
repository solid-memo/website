// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * What a Solid client gives for session: declarations alone, with no
 * body, which solid and the app are typechecked against. An import of
 * this module resolves to the module of the same name in the client
 * SOLID_CLIENT names (scripts/solidClient.ts): inrupt-client, the
 * default, or solid-memo-client. Both pass the contract in
 * packages/adapters/solid/src/testing/contract/session.ts, and are checked to
 * give every declaration here with its type (clientTypes.test.ts in
 * each). Where a description names "the library", it is the one the
 * default client is built on, whose behavior the app relies on.
 */

import type { SessionClient } from "./interface";
/** The sign-in client (SessionClient, interface.ts). */
export type { SessionClient } from "./interface";
/** The sign-in client, on the client's own session. */
export declare function createSessionClient(): SessionClient;
