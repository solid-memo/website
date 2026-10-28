// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

/*
 * The service worker at the old journeys' report's trace viewer's address,
 * /journeys/trace/sw.bundle.js (public/journeys/trace/sw.bundle.js,
 * docs/deployment.md#the-journeys-report): the update a browser with the
 * viewer's worker still registered fetches, which unregisters itself.
 */

const SITE = "https://solid-memo.com/";
const script = readFileSync(
  resolve(import.meta.dirname, "../public/journeys/trace/sw.bundle.js"),
  "utf8",
);

/** The worker's listeners, run against a stand-in for its global scope. */
function worker(clients: { url: string; navigate: (url: string) => Promise<unknown> }[]) {
  const listeners = new Map<string, (event: unknown) => void>();
  const scope = {
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      listeners.set(type, listener),
    skipWaiting: vi.fn(async () => {}),
    registration: { unregister: vi.fn(async () => true) },
    clients: { matchAll: vi.fn(async () => clients) },
  };
  new Function("self", script)(scope);
  return { scope, listeners };
}

/** Runs the worker's activation, as the browser does once it is installed. */
async function activate(listeners: Map<string, (event: unknown) => void>): Promise<unknown> {
  let done: Promise<unknown> | undefined;
  listeners.get("activate")!({ waitUntil: (promise: Promise<unknown>) => (done = promise) });
  return done;
}

describe("the old journeys' report's trace worker", () => {
  it("takes over from the viewer's worker as soon as it is installed", () => {
    const { scope, listeners } = worker([]);
    listeners.get("install")!({});
    expect(scope.skipWaiting).toHaveBeenCalledOnce();
  });

  it("unregisters itself, then reloads the pages it controlled", async () => {
    const page = {
      url: `${SITE}journeys/trace/snapshot/page@1`,
      navigate: vi.fn(async () => null),
    };
    const { scope, listeners } = worker([page]);
    await activate(listeners);
    expect(scope.registration.unregister).toHaveBeenCalledOnce();
    expect(scope.clients.matchAll).toHaveBeenCalledWith({ type: "window" });
    expect(page.navigate).toHaveBeenCalledWith(page.url);
    expect(scope.registration.unregister.mock.invocationCallOrder[0]).toBeLessThan(
      page.navigate.mock.invocationCallOrder[0]!,
    );
  });

  it("still finishes when a page will not reload", async () => {
    const page = {
      url: `${SITE}journeys/trace/index.html`,
      navigate: vi.fn(async () => {
        throw new TypeError("not a window client of this worker");
      }),
    };
    const { listeners } = worker([page]);
    await expect(activate(listeners)).resolves.toBeDefined();
  });

  it("answers no request, so every request goes to the site", () => {
    expect(worker([]).listeners.has("fetch")).toBe(false);
  });
});
