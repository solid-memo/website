// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { libraryReleases } from "./releaseDrafts";
import { balancedShards, libraryReleaseShards, ROUND_TRIP_FILES } from "./releaseShards";

const weights: Record<string, number> = { a: 5, b: 4, c: 3, d: 3, e: 2, f: 1 };
const weightOf = (item: string) => weights[item]!;

describe("balancedShards", () => {
  it("deals the heaviest first, each to the lightest shard so far", () => {
    expect(balancedShards(["f", "e", "d", "c", "b", "a"], 2, weightOf)).toEqual([
      ["a", "d", "f"],
      ["b", "c", "e"],
    ]);
  });

  it("deals the same however the items come", () => {
    const items = Object.keys(weights);
    const once = balancedShards(items, 3, weightOf);
    expect(balancedShards([...items].reverse(), 3, weightOf)).toEqual(once);
    expect(once).toEqual([
      ["a", "f"],
      ["b", "e"],
      ["c", "d"],
    ]);
  });

  it("leaves a shard empty when there are fewer items than shards", () => {
    expect(balancedShards(["a"], 2, weightOf)).toEqual([["a"], []]);
  });
});

describe("libraryReleaseShards", () => {
  it("takes every release of the library once", () => {
    const shards = libraryReleaseShards();
    expect(shards).toHaveLength(ROUND_TRIP_FILES);
    for (const shard of shards) expect(shard.length).toBeGreaterThan(0);
    expect(shards.flat().sort()).toEqual(libraryReleases());
  });

  it("has a round-trip file for each shard, and none more", () => {
    const src = join(import.meta.dirname, "..");
    const files = readdirSync(src).filter((file) => file.includes(".roundtrip.test."));
    const expected = Array.from(
      { length: ROUND_TRIP_FILES },
      (_, i) => `releaseDrafts.${i + 1}.roundtrip.test.ts`,
    );
    expect(files.sort()).toEqual(expected);
    for (const [i, file] of expected.entries()) {
      expect(readFileSync(join(src, file), "utf8")).toContain(`describeRoundTrips(${i + 1});`);
    }
  });
});
