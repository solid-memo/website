// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { type Change, changes, render, run } from "./dependencyChanges.ts";

function change(
  change_type: Change["change_type"],
  name: string,
  version: string,
  more: Partial<Change> = {},
): Change {
  return {
    change_type,
    manifest: "package-lock.json",
    ecosystem: "npm",
    name,
    version,
    license: "MIT",
    scope: "development",
    ...more,
  };
}

/** A pull request that moves one package, adds one, removes one, and changes a Python tool. */
const CHANGES: Change[] = [
  change("removed", "vite", "8.0.0"),
  change("added", "vite", "8.1.0", { scope: "runtime", license: "MIT OR Apache-2.0" }),
  change("added", "@scope/new", "1.0.0", { license: null, scope: undefined }),
  change("removed", "gone", "2.0.0"),
  change("added", "zizmor", "1.32.0", {
    manifest: "scripts/requirements-lint.txt",
    ecosystem: "pip",
  }),
  change("removed", "zizmor", "1.31.1", {
    manifest: "scripts/requirements-lint.txt",
    ecosystem: "pip",
    license: "Other",
  }),
];

const TABLES = [
  "## Dependency changes",
  "",
  "1 added, 2 changed, 1 removed.",
  "",
  "### `package-lock.json`",
  "",
  "| Package | Ecosystem | Version | Scope | License |",
  "|---|---|---|---|---|",
  "| `@scope/new` | npm | added 1.0.0 | – | – |",
  "| `gone` | npm | removed 2.0.0 | development | MIT |",
  "| `vite` | npm | 8.0.0 → 8.1.0 | runtime | MIT OR Apache-2.0 |",
  "",
  "### `scripts/requirements-lint.txt`",
  "",
  "| Package | Ecosystem | Version | Scope | License |",
  "|---|---|---|---|---|",
  "| `zizmor` | pip | 1.31.1 → 1.32.0 | development | MIT |",
  "",
].join("\n");

describe("changes", () => {
  it("reads gh's pages, each a list of changes, as one list", () => {
    const [a, b, c] = CHANGES;
    expect(changes(JSON.stringify([[a, b], [c]]))).toEqual([a, b, c]);
  });

  it("reads a list of changes as it is", () => {
    expect(changes(JSON.stringify(CHANGES))).toEqual(CHANGES);
  });
});

describe("render", () => {
  it("makes a table per manifest of what was added, changed and removed, as each package is now", () => {
    expect(render(CHANGES)).toBe(TABLES);
  });

  it("lists every version of a package that moves more than one", () => {
    expect(
      render([
        change("removed", "lru-cache", "10.0.0"),
        change("removed", "lru-cache", "11.0.0"),
        change("added", "lru-cache", "11.1.0"),
      ]),
    ).toContain("| `lru-cache` | npm | 10.0.0, 11.0.0 → 11.1.0 | development | MIT |");
  });

  it("says so when nothing changed", () => {
    expect(render([])).toBe("## Dependency changes\n\nNo package was added, changed or removed.\n");
  });
});

describe("run", () => {
  function file(): string {
    const path = join(mkdtempSync(join(tmpdir(), "solid-memo-dependencies-")), "changes.json");
    writeFileSync(path, JSON.stringify([CHANGES]));
    return path;
  }

  it("adds the tables to the run's summary", () => {
    const summary = join(mkdtempSync(join(tmpdir(), "solid-memo-summary-")), "summary.md");
    writeFileSync(summary, "before\n");
    run({ argv: ["node", file()], env: { GITHUB_STEP_SUMMARY: summary } });
    expect(readFileSync(summary, "utf8")).toBe(`before\n${TABLES}`);
  });

  it("prints them without a summary", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    run({ argv: ["node", file()], env: {} });
    expect(log).toHaveBeenCalledWith(TABLES);
    log.mockRestore();
  });

  it("needs the file", () => {
    expect(() => run({ argv: ["node"], env: {} })).toThrow(
      "Usage: npm run dependencies:summary -- <changes.json>",
    );
  });
});
