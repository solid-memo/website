// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DeviceChoices } from "./deviceChoices";

export interface WhatsNewUseCases {
  /**
   * The highlights of `ids` (newest first) this browser has not shown,
   * in the order given. A first visit, with none kept, is spared them
   * all: they are kept as seen and none is shown.
   */
  unseenHighlights(ids: readonly string[]): string[];
  /**
   * Keeps `ids` as seen, so none of them is shown again, beside those
   * already kept: a tab still on an older version, which knows fewer,
   * does not bring back those a newer one dismissed.
   */
  dismissHighlights(ids: readonly string[]): void;
}

/** The highlights of new versions a user is shown, once, on this browser. */
export function createWhatsNewUseCases({
  seenHighlights,
}: Pick<DeviceChoices, "seenHighlights">): WhatsNewUseCases {
  return {
    unseenHighlights(ids) {
      const seen = seenHighlights.read();
      if (seen === null) {
        seenHighlights.write([...ids]);
        return [];
      }
      return ids.filter((id) => !seen.includes(id));
    },
    dismissHighlights(ids) {
      seenHighlights.write([...new Set([...(seenHighlights.read() ?? []), ...ids])]);
    },
  };
}
