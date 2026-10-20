// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { unregisterJourneysWorkers } from "./journeysWorkers";

function registration(scope: string) {
  return { scope, unregister: vi.fn(async () => true) } as unknown as ServiceWorkerRegistration;
}

function container(registrations: readonly ServiceWorkerRegistration[]) {
  return { getRegistrations: vi.fn(async () => registrations) };
}

describe("unregisterJourneysWorkers", () => {
  it("unregisters the trace viewer's worker under journeys/, and no other", async () => {
    const viewer = registration("https://solid-memo.com/journeys/trace/");
    const other = registration("https://solid-memo.com/studio/");
    await unregisterJourneysWorkers(container([viewer, other]), "https://solid-memo.com/");
    expect(viewer.unregister).toHaveBeenCalledOnce();
    expect(other.unregister).not.toHaveBeenCalled();
  });

  it("looks under the folder the site is served from", async () => {
    const viewer = registration("https://example.github.io/solid-memo/journeys/trace/");
    const atRoot = registration("https://example.github.io/journeys/trace/");
    await unregisterJourneysWorkers(
      container([viewer, atRoot]),
      "https://example.github.io/solid-memo/",
    );
    expect(viewer.unregister).toHaveBeenCalledOnce();
    expect(atRoot.unregister).not.toHaveBeenCalled();
  });

  it("does nothing in a browser without service workers", async () => {
    await expect(
      unregisterJourneysWorkers(undefined, "https://solid-memo.com/"),
    ).resolves.toBeUndefined();
  });

  it("does not stop the app when the browser will not list its workers", async () => {
    const refusing = {
      getRegistrations: vi.fn(async () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      }),
    };
    await expect(
      unregisterJourneysWorkers(refusing, "https://solid-memo.com/"),
    ).resolves.toBeUndefined();
  });
});
