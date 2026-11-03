// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type ScreenName, TOUR_ONLY, TOURS, unchecked } from "./screens.ts";

const journeys = new URL("../journeys/", import.meta.url);
/** The screens the journeys' steps name, the tours left out. */
const named = new Set(
  readdirSync(journeys)
    .filter((file) => file.endsWith(".journey.ts") && !file.startsWith("tour-"))
    .flatMap((file) =>
      [...readFileSync(new URL(file, journeys), "utf8").matchAll(/screen: "([^"]+)"/g)].map(
        (match) => match[1]!,
      ),
    ),
);

describe("TOURS", () => {
  it("puts each screen in one tour only", () => {
    const all = Object.values(TOURS).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it("lists as tour-only exactly the screens no journey's step ends on", () => {
    const all: ScreenName[] = Object.values(TOURS).flat();
    expect(all.filter((screen) => !named.has(screen)).sort()).toEqual([...TOUR_ONLY].sort());
  });
});

describe("unchecked", () => {
  it("names a tour's screens not checked yet, in the tour's order", () => {
    expect(unchecked("errors", new Set(["crash"]))).toEqual([
      "studio.draft.refused",
      "studio.draft.release-refused",
    ]);
    expect(unchecked("errors", new Set(TOURS.errors))).toEqual([]);
  });
});
