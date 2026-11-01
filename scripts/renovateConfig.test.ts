// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSON5 from "json5";
import { describe, expect, it } from "vitest";
import { type LockEntry, type Lockfile, SHIPPED } from "./checkDependencies.ts";

/**
 * renovate.json5: Renovate merges most updates on its own once CI passes,
 * but a person merges every update to a workflow's action, since some of
 * the jobs that run one hold the deploy key and other secrets, and every
 * update of what the app ships, of what the release job runs while it
 * holds the key, and to a new major version. Every new
 * version of an npm dependency raises its range, and every week the npm
 * lockfiles are locked again, which a person merges
 * (GOVERNANCE.md#dependency-updates).
 */

const ROOT = join(import.meta.dirname, "..");

type PackageRule = Record<string, unknown> & { automerge?: boolean };

const config = JSON5.parse(readFileSync(join(ROOT, "renovate.json5"), "utf8")) as {
  automerge?: boolean;
  vulnerabilityAlerts?: Record<string, unknown>;
  npm?: { lockFileMaintenance?: Record<string, unknown> };
  "pip-compile"?: { lockFileMaintenance?: Record<string, unknown> };
  packageRules: PackageRule[];
};

/** The index of the rule that raises npm dependencies' ranges. */
const bumped = config.packageRules.findIndex(
  (rule) =>
    JSON.stringify(rule.matchManagers) === JSON.stringify(["npm"]) && rule.rangeStrategy === "bump",
);

/** The index of the rule that holds every action update for a person. */
const held = config.packageRules.findIndex(
  (rule) =>
    JSON.stringify(rule.matchManagers) === JSON.stringify(["github-actions"]) &&
    rule.automerge === false,
);

/** The index of the rule that holds the shipped packages' run-time dependencies. */
const heldShipped = config.packageRules.findIndex(
  (rule) =>
    JSON.stringify(rule.matchManagers) === JSON.stringify(["npm"]) &&
    rule.matchFileNames !== undefined &&
    rule.automerge === false,
);

/** The index of the rule that holds what the root package.json lists and the app ships. */
const heldRoot = config.packageRules.findIndex(
  (rule) =>
    JSON.stringify(rule.matchFileNames) === JSON.stringify(["package.json"]) &&
    rule.automerge === false,
);

/** The index of the rule that holds every major update. */
const heldMajor = config.packageRules.findIndex(
  (rule) =>
    JSON.stringify(rule.matchUpdateTypes) === JSON.stringify(["major"]) && rule.automerge === false,
);

/** The index of the rule that holds the tools the release job runs. */
const heldRelease = config.packageRules.findIndex(
  (rule) =>
    Array.isArray(rule.matchDepNames) &&
    rule.matchDepNames.includes("semantic-release") &&
    rule.automerge === false,
);

const releaseConfig = (await import(new URL("../release.config.mjs", import.meta.url).href)) as {
  default: { plugins: [string, unknown][] };
};

/**
 * The package.json of every workspace package scripts/checkDependencies.ts
 * walks from SHIPPED: each root's, and each workspace package's that one
 * of them needs at run time, as package-lock.json links them.
 */
function shippedPackageFiles(lock: Lockfile): string[] {
  const seen = new Set<string>();
  const queue = [...SHIPPED];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (seen.has(next)) continue;
    seen.add(next);
    const entry = lock.packages[next] ?? {};
    const names = [
      ...Object.keys(entry.dependencies ?? {}),
      ...Object.keys(entry.optionalDependencies ?? {}),
      ...Object.keys(entry.peerDependencies ?? {}),
    ];
    for (const name of names) {
      const linked = lock.packages[`node_modules/${name}`];
      if (linked?.link === true && linked.resolved !== undefined) queue.push(linked.resolved);
    }
  }
  return [...seen].map((location) => `${location}/package.json`).sort();
}

describe("renovate.json5", () => {
  it("merges an update on its own unless a rule says otherwise", () => {
    expect(config.automerge).toBe(true);
  });

  it("holds every update to a workflow's action for a person", () => {
    expect(held).toBeGreaterThanOrEqual(0);
    // Matched by its manager alone: every update type (a moved tag's new
    // digest, and a new version), in every workflow and local action.
    expect(Object.keys(config.packageRules[held] ?? {}).sort()).toEqual([
      "automerge",
      "matchManagers",
    ]);
  });

  it("lets no rule after it merge an update on its own again", () => {
    const later = config.packageRules.slice(held + 1);
    expect(later.filter((rule) => rule.automerge === true)).toEqual([]);
  });

  it("holds every update of what the app ships for a person", () => {
    expect(heldShipped).toBeGreaterThanOrEqual(0);
    const rule = config.packageRules[heldShipped] ?? {};
    expect(Object.keys(rule).sort()).toEqual([
      "automerge",
      "matchDepTypes",
      "matchFileNames",
      "matchManagers",
    ]);
    // What scripts/checkDependencies.ts walks as needed at run time.
    expect(rule.matchDepTypes).toEqual([
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ]);
    const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")) as Lockfile;
    expect([...(rule.matchFileNames as string[])].sort()).toEqual(shippedPackageFiles(lock));
  });

  it("holds every update of what the root lists and the app ships for a person", () => {
    expect(heldRoot).toBeGreaterThanOrEqual(0);
    const rule = config.packageRules[heldRoot] ?? {};
    expect(Object.keys(rule).sort()).toEqual([
      "automerge",
      "matchDepNames",
      "matchFileNames",
      "matchManagers",
    ]);
    expect(rule.matchManagers).toEqual(["npm"]);
    // npm marks each package that only development needs: the root's
    // others are installed for the shipped packages, which the page bundles.
    const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as LockEntry;
    const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")) as {
      packages: Record<string, { dev?: boolean; devOptional?: boolean }>;
    };
    const listed = [
      ...Object.keys(root.dependencies ?? {}),
      ...Object.keys(root.devDependencies ?? {}),
      ...Object.keys(root.optionalDependencies ?? {}),
    ];
    const shipped = listed.filter((name) => {
      const entry = lock.packages[`node_modules/${name}`];
      return entry?.dev !== true && entry?.devOptional !== true;
    });
    expect([...(rule.matchDepNames as string[])].sort()).toEqual(shipped.sort());
  });

  it("holds the end-to-end tests' dependencies out of the shipped ones", () => {
    const files = config.packageRules[heldShipped]?.matchFileNames as string[];
    expect(files.filter((file) => file.startsWith("e2e/"))).toEqual([]);
  });

  it("holds every major update for a person", () => {
    expect(heldMajor).toBeGreaterThanOrEqual(0);
    expect(Object.keys(config.packageRules[heldMajor] ?? {}).sort()).toEqual([
      "automerge",
      "matchUpdateTypes",
    ]);
  });

  it("holds every update of what the release job runs with the deploy key", () => {
    expect(heldRelease).toBeGreaterThanOrEqual(0);
    const rule = config.packageRules[heldRelease] ?? {};
    expect(Object.keys(rule).sort()).toEqual(["automerge", "matchDepNames"]);
    expect(rule.matchDepNames).toEqual([
      "semantic-release",
      "/^@semantic-release\\//",
      "conventional-changelog-conventionalcommits",
      "vite",
      "playwright",
      "mermaid",
    ]);
    // Every plugin release.config.mjs runs is one of semantic-release's.
    const plugins = releaseConfig.default.plugins.map(([name]) => name);
    expect(plugins.filter((name) => !name.startsWith("@semantic-release/"))).toEqual([]);
  });

  it("lets no rule after the held ones merge an update on its own again", () => {
    for (const index of [heldShipped, heldRoot, heldMajor, heldRelease]) {
      const later = config.packageRules.slice(index + 1);
      expect(later.filter((rule) => rule.automerge === true)).toEqual([]);
    }
  });

  it("holds a security update of a held package too", () => {
    // Renovate forces vulnerabilityAlerts over every package rule: an
    // automerge there would merge a held package's security update.
    expect(config.vulnerabilityAlerts?.automerge).toBeUndefined();
  });

  it("raises an npm dependency's range to each new version", () => {
    expect(bumped).toBeGreaterThanOrEqual(0);
    expect(config.packageRules[bumped]?.matchDepTypes).toEqual([
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ]);
  });

  it("lets later rules change the range strategy only to pin a version", () => {
    const later = config.packageRules.slice(bumped + 1);
    const strategies = later.flatMap((rule) =>
      rule.rangeStrategy === undefined ? [] : [rule.rangeStrategy],
    );
    expect(strategies.filter((strategy) => strategy !== "pin")).toEqual([]);
  });

  it("locks the npm lockfiles again every week, for a person to merge", () => {
    const maintenance = config.npm?.lockFileMaintenance;
    expect(maintenance?.enabled).toBe(true);
    expect(maintenance?.automerge).toBe(false);
    expect(maintenance?.schedule).toEqual(["* 0-3 * * 1"]);
  });

  it("keeps npm's weekly locking apart from pip-compile's monthly one", () => {
    // On one branch, the first manager's schedule and commit type would
    // be the branch's, and pip-compile's run would come every Monday.
    const topic = (maintenance?: Record<string, unknown>) =>
      maintenance?.branchTopic ?? "lock-file-maintenance";
    expect(topic(config.npm?.lockFileMaintenance)).not.toBe(
      topic(config["pip-compile"]?.lockFileMaintenance),
    );
  });
});
