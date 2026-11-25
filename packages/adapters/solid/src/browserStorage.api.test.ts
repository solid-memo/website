// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { LOGIN_HASH_KEY, LOGIN_ISSUER_KEY, RESTORE_ATTEMPT_KEY } from "./solidSessionGateway";

/**
 * What this package keeps in the browser, part of the app's public API
 * (docs/releasing.md#the-public-api): the sessionStorage keys a login
 * keeps the page's route and the provider it went to under while the
 * identity provider has the tab, and a silent restore notes its attempt
 * under. The sign-in client's mark is the seam's
 * (semver-public-api-declaration/browser-storage/solid-client.txt), and the keys the Inrupt
 * library keeps are its own, not listed here. A line
 * that goes is a breaking change, which `npm run check:breaking` holds
 * to a commit that says so.
 */
it("keeps semver-public-api-declaration/browser-storage/solid.txt to what the browser keeps", async () => {
  const lines = [
    `sessionStorage: ${LOGIN_HASH_KEY}`,
    `sessionStorage: ${LOGIN_ISSUER_KEY}`,
    `sessionStorage: ${RESTORE_ATTEMPT_KEY}`,
  ];
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../../semver-public-api-declaration/browser-storage/solid.txt",
  );
});
