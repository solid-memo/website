// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { collapsedKey, type RecentLanguageKind, recentKey } from "./remembered";

/** Every kind of recent language, so a kind added or dropped fails the typecheck until noted here. */
const KINDS: Record<RecentLanguageKind, null> = { deck: null, own: null };

/**
 * What this package keeps in the browser, part of the app's public API
 * (docs/releasing.md#the-public-api): the localStorage keys. A line that
 * goes, a key renamed, is a breaking change, which
 * `npm run check:breaking` holds to a commit that says so.
 */
it("keeps api/browser-storage/ui.txt to what the browser keeps", async () => {
  const lines = [
    ...(Object.keys(KINDS) as RecentLanguageKind[]).map(
      (kind) => `localStorage: ${recentKey(kind)}`,
    ),
    `localStorage: ${collapsedKey("<instance URL>")}`,
  ];
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../../api/browser-storage/ui.txt",
  );
});
