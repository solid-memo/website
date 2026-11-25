// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { PROVIDER_REDIRECT_KEY } from "./providerRedirect";

/**
 * What the seam keeps in the browser, part of the app's public API
 * (docs/releasing.md#the-public-api): the sessionStorage key either
 * client's sign-in marks the tab under while the identity provider has
 * it. A line that goes is a breaking change, which
 * `npm run check:breaking` holds to a commit that says so.
 */
it("keeps api/browser-storage/solid-client.txt to what the browser keeps", async () => {
  await expect(`sessionStorage: ${PROVIDER_REDIRECT_KEY}\n`).toMatchFileSnapshot(
    "../../../api/browser-storage/solid-client.txt",
  );
});
