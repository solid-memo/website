// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * What a Solid client gives for access: declarations alone, with no
 * body, which solid and the app are typechecked against. An import of
 * this module resolves to the module of the same name in the client
 * SOLID_CLIENT names (scripts/solidClient.ts): inrupt-client, the
 * default, or solid-memo-client. Both pass the contract in
 * packages/adapters/solid/src/testing/contract/access.ts, and are checked to
 * give every declaration here with its type (clientTypes.test.ts in
 * each). Where a description names "the library", it is the one the
 * default client is built on, whose behavior the app relies on.
 */

import type { GrantPublicRead } from "./interface";
export type { GrantPublicRead } from "./interface";
/**
 * The public-read grant (GrantPublicRead, interface.ts; the contract in
 * packages/adapters/solid/src/testing/contract/access.ts). It writes the
 * document's own ACL on a server with Web Access Control and its ACR on
 * one with Access Control Policies, for that document alone. It asks by URL, never with a Request, so a fence
 * around `fetch` (solidReleasePublisher.ts) can read where each goes.
 *
 * An ACR then says it governs the document (`acp:resource`), which the
 * library leaves as it finds it: the Community Solid Server applies no
 * ACR that doesn't, so its policies would change nothing. Saying so of
 * one that does already changes nothing.
 */
export declare const grantPublicRead: GrantPublicRead;
