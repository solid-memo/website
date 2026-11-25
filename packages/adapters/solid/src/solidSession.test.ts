// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it, vi } from "vitest";
import { createSolidSession } from "./solidSession";
import { fakeSessionClient } from "./testing/fakeSessionClient";

const ALICE = "https://alice.example/profile/card#me";
const INVALID = { "WWW-Authenticate": 'DPoP error="invalid_token"' };

it("logs in and fetches through one sign-in client", async () => {
  const client = fakeSessionClient();
  client.fetch.mockResolvedValue(new Response(null, { status: 401, headers: INVALID }));
  const expired = vi.fn();
  const ownStorages = vi.fn(async () => ["https://pod.example/"]);

  client.webId.mockReturnValue(ALICE);

  const { sessionGateway, fetch, webId } = createSolidSession(client, {
    clientName: "Test App",
    site: "https://memo.example/",
    ownStorages,
  });
  const unsubscribe = sessionGateway.onSessionExpired(expired);
  await sessionGateway.loginWithIssuer("https://issuer.example");
  await fetch("https://pod.example/resource");
  unsubscribe();

  expect(client.login).toHaveBeenCalledWith({
    oidcIssuer: "https://issuer.example",
    redirectUrl: "https://memo.example/",
    clientName: "Test App",
  });
  expect(client.fetch).toHaveBeenCalledWith("https://pod.example/resource", { redirect: "error" });
  expect(ownStorages).toHaveBeenCalledWith(ALICE);
  expect(expired).toHaveBeenCalledOnce();
  expect(webId()).toBe(ALICE);
});

it("says nothing of an expired session after the user logged out", async () => {
  const client = fakeSessionClient();
  client.webId.mockReturnValue(ALICE);
  client.logout.mockImplementation(async () => {
    client.webId.mockReturnValue(undefined);
  });
  const expired = vi.fn();
  const { sessionGateway, fetch } = createSolidSession(client, {
    clientName: "Test App",
    site: "https://memo.example/",
  });
  const unsubscribe = sessionGateway.onSessionExpired(expired);
  await fetch("https://pod.example/resource");

  await sessionGateway.logout();
  client.fetch.mockResolvedValue(new Response(null, { status: 401 }));
  await fetch("https://pod.example/resource");
  unsubscribe();

  expect(client.logout).toHaveBeenCalledOnce();
  expect(expired).not.toHaveBeenCalled();
});
