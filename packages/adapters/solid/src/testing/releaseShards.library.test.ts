// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { libraryReleases } from "./releaseDrafts";
import { libraryReleaseShards, ROUND_TRIP_FILES } from "./releaseShards";

// It reads the whole library, so it runs in the round trip's task
// (vitest.roundtrip.config.ts), not in the unit tests'.
describe("libraryReleaseShards", () => {
  it("takes every release of the library once", () => {
    const shards = libraryReleaseShards();
    expect(shards).toHaveLength(ROUND_TRIP_FILES);
    for (const shard of shards) expect(shard.length).toBeGreaterThan(0);
    expect(shards.flat().sort()).toEqual(libraryReleases());
  });
});
