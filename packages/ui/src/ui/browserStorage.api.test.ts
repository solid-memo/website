// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import {
  COLLAPSED_KEY,
  LEGACY_COLLAPSED_PREFIX,
  loginWebIdKey,
  type RecentLanguageKind,
  recentKey,
  webIdKey,
} from "./remembered";
import { DISMISSED_KEY } from "./DailyMessage";

/** Every kind of recent language, so a kind added or dropped fails the typecheck until noted here. */
const KINDS: Record<RecentLanguageKind, null> = { deck: null, own: null };

/**
 * What this package keeps in the browser, part of the app's public API
 * (docs/releasing.md#the-public-api): the localStorage keys, and the
 * sessionStorage key a WebID to remember waits under while the
 * identity provider has the tab. A line that goes, a key renamed, is a
 * breaking change, which
 * `npm run check:breaking` holds to a commit that says so.
 */
it("keeps semver-public-api-declaration/browser-storage/ui.txt to what the browser keeps", async () => {
  const lines = [
    ...(Object.keys(KINDS) as RecentLanguageKind[]).map(
      (kind) => `localStorage: ${recentKey(kind)}`,
    ),
    `localStorage: ${COLLAPSED_KEY}, by instance URL`,
    `localStorage: ${LEGACY_COLLAPSED_PREFIX}<instance URL>, read once into ${COLLAPSED_KEY} and removed`,
    `localStorage: ${webIdKey}, only when the learner asks for it`,
    `localStorage: ${DISMISSED_KEY}, the day the message of the day was hidden`,
    `sessionStorage: ${loginWebIdKey}, until the next page load`,
  ];
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../../semver-public-api-declaration/browser-storage/ui.txt",
  );
});
