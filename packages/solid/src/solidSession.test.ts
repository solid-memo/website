// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it, vi } from "vitest";
import { createSolidSession } from "./solidSession";
import { fakeSessionClient } from "./testing/fakeSessionClient";

it("logs in and fetches through one sign-in client", async () => {
  const client = fakeSessionClient();
  client.fetch.mockResolvedValue(new Response(null, { status: 401 }));
  const expired = vi.fn();

  client.webId.mockReturnValue("https://alice.example/profile/card#me");

  const { sessionGateway, fetch, webId } = createSolidSession(client, {
    clientName: "Test App",
    site: "https://memo.example/",
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
  expect(client.fetch).toHaveBeenCalledWith("https://pod.example/resource", undefined);
  expect(expired).toHaveBeenCalledOnce();
  expect(webId()).toBe("https://alice.example/profile/card#me");
});
