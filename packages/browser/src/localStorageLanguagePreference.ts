// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { LanguagePreference } from "@solid-memo/application/ports";
import { localeOf } from "@solid-memo/domain/locale";

const KEY = "solid-memo:language";

/**
 * The LanguagePreference in the browser's localStorage. Browser storage
 * may be missing or refuse (a private window, blocked site data), so
 * every access is guarded: without it the app speaks the browser's
 * language.
 */
export function createLocalStorageLanguagePreference(
  storage: () => Storage = () => globalThis.localStorage,
): LanguagePreference {
  return {
    chosen() {
      try {
        const stored = storage().getItem(KEY);
        return stored === null ? null : localeOf(stored);
      } catch {
        return null;
      }
    },
    choose(locale) {
      try {
        storage().setItem(KEY, locale);
      } catch {
        // Without storage the choice lasts until the page is left.
      }
    },
  };
}
