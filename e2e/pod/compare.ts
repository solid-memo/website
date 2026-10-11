// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/** What Vitest's JSON reporter writes, as far as it is read here. */
export interface Results {
  testResults: {
    name: string;
    status: string;
    assertionResults: { ancestorTitles: string[]; title: string; status: string }[];
  }[];
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
 * A test's name without the server's: its file, then its titles but the
 * first, which says the server and version (describe.each), so a new
 * release names its tests as the old one did.
 */
export const keyOf = (file: string, ancestorTitles: string[], title: string) =>
  [basename(file), ...ancestorTitles.slice(1), title].join(" > ");

/** Each test of a run, by what it did and whether its server's list expects it to fail. */
export function compare(results: Results, expected: Record<string, string>): Comparison {
  const comparison: Comparison = { passed: [], skipped: [], known: [], failed: [], fixed: [] };
  for (const file of results.testResults) {
    for (const test of file.assertionResults) {
      const key = keyOf(file.name, test.ancestorTitles, test.title);
      if (test.status === "failed") comparison[key in expected ? "known" : "failed"].push(key);
      else if (test.status === "passed") comparison[key in expected ? "fixed" : "passed"].push(key);
      else comparison.skipped.push(key);
    }
    // A file that failed with none of its tests failing failed around them
    // (a beforeAll that threw marks them skipped): that is a failure too.
    if (
      file.status === "failed" &&
      !file.assertionResults.some((test) => test.status === "failed")
    ) {
      const key = `${basename(file.name)} > (the file, around its tests)`;
      comparison[key in expected ? "known" : "failed"].push(key);
    }
  }
  return comparison;
}

/** The comparison as the job's summary says it. */
export function summary(
  id: string,
  comparison: Comparison,
  expected: Record<string, string>,
): string {
  const { passed, skipped, known, failed, fixed } = comparison;
  const lines = [
    `### ${id}: ${failed.length > 0 ? "new failures" : "as expected"}`,
    "",
    `${passed.length} passed, ${skipped.length} skipped, ${known.length} failed as expected, ${failed.length} failed anew, ${fixed.length} passed though listed.`,
  ];
  const list = (title: string, keys: string[], why?: (key: string) => string) =>
    keys.length > 0 &&
    lines.push(
      "",
      `**${title}**`,
      "",
      ...keys.map((key) => `- ${key}${why ? `: ${why(key)}` : ""}`),
    );
  list("Failed anew", failed);
  list("Passed though listed (take them off expected-failures.json)", fixed);
  list("Failed as expected", known, (key) => expected[key]!);
  return `${lines.join("\n")}\n`;
}

/**
 * `node compare.ts <id> <result.json>`: whether an advisory server's run
 * went as expected (docs/testing.md), said in the job's summary on CI.
 * It fails on a test failing that servers/<id>/expected-failures.json
 * ({ "<test>": "<why>" }) does not list, and when there are no results
 * (the server did not start, or did not meet the contract: see its log).
 */
if (import.meta.main) {
  const [id, resultFile] = process.argv.slice(2);
  if (id === undefined || resultFile === undefined)
    throw new Error("Usage: node compare.ts <id> <result.json>");
  const listFile = join(import.meta.dirname, "servers", id, "expected-failures.json");
  const expected = existsSync(listFile)
    ? (JSON.parse(readFileSync(listFile, "utf8")) as Record<string, string>)
    : {};
  const results = existsSync(resultFile)
    ? (JSON.parse(readFileSync(resultFile, "utf8")) as Results)
    : undefined;
  const comparison = results && compare(results, expected);
  const text =
    comparison === undefined ||
    comparison.passed.length +
      comparison.known.length +
      comparison.failed.length +
      comparison.fixed.length ===
      0
      ? `### ${id}: no results\n\nNo test ran: the server did not start, or did not meet the contract (its log says).\n`
      : summary(id, comparison, expected);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  console.log(text);
  for (const key of comparison?.fixed ?? [])
    console.log(`::warning::${id}: "${key}" passes; take it off expected-failures.json`);
  if (comparison === undefined || text.includes("no results") || comparison.failed.length > 0)
    process.exitCode = 1;
}
