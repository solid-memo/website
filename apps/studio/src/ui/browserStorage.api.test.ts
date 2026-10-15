// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import {
  DEFAULT_PREFS,
  INSTANCE_KEY,
  NO_INSTANCE_PREFS,
  PREFS_KEY,
  RECENT_KEY,
} from "./shell/prefs";

/**
 * What the Studio keeps in the browser, part of the app's public API
 * (docs/releasing.md#the-public-api): the localStorage keys, and the
 * fields of the layout and of each instance's preferences kept under
 * them. A line that goes, a key or a field renamed, is a breaking
 * change, which `npm run check:breaking` holds to a commit that says
 * so; a new shape of the preferences takes a new key instead.
 */
it("keeps api/browser-storage/studio.txt to what the browser keeps", async () => {
  const lines = [
    ...Object.keys(DEFAULT_PREFS).map((field) => `localStorage: ${PREFS_KEY}, field ${field}`),
    `localStorage: ${RECENT_KEY}`,
    ...Object.keys(NO_INSTANCE_PREFS).map(
      (field) => `localStorage: ${INSTANCE_KEY}, by instance URL, field ${field}`,
    ),
  ];
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../../api/browser-storage/studio.txt",
  );
});
