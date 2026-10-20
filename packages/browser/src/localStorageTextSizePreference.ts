// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { TextSizePreference } from "@solid-memo/application/ports";
import { DEFAULT_TEXT_SIZE, isTextSize } from "@solid-memo/domain/textSize";

/** Also read by the script in index.html that sets the text size before the first paint. */
export const KEY = "solid-memo:textSize";

/**
 * The TextSizePreference in the browser's localStorage. Browser storage
 * may be missing or refuse (a private window, blocked site data), so
 * every access is guarded: without it the text is the browser's own
 * size. The default size is kept as no choice at all, which is how the
 * script in index.html reads it.
 */
export function createLocalStorageTextSizePreference(
  storage: () => Storage = () => globalThis.localStorage,
): TextSizePreference {
  return {
    chosen() {
      try {
        const stored = storage().getItem(KEY);
        return stored !== null && isTextSize(stored) ? stored : DEFAULT_TEXT_SIZE;
      } catch {
        return DEFAULT_TEXT_SIZE;
      }
    },
    choose(size) {
      try {
        if (size === DEFAULT_TEXT_SIZE) storage().removeItem(KEY);
        else storage().setItem(KEY, size);
      } catch {
        // Without storage the choice lasts until the page is left.
      }
    },
  };
}
