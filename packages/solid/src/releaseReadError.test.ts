// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { linkedReleasesTooLarge } from "./releaseReadError";

describe("linkedReleasesTooLarge", () => {
  it("names the host the releases are published on", () => {
    expect(linkedReleasesTooLarge("https://bob.example/v2.ttl")).toMatchObject({
      code: "linkedReleasesTooLarge",
      vars: { host: "bob.example" },
    });
  });

  it("names the link itself when no URL parser takes it, as it names no host", () => {
    expect(linkedReleasesTooLarge("http://[x")).toMatchObject({
      code: "linkedReleasesTooLarge",
      vars: { host: "http://[x" },
    });
  });
});
