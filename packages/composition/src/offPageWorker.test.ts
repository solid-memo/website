// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it, vi } from "vitest";
import { spawnOffPageWorker } from "./offPageWorker";

it("starts the worker the build bundles, as a module of its own", () => {
  const started: { url: string; options: WorkerOptions | undefined }[] = [];
  vi.stubGlobal(
    "Worker",
    class {
      constructor(url: string | URL, options?: WorkerOptions) {
        started.push({ url: String(url), options });
      }
    },
  );
  try {
    expect(spawnOffPageWorker()).toBeDefined();
    expect(started).toHaveLength(1);
    expect(started[0]!.url).toContain("offPageWorker");
    expect(started[0]!.options).toMatchObject({ type: "module" });
  } finally {
    vi.unstubAllGlobals();
  }
});
