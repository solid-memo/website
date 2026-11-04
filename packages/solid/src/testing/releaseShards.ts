// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DECKS_ROOT } from "@solid-memo/vocab/tooling/root";
import { draftPod, libraryReleases, roundTrip } from "./releaseDrafts";

/**
 * The round trip of every library release is split into this many files,
 * `releaseDrafts.<n>.roundtrip.test.ts` for n from 1, so that Vitest runs
 * them on as many workers: it runs a file's tests one after another.
 */
export const ROUND_TRIP_FILES = 4;

/**
 * `items` dealt into `count` shards of about the same weight: the
 * heaviest first, each to the lightest shard so far (the first of
 * equals), items of equal weight in their order by name. Each item is in
 * exactly one shard, and each shard is sorted by name.
 */
export function balancedShards(
  items: readonly string[],
  count: number,
  weight: (item: string) => number,
): string[][] {
  const shards = Array.from({ length: count }, () => ({ items: [] as string[], weight: 0 }));
  const weighed = items.map((item) => ({ item, weight: weight(item) }));
  weighed.sort((a, b) => b.weight - a.weight || (a.item < b.item ? -1 : 1));
  for (const { item, weight: w } of weighed) {
    const lightest = shards.reduce((best, shard) => (shard.weight < best.weight ? shard : best));
    lightest.items.push(item);
    lightest.weight += w;
  }
  return shards.map((shard) => shard.items.sort());
}

/** The library's releases (libraryReleases) in ROUND_TRIP_FILES shards balanced by their files' size. */
export function libraryReleaseShards(): string[][] {
  return balancedShards(
    libraryReleases(),
    ROUND_TRIP_FILES,
    (path) => statSync(join(DECKS_ROOT, path)).size,
  );
}

/** The round trip of each release of shard `n` (from 1) of libraryReleaseShards. */
export function describeRoundTrips(n: number): void {
  describe.each(libraryReleaseShards()[n - 1]!)("decks/%s", (path) => {
    it("comes back whole as a draft published again", { timeout: 60_000 }, async () => {
      const { release, assembled } = await roundTrip(await draftPod(), path);
      expect(assembled).toEqual(release);
    });
  });
}
