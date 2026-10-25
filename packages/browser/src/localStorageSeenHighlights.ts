// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { SeenHighlights } from "@solid-memo/application/ports";

/** A JSON array of the ids of the highlights seen. */
export const KEY = "solid-memo:seenHighlights";

/**
 * The SeenHighlights in the browser's localStorage. Browser storage may
 * be missing or refuse (a private window, blocked site data), so every
 * access is guarded: without it, or with something else kept under the
 * key, none is kept, and each visit is a first one, which shows nothing.
 */
export function createLocalStorageSeenHighlights(
  storage: () => Storage = () => globalThis.localStorage,
): SeenHighlights {
  return {
    seen() {
      let stored: unknown;
      try {
        stored = JSON.parse(storage().getItem(KEY) ?? "null");
      } catch {
        return null;
      }
      return Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === "string")
        : null;
    },
    see(ids) {
      try {
        storage().setItem(KEY, JSON.stringify(ids));
      } catch {
        // Without storage the highlights are spared until the page is left.
      }
    },
  };
}
