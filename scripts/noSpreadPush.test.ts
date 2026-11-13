// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * biome/no-spread-push.grit: a list spread into `push` or `unshift`
 * fails, whether the call is plain or optional, and nothing else does
 * (docs/style.md#typescript).
 */

const ROOT = join(import.meta.dirname, "..");
const DIR = mkdtempSync(join(tmpdir(), "no-spread-push-"));

afterAll(() => rmSync(DIR, { recursive: true, force: true }));

/** The lines of `source` the plugin alone fails on. */
function flagged(source: string): number[] {
  writeFileSync(
    join(DIR, "biome.json"),
    JSON.stringify({
      plugins: [join(ROOT, "biome/no-spread-push.grit")],
      linter: { rules: { recommended: false } },
    }),
  );
  writeFileSync(join(DIR, "probe.ts"), source);
  let output: string;
  try {
    output = execFileSync(
      join(ROOT, "node_modules/.bin/biome"),
      ["lint", "--reporter=json", "probe.ts"],
      {
        cwd: DIR,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch (error) {
    output = (error as { stdout: string }).stdout;
  }
  const report = JSON.parse(output) as {
    diagnostics: { category: string; location: { start: { line: number } } }[];
  };
  return report.diagnostics
    .filter((d) => d.category === "plugin")
    .map((d) => d.location.start.line);
}

describe("no-spread-push", () => {
  it("fails on a spread into push or unshift, plain or optional", () => {
    const source = [
      "list.push(...items);",
      "a.b.unshift(first, ...items);",
      "a.b?.push(...items);",
      "a?.unshift(...items);",
    ].join("\n");
    expect(flagged(source)).toEqual([1, 2, 3, 4]);
  });

  it("leaves other calls alone", () => {
    const source = [
      "list.push(item);",
      "list?.unshift(a, b);",
      "list.concat(...items);",
      "call(...items);",
      "for (const item of items) list.push(item);",
    ].join("\n");
    expect(flagged(source)).toEqual([]);
  });
});
