// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createLocalStorageSeenHighlights } from "./localStorageSeenHighlights";

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

describe("createLocalStorageSeenHighlights", () => {
  it("keeps the ids seen", () => {
    const storage = memoryStorage();
    const highlights = createLocalStorageSeenHighlights(() => storage);
    expect(highlights.seen()).toBeNull();
    highlights.see(["landing-login"]);
    expect(highlights.seen()).toEqual(["landing-login"]);
    expect(storage.getItem("solid-memo:seenHighlights")).toBe('["landing-login"]');
    highlights.see([]);
    expect(highlights.seen()).toEqual([]);
  });

  it("forgets what is not a list of ids", () => {
    const storage = memoryStorage();
    const highlights = createLocalStorageSeenHighlights(() => storage);
    storage.setItem("solid-memo:seenHighlights", "{not json");
    expect(highlights.seen()).toBeNull();
    storage.setItem("solid-memo:seenHighlights", '{"landing-login":true}');
    expect(highlights.seen()).toBeNull();
    storage.setItem("solid-memo:seenHighlights", '["landing-login",7]');
    expect(highlights.seen()).toEqual(["landing-login"]);
  });

  it("does without storage", () => {
    const highlights = createLocalStorageSeenHighlights(() => {
      throw new Error("blocked");
    });
    expect(() => highlights.see(["landing-login"])).not.toThrow();
    expect(highlights.seen()).toBeNull();
  });

  it("uses the browser's localStorage by default", () => {
    createLocalStorageSeenHighlights().see(["landing-login"]);
    expect(globalThis.localStorage.getItem("solid-memo:seenHighlights")).toBe('["landing-login"]');
  });
});
