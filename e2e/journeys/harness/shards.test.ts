// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { argumentsOf, durationsOf, type Journey, journeysOf, keyOf, shard } from "./shards.ts";

const journey = (file: string, line: number, title = `${file} at ${line}`): Journey => ({
  file,
  line,
  title,
});

describe("journeysOf", () => {
  it("reads every journey of the listing, in nested suites too", () => {
    expect(
      journeysOf({
        suites: [
          { specs: [{ file: "a.journey.ts", line: 9, title: "a" }] },
          { suites: [{ specs: [{ file: "b.journey.ts", line: 20, title: "b" }] }] },
        ],
      }),
    ).toEqual([journey("a.journey.ts", 9, "a"), journey("b.journey.ts", 20, "b")]);
    expect(journeysOf({})).toEqual([]);
  });
});

describe("shard", () => {
  const long = journey("long.journey.ts", 1);
  const middle = journey("middle.journey.ts", 1);
  const short = [1, 2, 3, 4].map((line) => journey("short.journey.ts", line));
  const durations = {
    [keyOf(long)]: 100,
    [keyOf(middle)]: 60,
    ...Object.fromEntries(short.map((each) => [keyOf(each), 20])),
  };

  it("puts the longest first, each into the shard with the least time so far", () => {
    const shards = shard([...short, middle, long], durations, 2);
    expect(shards).toEqual([
      [long, short[2]],
      [middle, short[0], short[1], short[3]],
    ]);
  });

  it("keeps the journeys of a serial file together", () => {
    const shards = shard([...short, middle, long], durations, 2, new Set(["short.journey.ts"]));
    expect(shards).toEqual([[long], [short[0], short[1], short[2], short[3], middle]]);
  });

  it("counts a journey with no time yet as the median of those with one, and one with none at all as one second", () => {
    const fresh = journey("fresh.journey.ts", 1);
    // The median of 100, 60 and 20 is 60: fresh ties with middle, and goes first by its name.
    expect(shard([long, middle, short[0]!, fresh], durations, 2)).toEqual([
      [long, short[0]],
      [fresh, middle],
    ]);
    expect(shard([fresh, journey("other.journey.ts", 1)], {}, 3)).toEqual([
      [fresh],
      [journey("other.journey.ts", 1)],
      [],
    ]);
  });

  it("holds every journey exactly once, whatever the count", () => {
    for (const count of [1, 2, 3, 7]) {
      const placed = shard([...short, middle, long], durations, count).flat();
      expect(placed.map(keyOf).sort()).toEqual([...short, middle, long].map(keyOf).sort());
    }
  });

  it("refuses two journeys with the same file and title, which durations.json could not tell apart", () => {
    expect(() => shard([long, { ...long, line: 2 }], durations, 2)).toThrow(/exactly once/);
  });
});

describe("argumentsOf", () => {
  it("names each journey by its file under journeys/ and its line", () => {
    expect(argumentsOf([journey("a.journey.ts", 9), journey("b.journey.ts", 20)])).toEqual([
      "journeys/a.journey.ts:9",
      "journeys/b.journey.ts:20",
    ]);
  });
});

describe("durationsOf", () => {
  it("takes each journey's last try in the project, in whole seconds, sorted by key", () => {
    expect(
      durationsOf(
        {
          suites: [
            {
              specs: [
                {
                  file: "b.journey.ts",
                  title: "b",
                  tests: [
                    { projectName: "chromium", results: [{ duration: 12_400 }] },
                    { projectName: "phone", results: [{ duration: 90_000 }] },
                  ],
                },
              ],
              suites: [
                {
                  specs: [
                    {
                      file: "a.journey.ts",
                      title: "a",
                      tests: [{ projectName: "chromium", results: [{ duration: 200 }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        "chromium",
      ),
    ).toEqual({ "a.journey.ts › a": 1, "b.journey.ts › b": 12 });
    expect(durationsOf({}, "chromium")).toEqual({});
  });

  it("has a time for every journey durations.json was last written from, each a whole number of seconds", () => {
    const durations = JSON.parse(
      readFileSync(new URL("../durations.json", import.meta.url), "utf8"),
    ) as Record<string, number>;
    expect(Object.keys(durations).length).toBeGreaterThan(0);
    for (const seconds of Object.values(durations)) expect(Number.isInteger(seconds)).toBe(true);
  });
});
