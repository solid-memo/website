// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSON5 from "json5";
import { describe, expect, it } from "vitest";

/**
 * renovate.json5: Renovate merges most updates on its own once CI passes,
 * but a person merges every update to a workflow's action, since some of
 * the jobs that run one hold the deploy key and other secrets. Every new
 * version of an npm dependency raises its range, and every week the npm
 * lockfiles are locked again, which a person merges
 * (GOVERNANCE.md#dependency-updates).
 */

const ROOT = join(import.meta.dirname, "..");

type PackageRule = Record<string, unknown> & { automerge?: boolean };

const config = JSON5.parse(readFileSync(join(ROOT, "renovate.json5"), "utf8")) as {
  automerge?: boolean;
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
