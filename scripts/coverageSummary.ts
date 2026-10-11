// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run coverage:summary`: the coverage each package's last `npm test`
 * measured (vitest's json-summary, `<package>/coverage/coverage-summary.json`),
 * as a Markdown table. CI's build job adds it to its run's summary
 * ($GITHUB_STEP_SUMMARY); without that variable it is printed. Turbo
 * restores a cached test's coverage/ folder, so a cached run has one too.
 * It only reports: the thresholds are each package's (docs/testing.md).
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Where the workspace's code with coverage is, relative to the root. */
export const FOLDERS = ["apps", "packages"];

type Counts = { total: number; covered: number; pct: number | "Unknown" };
type Totals = { lines: Counts; statements: Counts; functions: Counts; branches: Counts };

/** One package's totals, named as its package.json names it. */
export type PackageCoverage = { name: string; total: Totals };

function cell({ covered, total, pct }: Counts): string {
  return `${pct === "Unknown" ? "–" : `${pct}%`} (${covered}/${total})`;
}

/** The table, or a line saying there is nothing to show. */
export function render(packages: readonly PackageCoverage[]): string {
  if (packages.length === 0)
    return "## Coverage\n\nNo package's coverage was found: did `npm test` run?\n";
  const rows = packages.map(
    ({ name, total }) =>
      `| ${name} | ${cell(total.lines)} | ${cell(total.statements)} | ${cell(total.functions)} | ${cell(total.branches)} |`,
  );
  return [
    "## Coverage",
    "",
    "| Package | Lines | Statements | Functions | Branches |",
    "|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

export type CoverageIo = {
  /** The folders, relative to the root, that may hold a package. */
  packageDirs(): string[];
  read(path: string): string | undefined;
  write(text: string): void;
};

export function defaultIo(root: string, env: Record<string, string | undefined>): CoverageIo {
  const read = (path: string) =>
    existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : undefined;
  return {
    packageDirs: () => [
      ...FOLDERS.flatMap((folder) =>
        readdirSync(join(root, folder), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${folder}/${entry.name}`),
      ),
      "scripts",
    ],
    read,
    write: (text) => {
      if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, text);
      else console.log(text);
    },
  };
}

/** Every package with a coverage summary, in the order of its folder. */
export function collect(io: CoverageIo): PackageCoverage[] {
  return io.packageDirs().flatMap((dir) => {
    const summary = io.read(`${dir}/coverage/coverage-summary.json`);
    if (summary === undefined) return [];
    const manifest = io.read(`${dir}/package.json`);
    const name = manifest === undefined ? dir : (JSON.parse(manifest) as { name: string }).name;
    return [{ name, total: (JSON.parse(summary) as { total: Totals }).total }];
  });
}

/** The script entry: `node -e "import('./scripts/coverageSummary.ts').then((m) => m.run(process))"`. */
export function run(process: { env: Record<string, string | undefined> }): void {
  const io = defaultIo(resolve(import.meta.dirname, ".."), process.env);
  io.write(render(collect(io)));
}
