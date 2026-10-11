import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  collect,
  defaultIo,
  FOLDERS,
  type PackageCoverage,
  render,
  run,
} from "./coverageSummary.ts";

const full = (n: number) => ({ total: n, covered: n, pct: 100 });
const TOTALS: PackageCoverage["total"] = {
  lines: full(10),
  statements: full(12),
  functions: full(3),
  branches: full(4),
};
const SUMMARY = JSON.stringify({ total: TOTALS, "/abs/src/a.ts": TOTALS });

/** A repository with two packages that have coverage, one that has none, and the scripts' own. */
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "solid-memo-coverage-"));
  for (const [dir, name] of [
    ["apps/web", "@x/web"],
    ["packages/domain", "@x/domain"],
    ["packages/untested", "@x/untested"],
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name }));
  }
  for (const dir of ["apps/web", "packages/domain", "scripts"]) {
    mkdirSync(join(root, dir, "coverage"), { recursive: true });
    writeFileSync(join(root, dir, "coverage/coverage-summary.json"), SUMMARY);
  }
  writeFileSync(join(root, "packages/README.md"), "not a package");
  return root;
}

describe("render", () => {
  it("makes a table of each package's totals", () => {
    const empty = { total: 0, covered: 0, pct: "Unknown" as const };
    expect(
      render([
        { name: "@x/web", total: TOTALS },
        {
          name: "@x/types",
          total: { lines: empty, statements: empty, functions: empty, branches: empty },
        },
      ]),
    ).toBe(
      [
        "## Coverage",
        "",
        "| Package | Lines | Statements | Functions | Branches |",
        "|---|---|---|---|---|",
        "| @x/web | 100% (10/10) | 100% (12/12) | 100% (3/3) | 100% (4/4) |",
        "| @x/types | – (0/0) | – (0/0) | – (0/0) | – (0/0) |",
        "",
      ].join("\n"),
    );
  });

  it("says when there is nothing to show", () => {
    expect(render([])).toBe(
      "## Coverage\n\nNo package's coverage was found: did `npm test` run?\n",
    );
  });
});

describe("collect", () => {
  it("reads every package's summary, named by its package.json or else its folder", () => {
    const io = defaultIo(repository(), {});
    expect(io.packageDirs()).toEqual([
      "apps/web",
      "packages/domain",
      "packages/untested",
      "scripts",
    ]);
    expect(collect(io)).toEqual([
      { name: "@x/web", total: TOTALS },
      { name: "@x/domain", total: TOTALS },
      { name: "scripts", total: TOTALS },
    ]);
  });

  it("looks in the folders that hold the workspace's code", () => {
    expect(FOLDERS).toEqual(["apps", "packages"]);
  });
});

describe("run", () => {
  it("adds the table to the step summary CI names", () => {
    const summary = join(mkdtempSync(join(tmpdir(), "solid-memo-summary-")), "summary.md");
    writeFileSync(summary, "# Earlier\n");
    defaultIo(repository(), { GITHUB_STEP_SUMMARY: summary }).write("## Coverage\n");
    expect(readFileSync(summary, "utf8")).toBe("# Earlier\n## Coverage\n");
  });

  it("prints the repository's own table without CI", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    run({ env: {} });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^## Coverage\n/));
    log.mockRestore();
  });
});
