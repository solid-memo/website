// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { closingConnections } from "./connections.ts";

const send = closingConnections(globalThis.fetch);

/**
 * Every request the tests make, to a pod or not, on a connection of its
 * own (connections.ts): before any test file is imported, so also where a
 * module keeps the fetch it was given. None follows a redirect, as none
 * the app sends with the user's credentials does (authFetch.ts), so a
 * server that answers a pod request with one fails here.
 */
globalThis.fetch = (input, init) => send(input, { ...init, redirect: "error" });
