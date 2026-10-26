// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createAuthFetch, SESSION_EXPIRED_EVENT } from "./authFetch";
import { fakeSessionClient } from "./testing/fakeSessionClient";

describe("createAuthFetch", () => {
  it("delegates to the client's fetch", async () => {
    const client = fakeSessionClient();
    const response = new Response("ok");
    client.fetch.mockResolvedValue(response);

    const result = await createAuthFetch(client)("https://pod.example/resource", {
      method: "HEAD",
    });

    expect(result).toBe(response);
    expect(client.fetch).toHaveBeenCalledWith("https://pod.example/resource", {
      method: "HEAD",
    });
  });

  it("announces expired sessions on a 401 response", async () => {
    const client = fakeSessionClient();
    client.fetch.mockResolvedValue(new Response(null, { status: 401 }));
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    await createAuthFetch(client)("https://pod.example/resource");

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it("stays silent on non-401 responses", async () => {
    const client = fakeSessionClient();
    client.fetch.mockResolvedValue(new Response(null, { status: 403 }));
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    await createAuthFetch(client)("https://pod.example/resource");

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });
});
