// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  advisories,
  type Change,
  changes,
  render,
  renderAdvisories,
  run,
} from "./dependencyChanges.ts";

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

/** An advisory on a version, at a severity. */
function advisory(
  id: string,
  severity: "critical" | "high" | "moderate" | "low" = "moderate",
): NonNullable<Change["vulnerabilities"]>[number] {
  return {
    severity,
    advisory_ghsa_id: id,
    advisory_summary: `${id}: a | in the summary`,
    advisory_url: `https://github.com/advisories/${id}`,
  };
}

const NO_ADVISORIES =
  "## Advisories\n\nNo added version has an advisory of moderate severity or worse.\n";

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

describe("advisories", () => {
  it("carries over an advisory that a removed version of the package in the manifest had", () => {
    const moved = change("added", "ip-address", "10.7.2", {
      vulnerabilities: [advisory("GHSA-a")],
    });
    expect(
      advisories([
        change("removed", "ip-address", "10.5.0", { vulnerabilities: [advisory("GHSA-a")] }),
        moved,
      ]),
    ).toEqual({
      introduced: [],
      carried: [
        {
          manifest: "package-lock.json",
          name: "ip-address",
          version: "10.7.2",
          vulnerability: advisory("GHSA-a"),
        },
      ],
    });
  });

  it("introduces an advisory the removed version didn't have, though it had another", () => {
    const { introduced, carried } = advisories([
      change("removed", "a", "1.0.0", { vulnerabilities: [advisory("GHSA-a")] }),
      change("added", "a", "2.0.0", { vulnerabilities: [advisory("GHSA-a"), advisory("GHSA-b")] }),
    ]);
    expect(introduced.map(({ vulnerability }) => vulnerability.advisory_ghsa_id)).toEqual([
      "GHSA-b",
    ]);
    expect(carried.map(({ vulnerability }) => vulnerability.advisory_ghsa_id)).toEqual(["GHSA-a"]);
  });

  it("introduces an advisory that only another manifest, or another package, had", () => {
    const { introduced, carried } = advisories([
      change("removed", "a", "1.0.0", {
        manifest: "e2e/pod/servers/jss/package-lock.json",
        vulnerabilities: [advisory("GHSA-a")],
      }),
      change("removed", "b", "1.0.0", { vulnerabilities: [advisory("GHSA-a")] }),
      change("added", "a", "1.0.0", { vulnerabilities: [advisory("GHSA-a")] }),
    ]);
    expect(introduced).toHaveLength(1);
    expect(carried).toEqual([]);
  });

  it("introduces the advisory of a package the pull request adds", () => {
    expect(
      advisories([change("added", "new", "1.0.0", { vulnerabilities: [advisory("GHSA-a")] })])
        .introduced,
    ).toHaveLength(1);
  });

  it("leaves out the advisories below moderate, and the versions without any", () => {
    expect(
      advisories([
        change("added", "a", "1.0.0", { vulnerabilities: [advisory("GHSA-a", "low")] }),
        change("added", "b", "1.0.0"),
      ]),
    ).toEqual({ introduced: [], carried: [] });
  });

  it("counts every severity from moderate up", () => {
    expect(
      advisories([
        change("added", "a", "1.0.0", {
          vulnerabilities: [advisory("GHSA-a", "critical"), advisory("GHSA-b", "high")],
        }),
      ]).introduced,
    ).toHaveLength(2);
  });
});

describe("renderAdvisories", () => {
  it("lists the introduced advisories and those carried over, in a table each", () => {
    expect(
      renderAdvisories([
        change("removed", "a", "1.0.0", { vulnerabilities: [advisory("GHSA-a")] }),
        change("added", "a", "2.0.0", {
          vulnerabilities: [advisory("GHSA-a"), advisory("GHSA-b", "high")],
        }),
      ]),
    ).toBe(
      [
        "## Advisories",
        "",
        "1 introduced, 1 carried over from the base, of moderate severity or worse. The review fails on the introduced ones.",
        "",
        "### Introduced",
        "",
        "| Manifest | Package | Advisory | Severity | Summary |",
        "|---|---|---|---|---|",
        "| `package-lock.json` | `a` 2.0.0 | [GHSA-b](https://github.com/advisories/GHSA-b) | high | GHSA-b: a \\| in the summary |",
        "",
        "### Carried over from the base",
        "",
        "| Manifest | Package | Advisory | Severity | Summary |",
        "|---|---|---|---|---|",
        "| `package-lock.json` | `a` 2.0.0 | [GHSA-a](https://github.com/advisories/GHSA-a) | moderate | GHSA-a: a \\| in the summary |",
        "",
      ].join("\n"),
    );
  });

  it("leaves out a table with nothing in it", () => {
    const text = renderAdvisories([
      change("added", "a", "1.0.0", { vulnerabilities: [advisory("GHSA-a")] }),
    ]);
    expect(text).toContain("### Introduced");
    expect(text).not.toContain("### Carried over from the base");
  });

  it("says so when there are none", () => {
    expect(renderAdvisories(CHANGES)).toBe(NO_ADVISORIES);
  });
});

describe("run", () => {
  function file(list: readonly Change[] = CHANGES): string {
    const path = join(mkdtempSync(join(tmpdir(), "solid-memo-dependencies-")), "changes.json");
    writeFileSync(path, JSON.stringify([list]));
    return path;
  }

  it("adds the advisories and the tables to the run's summary", () => {
    const summary = join(mkdtempSync(join(tmpdir(), "solid-memo-summary-")), "summary.md");
    writeFileSync(summary, "before\n");
    const process: Parameters<typeof run>[0] = {
      argv: ["node", file()],
      env: { GITHUB_STEP_SUMMARY: summary },
    };
    run(process);
    expect(readFileSync(summary, "utf8")).toBe(`before\n${NO_ADVISORIES}\n${TABLES}`);
    expect(process.exitCode).toBeUndefined();
  });

  it("prints them without a summary", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    run({ argv: ["node", file()], env: {} });
    expect(log).toHaveBeenCalledWith(`${NO_ADVISORIES}\n${TABLES}`);
    log.mockRestore();
  });

  it("passes on an advisory carried over from the base", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process: Parameters<typeof run>[0] = {
      argv: [
        "node",
        file([
          change("removed", "a", "1.0.0", { vulnerabilities: [advisory("GHSA-a")] }),
          change("added", "a", "2.0.0", { vulnerabilities: [advisory("GHSA-a")] }),
        ]),
      ],
      env: {},
    };
    run(process);
    expect(process.exitCode).toBeUndefined();
    log.mockRestore();
  });

  it("fails on an advisory the pull request introduces, and names it", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const process: Parameters<typeof run>[0] = {
      argv: [
        "node",
        file([change("added", "a", "2.0.0", { vulnerabilities: [advisory("GHSA-b")] })]),
      ],
      env: {},
    };
    run(process);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
      "package-lock.json » a@2.0.0: GHSA-b (moderate), which the base doesn't have: https://github.com/advisories/GHSA-b",
    );
    log.mockRestore();
    error.mockRestore();
  });

  it("needs the file", () => {
    expect(() => run({ argv: ["node"], env: {} })).toThrow(
      "Usage: npm run dependencies:review -- <changes.json>",
    );
  });
});
