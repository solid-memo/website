// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The shape check of a release lets the page do its work between
 * subjects with many values, so the longest task it holds the page for
 * doesn't grow with the release: eight times the cards must not hold it
 * much longer at a stretch (testing.md). Timed in this process's CPU
 * time, without coverage, as every growth test is.
 */
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { turtleFetch } from "@solid-memo/shacl/testing/turtle";
import { expect, it, vi } from "vitest";
import type { Dataset } from "./client/rdf";
import { limitedFetch, RELEASE_LIMITS } from "./client/readLimits";
import { getSolidDatasetLinear } from "./client/resources";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { SM_NS } from "./vocab";

/**
 * The longest stretch, in microseconds of this process's CPU time, that
 * `work` holds the event loop without letting anything else run: the
 * longest gap between turns of a task that schedules itself again at each
 * turn. Time on the clock would count the waits for the processor too: on
 * a runner busy with other tests, a long run is all but sure to wait during
 * one of its stretches where a short one may not (growth.ts).
 */
async function longestTask(work: () => Promise<unknown>): Promise<number> {
  let last = process.cpuUsage();
  let longest = 0;
  let running = true;
  const gap = () => {
    const { user, system } = process.cpuUsage(last);
    last = process.cpuUsage();
    return user + system;
  };
  const turn = () => {
    longest = Math.max(longest, gap());
    if (running) setImmediate(turn);
  };
  setImmediate(turn);
  await work();
  running = false;
  return Math.max(longest, gap());
}

const release = "https://alice.example/releases/fronts/v1.ttl";
/** A release of `count` cards, each with `fronts` fronts, each in a language of its own. */
const cards = (count: number, fronts: number) =>
  [
    `@prefix sm: <${SM_NS}> .`,
    ...Array.from(
      { length: count },
      (_, c) =>
        `<#c${c}> a sm:Card ; sm:formatVersion 7 ; sm:back "b"@en ; sm:front ${Array.from(
          { length: fronts },
          (_, i) => `"t"@x-${i.toString(36)}`,
        ).join(", ")} .`,
    ),
  ].join("\n");
/** A release read as one from a link is. */
const read = (text: string) =>
  getSolidDatasetLinear(release, { fetch: limitedFetch(turtleFetch(text), RELEASE_LIMITS) });
const validator = createShaclShapeValidator({
  fetch: vi.fn() as unknown as typeof fetch,
  shapesFetch,
  ...SHAPE_SOURCES,
});

it("lets the page do its work between subjects with many values, so the longest task does not grow with the release", async () => {
  // Cards of many values each, far fewer than the subjects a check goes
  // through between tasks: eight times the cards must not hold the page
  // much longer at a stretch (testing.md).
  const datasets = new Map<number, Dataset>();
  for (const count of [4, 32]) datasets.set(count, await read(cards(count, 1024)));
  const longest = async (count: number) => {
    let best = Number.POSITIVE_INFINITY;
    for (let run = 0; run < 3; run++) {
      best = Math.min(
        best,
        await longestTask(() =>
          validator.validateDataset(release, datasets.get(count)!, "library"),
        ),
      );
    }
    return best;
  };
  await longest(4);
  expect((await longest(32)) / (await longest(4))).toBeLessThan(2.5);
}, 180_000);
