// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { getDefaultSession } from "@inrupt/solid-client-authn-browser";
import { authFetch, SESSION_EXPIRED_EVENT } from "./authFetch";

vi.mock("@inrupt/solid-client-authn-browser");

describe("authFetch", () => {
  it("delegates to the current default session's fetch", async () => {
    const response = new Response("ok");
    const sessionFetch = vi.fn(async () => response);
    vi.mocked(getDefaultSession).mockReturnValue({
      fetch: sessionFetch,
    } as never);

    const result = await authFetch("https://pod.example/resource", {
      method: "HEAD",
    });

    expect(result).toBe(response);
    expect(sessionFetch).toHaveBeenCalledWith("https://pod.example/resource", {
      method: "HEAD",
    });
  });

  it("announces expired sessions on a 401 response", async () => {
    vi.mocked(getDefaultSession).mockReturnValue({
      fetch: vi.fn(async () => new Response(null, { status: 401 })),
    } as never);
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    await authFetch("https://pod.example/resource");

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it("stays silent on non-401 responses", async () => {
    vi.mocked(getDefaultSession).mockReturnValue({
      fetch: vi.fn(async () => new Response(null, { status: 403 })),
    } as never);
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    await authFetch("https://pod.example/resource");

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });
});
