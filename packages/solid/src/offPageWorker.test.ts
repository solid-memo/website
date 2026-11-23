// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it, vi } from "vitest";

it("serves the jobs on the worker's own scope, which is its channel to the page", async () => {
  const posted = vi.fn();
  vi.stubGlobal("postMessage", posted);
  try {
    await import("./offPageWorker");
    globalThis.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "run", job: "none", input: null, config: {}, fetches: {}, budget: false },
      }),
    );
    await vi.waitFor(() => expect(posted).toHaveBeenCalled());
    expect(posted.mock.calls[0]![0]).toMatchObject({
      type: "failed",
      error: { message: "No job named none" },
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
