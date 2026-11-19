// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run dependencies:review -- <changes.json>`: the packages a pull
 * request adds, changes and removes, as a Markdown table per manifest,
 * and the advisories it brings in (docs/testing.md#dependency-review).
 * CI's dependency-review job adds them to its run's summary
 * ($GITHUB_STEP_SUMMARY); without that variable they are printed. The
 * file is GitHub's comparison of the dependency graph of the pull
 * request's base and head
 * (`gh api --paginate --slurp repos/<repo>/dependency-graph/compare/<base>...<head>`),
 * the same one dependency-review-action judges the licenses of: its
 * pages, each a list of changes, or the list itself. A version that goes
 * and another of the same package that comes, in one manifest, are one
 * change. It fails on an advisory of moderate severity or worse that an
 * added version has and no removed version of the same package in the
 * same manifest had, nor a version of the package that the base's
 * lock file keeps (with `BASE` set, the base's commit): one the pull
 * request carries over from its base leaves `main` as it was, and is
 * listed without failing.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

/** A known vulnerability of one version, as GitHub's comparison gives it. */
type Vulnerability = {
  severity: "critical" | "high" | "moderate" | "low";
  advisory_ghsa_id: string;
  advisory_summary: string;
  advisory_url: string;
};

/** One change of GitHub's comparison, as much of it as the review reads. */
export type Change = {
  change_type: "added" | "removed";
  manifest: string;
  ecosystem: string;
  name: string;
  version: string;
  license: string | null;
  scope?: string;
  vulnerabilities?: Vulnerability[];
};

/** An advisory of an added version, at the severity the review fails from. */
type Advisory = {
  manifest: string;
  name: string;
  version: string;
  vulnerability: Vulnerability;
};

/** What the review knows of the base besides the comparison. */
export type Base = {
  /** The manifest's text at the base, or undefined where the base has none. */
  manifest(path: string): string | undefined;
  /** The version ranges of one advisory, per ecosystem and package. */
  ranges(ghsaId: string): Promise<AdvisoryRange[]>;
};

/** One package's vulnerable versions, as GitHub's advisory database gives them. */
export type AdvisoryRange = {
  package: { ecosystem: string; name: string };
  vulnerable_version_range: string;
};

/** The severities the review fails on, as the job's action did before it. */
const FAILING = new Set<Vulnerability["severity"]>(["critical", "high", "moderate"]);

/** One row: a package of one manifest, its versions before and after. */
type Row = {
  ecosystem: string;
  name: string;
  removed: string[];
  added: string[];
  license: string | null;
  scope: string | undefined;
};

/** The changes of every page, in the order GitHub gave them. */
export function changes(json: string): Change[] {
  return (JSON.parse(json) as (Change | Change[])[]).flat();
}

function rows(changes: readonly Change[]): Map<string, Row[]> {
  const byManifest = new Map<string, Map<string, Row>>();
  for (const change of changes) {
    const manifest = byManifest.get(change.manifest) ?? new Map<string, Row>();
    byManifest.set(change.manifest, manifest);
    const key = `${change.ecosystem}\u0000${change.name}`;
    const row = manifest.get(key) ?? {
      ecosystem: change.ecosystem,
      name: change.name,
      removed: [],
      added: [],
      license: null,
      scope: undefined,
    };
    manifest.set(key, row);
    row[change.change_type].push(change.version);
    // What the package is now: the added version's, or the removed one's.
    if (change.change_type === "added" || row.added.length === 0) {
      row.license = change.license;
      row.scope = change.scope;
    }
  }
  return new Map(
    [...byManifest]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([manifest, byName]) => [
        manifest,
        [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
      ]),
  );
}

function what({ removed, added }: Row): string {
  if (removed.length === 0) return `added ${added.join(", ")}`;
  if (added.length === 0) return `removed ${removed.join(", ")}`;
  return `${removed.join(", ")} → ${added.join(", ")}`;
}

/**
 * The advisories of the added versions, split into those the pull
 * request introduces and those its base already had: the same advisory
 * on a removed version of the same package in the same manifest.
 */
export function advisories(changes: readonly Change[]): {
  introduced: Advisory[];
  carried: Advisory[];
} {
  const key = (change: Change, id: string) =>
    [change.manifest, change.ecosystem, change.name, id].join("\u0000");
  const before = new Set(
    changes
      .filter((change) => change.change_type === "removed")
      .flatMap((change) =>
        (change.vulnerabilities ?? []).map((vulnerability) =>
          key(change, vulnerability.advisory_ghsa_id),
        ),
      ),
  );
  const introduced: Advisory[] = [];
  const carried: Advisory[] = [];
  for (const change of changes) {
    if (change.change_type === "removed") continue;
    for (const vulnerability of change.vulnerabilities ?? []) {
      if (!FAILING.has(vulnerability.severity)) continue;
      const advisory = {
        manifest: change.manifest,
        name: change.name,
        version: change.version,
        vulnerability,
      };
      (before.has(key(change, vulnerability.advisory_ghsa_id)) ? carried : introduced).push(
        advisory,
      );
    }
  }
  return { introduced, carried };
}

/**
 * The versions of a package an npm lock file locks, wherever it sits in
 * the tree (`node_modules/<name>`, nested or not).
 */
export function lockedVersions(lock: string, name: string): string[] {
  const { packages = {} } = JSON.parse(lock) as {
    packages?: Record<string, { version?: string }>;
  };
  return Object.entries(packages).flatMap(([path, entry]) =>
    (path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)) &&
    entry.version !== undefined
      ? [entry.version]
      : [],
  );
}

/** A version as numbers and, after a hyphen, its prerelease. */
function parts(version: string): { release: number[]; prerelease: string | undefined } {
  const [release, ...rest] = version.trim().replace(/^v/, "").split("-") as [string, ...string[]];
  return {
    release: release.split(".").map((part) => Number.parseInt(part, 10) || 0),
    prerelease: rest.length > 0 ? rest.join("-") : undefined,
  };
}

/** Semantic versions compared: below zero when a comes first. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.release.length, y.release.length); i++) {
    const difference = (x.release[i] ?? 0) - (y.release[i] ?? 0);
    if (difference !== 0) return difference;
  }
  if (x.prerelease === y.prerelease) return 0;
  if (x.prerelease === undefined) return 1;
  if (y.prerelease === undefined) return -1;
  return x.prerelease.localeCompare(y.prerelease, "en", { numeric: true });
}

type Operator = "<" | "<=" | ">" | ">=" | "=";

const COMPARISONS: Record<Operator, (difference: number) => boolean> = {
  "<": (difference) => difference < 0,
  "<=": (difference) => difference <= 0,
  ">": (difference) => difference > 0,
  ">=": (difference) => difference >= 0,
  "=": (difference) => difference === 0,
};

/**
 * Whether a version is in GitHub's vulnerable version range, such as
 * `>= 9.0.0, <= 14.0.1`: every comparison of it holds.
 */
export function inRange(range: string, version: string): boolean {
  return range.split(",").every((comparison) => {
    const match = /^\s*(<=|>=|<|>|=)?\s*(\S+)\s*$/.exec(comparison);
    if (match === null) return false;
    const [, operator = "=", bound] = match as unknown as [string, Operator | undefined, string];
    return COMPARISONS[operator](compareVersions(version, bound));
  });
}

/**
 * The introduced advisories that the base has after all, moved to the
 * carried over ones: an npm lock file whose base locks the package at a
 * version the advisory covers. The comparison can't say so when that
 * version stays, as when a package's copy at the top of the tree moves
 * and one nested deeper keeps the base's version.
 */
export async function withBase(
  { introduced, carried }: { introduced: readonly Advisory[]; carried: readonly Advisory[] },
  base: Base,
): Promise<{ introduced: Advisory[]; carried: Advisory[] }> {
  const still: Advisory[] = [];
  const more: Advisory[] = [];
  for (const advisory of introduced) {
    const lock = advisory.manifest.endsWith("package-lock.json")
      ? base.manifest(advisory.manifest)
      : undefined;
    const versions = lock === undefined ? [] : lockedVersions(lock, advisory.name);
    const ranges =
      versions.length === 0
        ? []
        : (await base.ranges(advisory.vulnerability.advisory_ghsa_id)).filter(
            (range) => range.package.ecosystem === "npm" && range.package.name === advisory.name,
          );
    const had = versions.some((version) =>
      ranges.some((range) => inRange(range.vulnerable_version_range, version)),
    );
    (had ? more : still).push(advisory);
  }
  return { introduced: still, carried: [...carried, ...more] };
}

/** The base at a commit of this checkout, its advisories from GitHub's API. */
export function gitBase(
  commit: string,
  token: string | undefined,
  root: string = process.cwd(),
): Base {
  return {
    manifest(path) {
      try {
        return execFileSync("git", ["show", `${commit}:${path}`], {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 256 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        return undefined;
      }
    },
    async ranges(ghsaId) {
      const response = await fetch(
        `https://api.github.com/advisories/${encodeURIComponent(ghsaId)}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "solid-memo-dependency-review",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );
      if (!response.ok) throw new Error(`${ghsaId}: GitHub answered ${response.status}`);
      const { vulnerabilities = [] } = (await response.json()) as {
        vulnerabilities?: AdvisoryRange[];
      };
      return vulnerabilities;
    },
  };
}

function advisoryLines(heading: string, list: readonly Advisory[]): string[] {
  if (list.length === 0) return [];
  return [
    "",
    `### ${heading}`,
    "",
    "| Manifest | Package | Advisory | Severity | Summary |",
    "|---|---|---|---|---|",
    ...list.map(
      ({ manifest, name, version, vulnerability }) =>
        `| \`${manifest}\` | \`${name}\` ${version} | [${vulnerability.advisory_ghsa_id}](${vulnerability.advisory_url}) | ${vulnerability.severity} | ${vulnerability.advisory_summary.replaceAll("|", "\\|")} |`,
    ),
  ];
}

/** The advisories the pull request introduces and carries over, or a line saying there are none. */
export function renderAdvisories({
  introduced,
  carried,
}: {
  introduced: readonly Advisory[];
  carried: readonly Advisory[];
}): string {
  if (introduced.length === 0 && carried.length === 0) {
    return "## Advisories\n\nNo added version has an advisory of moderate severity or worse.\n";
  }
  const lines = [
    "## Advisories",
    "",
    `${introduced.length} introduced, ${carried.length} carried over from the base, of moderate severity or worse. The review fails on the introduced ones.`,
    ...advisoryLines("Introduced", introduced),
    ...advisoryLines("Carried over from the base", carried),
  ];
  return `${lines.join("\n")}\n`;
}

/** The tables, or a line saying nothing changed. */
export function render(changes: readonly Change[]): string {
  const byManifest = rows(changes);
  if (byManifest.size === 0) {
    return "## Dependency changes\n\nNo package was added, changed or removed.\n";
  }
  const all = [...byManifest.values()].flat();
  const count = (kind: (row: Row) => boolean) => all.filter(kind).length;
  const lines = [
    "## Dependency changes",
    "",
    `${count((row) => row.removed.length === 0)} added, ${count((row) => row.removed.length > 0 && row.added.length > 0)} changed, ${count((row) => row.added.length === 0)} removed.`,
  ];
  for (const [manifest, manifestRows] of byManifest) {
    lines.push(
      "",
      `### \`${manifest}\``,
      "",
      "| Package | Ecosystem | Version | Scope | License |",
      "|---|---|---|---|---|",
      ...manifestRows.map(
        (row) =>
          `| \`${row.name}\` | ${row.ecosystem} | ${what(row)} | ${row.scope ?? "–"} | ${row.license ?? "–"} |`,
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The script entry: `node -e "import('./scripts/dependencyChanges.ts').then((m) => m.run(process))" -- <changes.json>`.
 * With `BASE`, the base's commit, it looks for the introduced advisories
 * in the base's lock files too (`GH_TOKEN` for GitHub's API). It sets the
 * exit code to 1, and names each one, when the pull request introduces
 * an advisory.
 */
export async function run(
  process: {
    argv: readonly string[];
    env: Record<string, string | undefined>;
    exitCode?: number | string | null | undefined;
  },
  base: (commit: string, token: string | undefined) => Base = gitBase,
): Promise<void> {
  const path = process.argv[1];
  if (path === undefined) throw new Error("Usage: npm run dependencies:review -- <changes.json>");
  const all = changes(readFileSync(path, "utf8"));
  const split = advisories(all);
  const { introduced, carried } = process.env.BASE
    ? await withBase(split, base(process.env.BASE, process.env.GH_TOKEN))
    : split;
  const text = `${renderAdvisories({ introduced, carried })}\n${render(all)}`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  else console.log(text);
  for (const { manifest, name, version, vulnerability } of introduced) {
    console.error(
      `${manifest} » ${name}@${version}: ${vulnerability.advisory_ghsa_id} (${vulnerability.severity}), which the base doesn't have: ${vulnerability.advisory_url}`,
    );
  }
  if (introduced.length > 0) process.exitCode = 1;
}
