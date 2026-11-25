// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { numberedIds, Slugger, slug } from "./slug.ts";

describe("slug", () => {
  it("makes GitHub's id of a heading's text", () => {
    expect(slug("VITE_REPO_URL")).toBe("vite_repo_url");
    expect(slug("1. Fork or clone")).toBe("1-fork-or-clone");
    expect(slug("10. Use plain English")).toBe("10-use-plain-english");
    expect(slug("The diagrams' font")).toBe("the-diagrams-font");
    expect(slug("Keys and screen readers — again")).toBe("keys-and-screen-readers--again");
    expect(slug("Ångström and 한국어")).toBe("ångström-and-한국어");
  });
});

describe("Slugger", () => {
  it("refuses an id the page already has", () => {
    const slugger = new Slugger();
    expect(slugger.take("Limits")).toBe("limits");
    expect(slugger.take("Chunks")).toBe("chunks");
    expect(slugger.take("limits")).toBeNull();
  });
});

describe("numberedIds", () => {
  it("numbers a repeated id as GitHub does, skipping one a heading already has", () => {
    expect(numberedIds(["Features", "Bug Fixes", "Features", "Features 1", "Features"])).toEqual([
      "features",
      "bug-fixes",
      "features-1",
      "features-1-1",
      "features-2",
    ]);
  });
});
