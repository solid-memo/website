// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { lwsBridge } from "@solid-memo/solid/lwsBridge";
import { closingConnections } from "./connections.ts";

const send = closingConnections(globalThis.fetch);

/**
 * Every request the tests make, to a pod or not, on a connection of its
 * own (connections.ts): before any test file is imported, so also where a
 * module keeps the fetch it was given. None follows a redirect, as none
 * the app sends with the user's credentials does (authFetch.ts), so a
 * server that answers a pod request with one fails here. A scripted login
 * reads each redirect it gets, by asking for "manual" (signedIn.ts). A request a
 * Linked Web Storage server does not take as the app makes it is made as
 * LWS has it, as the app's are (lwsBridge.ts, docs/lws.md); to any other
 * server it is sent as it is.
 */
const bridged = lwsBridge((input, init) =>
  send(input, { ...init, redirect: init?.redirect === "manual" ? "manual" : "error" }),
);

/**
 * With E2E_SEEDS_AS_LWS=1, for a run on a server that takes only LWS
 * (strictLws.ts): what a test writes with a plain PUT, as another app
 * writes its data, and the server answers 404, not there yet, is made
 * as LWS makes a resource, as the app makes a document (with
 * `If-None-Match: *`, which every creation of the app's sends). The
 * app's own requests are never so made again: none is a plain PUT of
 * something not there (docs/lws.md).
 */
const seedsAsLws = process.env.E2E_SEEDS_AS_LWS === "1";

globalThis.fetch = async (input, init) => {
  const response = await bridged(input, init);
  const headers = new Headers(init?.headers);
  if (
    !seedsAsLws ||
    init?.method !== "PUT" ||
    headers.has("If-None-Match") ||
    headers.has("If-Match") ||
    response.status !== 404
  )
    return response;
  headers.set("If-None-Match", "*");
  return bridged(input, { ...init, headers });
};
