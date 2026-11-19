// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AdvisoryRange,
  advisories,
  type Base,
  type Change,
  changes,
  compareVersions,
  gitBase,
  inRange,
  lockedVersions,
  render,
  renderAdvisories,
  run,
  withBase,
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
      renderAdvisories(
        advisories([
          change("removed", "a", "1.0.0", { vulnerabilities: [advisory("GHSA-a")] }),
          change("added", "a", "2.0.0", {
            vulnerabilities: [advisory("GHSA-a"), advisory("GHSA-b", "high")],
          }),
        ]),
      ),
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
    const text = renderAdvisories(
      advisories([change("added", "a", "1.0.0", { vulnerabilities: [advisory("GHSA-a")] })]),
    );
    expect(text).toContain("### Introduced");
    expect(text).not.toContain("### Carried over from the base");
  });

  it("says so when there are none", () => {
    expect(renderAdvisories(advisories(CHANGES))).toBe(NO_ADVISORIES);
  });
});

describe("run", () => {
  function file(list: readonly Change[] = CHANGES): string {
    const path = join(mkdtempSync(join(tmpdir(), "solid-memo-dependencies-")), "changes.json");
    writeFileSync(path, JSON.stringify([list]));
    return path;
  }

  it("adds the advisories and the tables to the run's summary", async () => {
    const summary = join(mkdtempSync(join(tmpdir(), "solid-memo-summary-")), "summary.md");
    writeFileSync(summary, "before\n");
    const process: Parameters<typeof run>[0] = {
      argv: ["node", file()],
      env: { GITHUB_STEP_SUMMARY: summary },
    };
    await run(process);
    expect(readFileSync(summary, "utf8")).toBe(`before\n${NO_ADVISORIES}\n${TABLES}`);
    expect(process.exitCode).toBeUndefined();
  });

  it("prints them without a summary", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run({ argv: ["node", file()], env: {} });
    expect(log).toHaveBeenCalledWith(`${NO_ADVISORIES}\n${TABLES}`);
    log.mockRestore();
  });

  it("passes on an advisory carried over from the base", async () => {
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
    await run(process);
    expect(process.exitCode).toBeUndefined();
    log.mockRestore();
  });

  it("fails on an advisory the pull request introduces, and names it", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const process: Parameters<typeof run>[0] = {
      argv: [
        "node",
        file([change("added", "a", "2.0.0", { vulnerabilities: [advisory("GHSA-b")] })]),
      ],
      env: {},
    };
    await run(process);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(
      "package-lock.json » a@2.0.0: GHSA-b (moderate), which the base doesn't have: https://github.com/advisories/GHSA-b",
    );
    log.mockRestore();
    error.mockRestore();
  });

  it("with BASE, passes on an advisory a version the base's lock file keeps has", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const seen: [string, string | undefined][] = [];
    const process: Parameters<typeof run>[0] = {
      argv: [
        "node",
        file([change("added", "glob", "13.0.7", { vulnerabilities: [advisory("GHSA-g")] })]),
      ],
      env: { BASE: "abc123", GH_TOKEN: "token" },
    };
    await run(process, (commit, token) => {
      seen.push([commit, token]);
      return base({ "package-lock.json": lock({ "node_modules/glob": "13.0.6" }) });
    });
    expect(seen).toEqual([["abc123", "token"]]);
    expect(process.exitCode).toBeUndefined();
    expect(log.mock.calls[0]?.[0]).toContain("0 introduced, 1 carried over from the base");
    log.mockRestore();
  });

  it("needs the file", async () => {
    await expect(run({ argv: ["node"], env: {} })).rejects.toThrow(
      "Usage: npm run dependencies:review -- <changes.json>",
    );
  });
});

/** An npm lock file that locks these paths at these versions. */
function lock(paths: Record<string, string>): string {
  return JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { name: "x" },
      ...Object.fromEntries(Object.entries(paths).map(([path, version]) => [path, { version }])),
    },
  });
}

/** glob's advisory: the range GitHub gives, and one of another package. */
const GLOB_RANGES: AdvisoryRange[] = [
  { package: { ecosystem: "npm", name: "glob" }, vulnerable_version_range: ">= 9.0.0, <= 14.0.1" },
  { package: { ecosystem: "npm", name: "other" }, vulnerable_version_range: "< 100.0.0" },
  { package: { ecosystem: "pip", name: "glob" }, vulnerable_version_range: "< 100.0.0" },
];

/** A base of these manifests, its advisories all glob's. */
function base(manifests: Record<string, string>, ranges = GLOB_RANGES): Base & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    manifest: (path) => manifests[path],
    ranges: async (id) => {
      asked.push(id);
      return ranges;
    },
  };
}

describe("lockedVersions", () => {
  it("finds a package at the top of the tree and nested deeper, not others ending alike", () => {
    expect(
      lockedVersions(
        lock({
          "node_modules/glob": "13.0.7",
          "node_modules/npm/node_modules/glob": "13.0.6",
          "node_modules/@scope/glob": "1.0.0",
          "node_modules/minglob": "1.0.0",
        }),
        "glob",
      ),
    ).toEqual(["13.0.7", "13.0.6"]);
  });

  it("finds a scoped package, and skips an entry without a version", () => {
    expect(
      lockedVersions(
        JSON.stringify({
          packages: {
            "node_modules/@scope/a": { version: "1.0.0" },
            "packages/x/node_modules/@scope/a": {},
          },
        }),
        "@scope/a",
      ),
    ).toEqual(["1.0.0"]);
  });

  it("finds nothing in a lock file without packages", () => {
    expect(lockedVersions("{}", "glob")).toEqual([]);
  });
});

describe("compareVersions", () => {
  it.each([
    ["13.0.6", "13.0.7", -1],
    ["14.0.1", "9.0.0", 1],
    ["1.0", "1.0.0", 0],
    ["1.0.1", "1.0", 1],
    ["v1.2.3", "1.2.3", 0],
    ["1.0.0-beta.2", "1.0.0", -1],
    ["1.0.0", "1.0.0-beta.2", 1],
    ["1.0.0-beta.2", "1.0.0-beta.10", -1],
    ["1.0.0-rc.1", "1.0.0-rc.1", 0],
    ["1.x", "1.0", 0],
  ])("puts %s against %s at %i", (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });
});

describe("inRange", () => {
  it.each([
    [">= 9.0.0, <= 14.0.1", "13.0.6", true],
    [">= 9.0.0, <= 14.0.1", "14.0.1", true],
    [">= 9.0.0, <= 14.0.1", "14.0.2", false],
    [">= 9.0.0, <= 14.0.1", "7.2.3", false],
    ["< 2.0.0", "1.9.9", true],
    ["> 1.0.0", "1.0.0", false],
    ["= 1.0.0", "1.0.0", true],
    ["1.0.0", "1.0.1", false],
    ["1.0.0,", "1.0.0", false],
  ])("finds whether %s holds %s", (range, version, holds) => {
    expect(inRange(range, version)).toBe(holds);
  });
});

describe("withBase", () => {
  const added = (manifest = "e2e/pod/servers/nss/6/package-lock.json", name = "glob") =>
    advisories([
      change("added", name, "13.0.7", { manifest, vulnerabilities: [advisory("GHSA-g")] }),
    ]);

  it("carries over an advisory a version the base's lock file keeps has, nested or not", async () => {
    const at = base({
      "e2e/pod/servers/nss/6/package-lock.json": lock({
        "node_modules/npm/node_modules/glob": "13.0.6",
      }),
    });
    const { introduced, carried } = await withBase(added(), at);
    expect(introduced).toEqual([]);
    expect(carried.map(({ version }) => version)).toEqual(["13.0.7"]);
    expect(at.asked).toEqual(["GHSA-g"]);
  });

  it("keeps the ones carried over already", async () => {
    const split = advisories([
      change("removed", "a", "1.0.0", { vulnerabilities: [advisory("GHSA-a")] }),
      change("added", "a", "2.0.0", { vulnerabilities: [advisory("GHSA-a")] }),
    ]);
    expect(await withBase(split, base({}))).toEqual(split);
  });

  it("introduces it when the base locks the package only at versions the advisory spares", async () => {
    const at = base({
      "e2e/pod/servers/nss/6/package-lock.json": lock({ "node_modules/glob": "7.2.3" }),
    });
    expect((await withBase(added(), at)).introduced).toHaveLength(1);
  });

  it("introduces it when the advisory names the package in another ecosystem only", async () => {
    const at = base({ "package-lock.json": lock({ "node_modules/glob": "13.0.6" }) }, [
      { package: { ecosystem: "pip", name: "glob" }, vulnerable_version_range: "< 100.0.0" },
    ]);
    expect((await withBase(added("package-lock.json"), at)).introduced).toHaveLength(1);
  });

  it("introduces it, asking nothing, when the base lacks the package or the manifest", async () => {
    const at = base({ "package-lock.json": lock({ "node_modules/other": "1.0.0" }) });
    expect((await withBase(added("package-lock.json"), at)).introduced).toHaveLength(1);
    expect((await withBase(added("e2e/new/package-lock.json"), at)).introduced).toHaveLength(1);
    expect(at.asked).toEqual([]);
  });

  it("reads no manifest but an npm lock file", async () => {
    const at = base({ "scripts/requirements-lint.txt": "glob==13.0.6\n" });
    const manifest = vi.spyOn(at, "manifest");
    expect((await withBase(added("scripts/requirements-lint.txt"), at)).introduced).toHaveLength(1);
    expect(manifest).not.toHaveBeenCalled();
  });
});

describe("gitBase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads a manifest at a commit of the checkout, and nothing where there is none", () => {
    const at = gitBase("HEAD", undefined);
    expect(JSON.parse(at.manifest("package.json") ?? "{}").name).toBe("solid-memo");
    expect(at.manifest("no/such/package-lock.json")).toBeUndefined();
  });

  it("asks GitHub's API for an advisory's ranges, with the token", async () => {
    const fetch = vi.fn(async () => Response.json({ vulnerabilities: GLOB_RANGES }));
    vi.stubGlobal("fetch", fetch);
    expect(await gitBase("HEAD", "token").ranges("GHSA-3g3m-2fjr-6pw4")).toEqual(GLOB_RANGES);
    expect(fetch).toHaveBeenCalledWith("https://api.github.com/advisories/GHSA-3g3m-2fjr-6pw4", {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "solid-memo-dependency-review",
        Authorization: "Bearer token",
      },
    });
  });

  it("asks without a token, and takes an advisory without vulnerabilities as none", async () => {
    const fetch = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetch);
    expect(await gitBase("HEAD", undefined).ranges("GHSA-a")).toEqual([]);
    expect(fetch).toHaveBeenCalledWith("https://api.github.com/advisories/GHSA-a", {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "solid-memo-dependency-review",
      },
    });
  });

  it("fails when GitHub doesn't answer with the advisory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    await expect(gitBase("HEAD", undefined).ranges("GHSA-a")).rejects.toThrow(
      "GHSA-a: GitHub answered 404",
    );
  });
});
