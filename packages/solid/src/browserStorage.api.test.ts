// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { LOGIN_HASH_KEY } from "./solidSessionGateway";

/**
 * What this package keeps in the browser, part of the app's public API
 * (docs/releasing.md#the-public-api): the sessionStorage key a login
 * keeps the page's route under while the identity provider has the tab.
 * The keys the Inrupt client keeps are its own, not listed here. A line
 * that goes is a breaking change, which `npm run check:breaking` holds
 * to a commit that says so.
 */
it("keeps api/browser-storage/solid.txt to what the browser keeps", async () => {
  const lines = [`sessionStorage: ${LOGIN_HASH_KEY}`];
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../api/browser-storage/solid.txt",
  );
});
