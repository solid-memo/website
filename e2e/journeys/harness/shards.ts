// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Chromium's journeys split into shards of about the same time, for the
 * CI jobs that run them side by side (docs/testing.md#browsers).
 * Playwright's own --shard splits them by count, so the shard with the
 * longest journeys was the run's last to end. The time each journey took
 * is in durations.json; one not there yet counts as the median of
 * those that are.
 */

/** A journey as Playwright lists it: its file, under journeys/, its line and its title. */
export interface Journey {
  file: string;
  line: number;
  title: string;
}

/** What `playwright test --list --reporter=json` prints, as far as it is read here. */
export interface Listing {
  suites?: ListedSuite[];
}
interface ListedSuite {
  specs?: { file: string; line: number; title: string }[];
  suites?: ListedSuite[];
}

/** Every journey the listing holds, in its order. */
export function journeysOf(listing: Listing): Journey[] {
  const walk = (suites: ListedSuite[] = []): Journey[] =>
    suites.flatMap((suite) => [
      ...(suite.specs ?? []).map(({ file, line, title }) => ({ file, line, title })),
      ...walk(suite.suites),
    ]);
  return walk(listing.suites);
}

/** The key a journey's time is kept under in durations.json: its file and its title. */
export const keyOf = (journey: Journey) => `${journey.file} › ${journey.title}`;

/**
 * The journeys in `count` shards, each about as long as the others: the
 * longest first, each into the shard with the least time so far. The
 * journeys of a file in `serial` stay together, in the same shard, as
 * one depends on the one before. Every journey is in exactly one shard.
 */
export function shard(
  journeys: readonly Journey[],
  durations: Readonly<Record<string, number>>,
  count: number,
  serial: ReadonlySet<string> = new Set(),
): Journey[][] {
  const known = journeys.map(keyOf).flatMap((key) => durations[key] ?? []);
  const sorted = [...known].sort((a, b) => a - b);
  const median = sorted.length === 0 ? 1 : sorted[Math.floor(sorted.length / 2)]!;
  const groups = new Map<string, Journey[]>();
  for (const journey of journeys) {
    const group = serial.has(journey.file) ? journey.file : keyOf(journey);
    groups.set(group, [...(groups.get(group) ?? []), journey]);
  }
  const timed = [...groups.values()].map((group) => ({
    group,
    time: group.reduce((sum, journey) => sum + (durations[keyOf(journey)] ?? median), 0),
  }));
  timed.sort((a, b) => b.time - a.time || keyOf(a.group[0]!).localeCompare(keyOf(b.group[0]!)));
  const shards = Array.from({ length: count }, () => ({ journeys: [] as Journey[], time: 0 }));
  for (const { group, time } of timed) {
    const least = shards.reduce((best, next) => (next.time < best.time ? next : best));
    least.journeys.push(...group);
    least.time += time;
  }
  const placed = shards.flatMap((each) => each.journeys).map(keyOf);
  if (placed.length !== journeys.length || new Set(placed).size !== placed.length)
    throw new Error("The shards do not hold every journey exactly once.");
  return shards.map((each) => each.journeys);
}

/** The arguments that run a shard's journeys: each by its file and line. */
export const argumentsOf = (journeys: readonly Journey[]) =>
  journeys.map(({ file, line }) => `journeys/${file}:${line}`);

/** The time each journey took in a Playwright JSON report (test-results/results.json), in whole seconds, in one project's run. */
export function durationsOf(
  report: { suites?: ReportSuite[] },
  project: string,
): Record<string, number> {
  const walk = (suites: ReportSuite[] = []): [string, number][] =>
    suites.flatMap((suite) => [
      ...(suite.specs ?? []).flatMap((spec) =>
        spec.tests
          .filter((test) => test.projectName === project)
          .flatMap((test) => test.results.slice(-1))
          .map((result): [string, number] => [
            keyOf({ file: spec.file, line: 0, title: spec.title }),
            Math.max(1, Math.round(result.duration / 1000)),
          ]),
      ),
      ...walk(suite.suites),
    ]);
  return Object.fromEntries(walk(report.suites).sort(([a], [b]) => a.localeCompare(b)));
}
interface ReportSuite {
  specs?: {
    file: string;
    title: string;
    tests: { projectName?: string; results: { duration: number }[] }[];
  }[];
  suites?: ReportSuite[];
}

const HERE = join(import.meta.dirname, "..");
const DURATIONS = join(HERE, "durations.json");

/**
 * `node harness/shards.ts <shard> <count>`, given the listing on stdin:
 * prints the arguments that run that shard. `node harness/shards.ts
 * durations [results.json...]`: writes durations.json from the reports
 * of runs that took Chromium's journeys between them, such as CI's
 * shards' (test-results/results.json by default).
 */
if (import.meta.main) {
  const [first, second, ...more] = process.argv.slice(2);
  if (first === "durations") {
    const reports =
      second === undefined ? [join(HERE, "test-results", "results.json")] : [second, ...more];
    const durations: Record<string, number> = {};
    for (const report of reports)
      Object.assign(durations, durationsOf(JSON.parse(await readFile(report, "utf8")), "chromium"));
    const sorted = Object.fromEntries(
      Object.entries(durations).sort(([a], [b]) => a.localeCompare(b)),
    );
    await writeFile(DURATIONS, `${JSON.stringify(sorted, null, 2)}\n`);
  } else {
    const at = Number(first);
    const count = Number(second);
    if (!Number.isInteger(at) || !Number.isInteger(count) || at < 1 || at > count)
      throw new Error("Usage: node harness/shards.ts <shard> <count> < listing.json");
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const journeys = journeysOf(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const durations = JSON.parse(await readFile(DURATIONS, "utf8")) as Record<string, number>;
    const files = [...new Set(journeys.map((journey) => journey.file))];
    const serial = new Set<string>();
    for (const file of files) {
      const source = await readFile(join(HERE, "journeys", file), "utf8");
      if (/mode:\s*"serial"/.test(source)) serial.add(file);
    }
    console.log(argumentsOf(shard(journeys, durations, count, serial)[at - 1]!).join(" "));
  }
}
