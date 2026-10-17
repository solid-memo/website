// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { loggedByWebKit } from "./pageErrors.ts";

describe("loggedByWebKit", () => {
  it("knows WebKit's log of a fetch cut off on its way to another origin", () => {
    expect(
      loggedByWebKit(
        "Fetch API cannot load https://127.0.0.1:42299/j-c34b0ab4/solid-memo/main/ due to access control checks.\n    at jy (http://127.0.0.1:4173/assets/index.js:14:49353)",
      ),
    ).toBe(true);
  });

  it("leaves an error thrown in the page a page error", () => {
    expect(
      loggedByWebKit("TypeError: undefined is not an object\n    at render (index.js:1:2)"),
    ).toBe(false);
    expect(
      loggedByWebKit("Error: Fetch API cannot load the deck due to access control checks."),
    ).toBe(false);
  });
});
