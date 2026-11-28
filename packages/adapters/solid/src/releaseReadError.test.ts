// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import { linkedReleasesTooLarge, releaseReadError } from "./releaseReadError";

describe("releaseReadError", () => {
  it.each(["podNoAnswer", "podBusy"] as const)(
    "passes %s on as it is, as a server that may answer when tried again",
    (code) => {
      const error = new AppError(code, { host: "bob.example", seconds: 30 });
      expect(releaseReadError("https://bob.example/v2.ttl", error)).toBe(error);
    },
  );

  it("shows any other failure as a release that can't be read", () => {
    expect(releaseReadError("https://bob.example/v2.ttl", new TypeError("x"))).toMatchObject({
      code: "releaseUnreadable",
    });
  });
});

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
