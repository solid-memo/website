// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** What Playwright's JSON reporter writes, as far as it is read here. */
export interface Results {
  suites?: Suite[];
  /** What failed outside any journey: a global teardown, a worker after its journeys. */
  errors?: unknown[];
}
interface Suite {
  title: string;
  specs?: { title: string; file: string; tests: { status: string }[] }[];
  suites?: Suite[];
}

export interface Comparison {
  passed: string[];
  skipped: string[];
  /** Failed, as its server's expected-failures.json says it does. */
  known: string[];
  /** Failed, and not listed: what makes the run fail. */
  failed: string[];
  /** Listed, and passed: to take off the list. */
  fixed: string[];
}

/**
 * A journey's name: its file, then the titles of the describe blocks it's
 * in, then its own. A file's suite is titled by the file, so the first
 * title is left out.
 */
function keysOf(suite: Suite, describes: string[]): { key: string; status: string }[] {
  return [
    ...(suite.specs ?? []).flatMap((spec) =>
      spec.tests.map((test) => ({
        key: [spec.file, ...describes, spec.title].join(" > "),
        status: test.status,
      })),
    ),
    ...(suite.suites ?? []).flatMap((inner) => keysOf(inner, [...describes, inner.title])),
  ];
}

/**
 * Each journey of a run, by what it did and whether its server's list
 * expects it to fail. Playwright says "unexpected" of a journey that
 * failed, "expected" of one that passed and "flaky" of one that passed
 * on a retry.
 */
export function compare(results: Results, expected: Record<string, string>): Comparison {
  const comparison: Comparison = { passed: [], skipped: [], known: [], failed: [], fixed: [] };
  for (const { key, status } of (results.suites ?? []).flatMap((file) => keysOf(file, []))) {
    if (status === "unexpected") comparison[key in expected ? "known" : "failed"].push(key);
    else if (status === "skipped") comparison.skipped.push(key);
    else comparison[key in expected ? "fixed" : "passed"].push(key);
  }
  // An error outside any journey fails the run as Playwright's exit code
  // did, with every journey passed: that is a failure too.
  if ((results.errors ?? []).length > 0) {
    const key = "(outside any journey)";
    comparison[key in expected ? "known" : "failed"].push(key);
  }
  return comparison;
}

/**
 * The comparison as the job's summary says it, each expected failure
 * under its cause: its id on `page` (docs/interop.md), where the cause is
 * described for the server's developers.
 */
export function summary(
  id: string,
  comparison: Comparison,
  expected: Record<string, string>,
  page: string,
): string {
  const { passed, skipped, known, failed, fixed } = comparison;
  const lines = [
    `### Journeys on ${id}: ${failed.length > 0 ? "new failures" : "as expected"}`,
    "",
    `${passed.length} passed, ${skipped.length} skipped, ${known.length} failed as expected, ${failed.length} failed anew, ${fixed.length} passed though listed.`,
  ];
  const list = (title: string, keys: string[]) =>
    keys.length > 0 && lines.push("", `**${title}**`, "", ...keys.map((key) => `- ${key}`));
  list("Failed anew", failed);
  list("Passed though listed (take them off expected-failures.json)", fixed);
  const byCause = new Map<string, string[]>();
  for (const key of known)
    byCause.set(expected[key]!, [...(byCause.get(expected[key]!) ?? []), key]);
  if (byCause.size > 0) {
    lines.push("", `**Failed as expected, by cause ([interop.md](${page}))**`, "");
    for (const [cause, keys] of byCause)
      lines.push(
        `- [${cause}](${page}#${cause}): ${keys.length} ${keys.length === 1 ? "journey" : "journeys"}`,
        ...keys.map((key) => `  - ${key}`),
      );
  }
  return `${lines.join("\n")}\n`;
}

/** docs/interop.md at the run's commit on CI, and its path elsewhere. */
export const pageOf = (env: Record<string, string | undefined>) =>
  env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_SHA
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/blob/${env.GITHUB_SHA}/docs/interop.md`
    : "docs/interop.md";

/**
 * `node harness/compare.ts <id>`: whether the journeys' run on an
 * advisory server went as expected (docs/testing.md#user-journeys), said
 * in the job's summary on CI. It reads test-results/results.json, and
 * fails on a journey failing that servers/<id>/expected-failures.json
 * ({ "<file> > <journey>": "<cause>" }, the cause's id on
 * docs/interop.md) does not list, and when no journey ran.
 */
if (import.meta.main) {
  const [id] = process.argv.slice(2);
  if (id === undefined) throw new Error("Usage: node harness/compare.ts <id>");
  const root = join(import.meta.dirname, "..");
  const listFile = join(root, "servers", id, "expected-failures.json");
  const expected = existsSync(listFile)
    ? (JSON.parse(readFileSync(listFile, "utf8")) as Record<string, string>)
    : {};
  const resultFile = join(root, "test-results", "results.json");
  const results = existsSync(resultFile)
    ? (JSON.parse(readFileSync(resultFile, "utf8")) as Results)
    : undefined;
  const comparison = results && compare(results, expected);
  const ran =
    comparison !== undefined &&
    comparison.passed.length +
      comparison.known.length +
      comparison.failed.length +
      comparison.fixed.length >
      0;
  const text = ran
    ? summary(id, comparison, expected, pageOf(process.env))
    : `### Journeys on ${id}: no results\n\nNo journey ran: the server or the app did not start (the job's log says).\n`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  console.log(text);
  for (const key of comparison?.fixed ?? [])
    console.log(`::warning::${id}: "${key}" passes; take it off expected-failures.json`);
  if (!ran || comparison.failed.length > 0) process.exitCode = 1;
}
