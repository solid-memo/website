// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { globSync, readFileSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import JSON5 from "json5";
import { describe, expect, it } from "vitest";

/**
 * renovate.json5: Renovate merges an update on its own once CI passes only
 * where a rule lets it, and only the end-to-end test servers' images and
 * commits are let. A person merges every other update: every npm update,
 * development tools' included, since the build that makes the deployed
 * site and the release job run them, and an update of one can move a
 * shipped package in the lockfile; every update to a workflow's action,
 * since some of the jobs that run one hold the deploy key and other
 * secrets; the Python tools and the dev container, which run on
 * maintainers' machines; and every new major version. Every new version of
 * an npm dependency raises its range, and every week the npm lockfiles are
 * locked again, which a person merges (GOVERNANCE.md#dependency-updates).
 */

const ROOT = join(import.meta.dirname, "..");

type PackageRule = Record<string, unknown> & { automerge?: boolean };

const config = JSON5.parse(readFileSync(join(ROOT, "renovate.json5"), "utf8")) as {
  automerge?: boolean;
  vulnerabilityAlerts?: Record<string, unknown>;
  npmrc?: string;
  npmrcMerge?: boolean;
  npm?: { lockFileMaintenance?: Record<string, unknown> };
  "pip-compile"?: { lockFileMaintenance?: Record<string, unknown> };
  packageRules: PackageRule[];
};

/** The dev container's configuration, and the lock file the dev container CLI writes beside it. */
const devcontainer = JSON5.parse(
  readFileSync(join(ROOT, ".devcontainer/devcontainer.json"), "utf8"),
) as { image: string; features: Record<string, unknown> };
const devcontainerLock = JSON.parse(
  readFileSync(join(ROOT, ".devcontainer/devcontainer-lock.json"), "utf8"),
) as { features: Record<string, { version: string; resolved: string; integrity: string }> };

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

/** The index of the rule that holds every major update. */
const heldMajor = config.packageRules.findIndex(
  (rule) =>
    JSON.stringify(rule.matchUpdateTypes) === JSON.stringify(["major"]) && rule.automerge === false,
);

/** One update Renovate may propose, as its package rules match it. */
type Update = {
  manager: string;
  datasource: string;
  packageFile: string;
  depName: string;
  depType?: string;
  updateType: string;
};

/** Whether a rule's list matches a value: a `/regex/`, or a glob. */
function listed(patterns: unknown, value: string | undefined): boolean {
  if (value === undefined) return false;
  return (patterns as string[]).some((pattern) =>
    pattern.startsWith("/")
      ? new RegExp(pattern.slice(1, pattern.lastIndexOf("/"))).test(value)
      : matchesGlob(value, pattern),
  );
}

/** What each `match*` field of a rule compares with. */
const MATCHERS: Record<string, (update: Update) => string | undefined> = {
  matchManagers: (update) => update.manager,
  matchDatasources: (update) => update.datasource,
  matchFileNames: (update) => update.packageFile,
  matchDepNames: (update) => update.depName,
  matchDepTypes: (update) => update.depType,
  matchUpdateTypes: (update) => update.updateType,
};

/**
 * Whether Renovate would merge an update on its own: the top level's
 * automerge, then the lock file maintenance's, then every package rule
 * that matches it in order, the last one that sets automerge winning.
 */
function automerges(update: Update): boolean {
  let automerge = config.automerge ?? false;
  if (update.manager === "npm" && update.updateType === "lockFileMaintenance") {
    automerge = (config.npm?.lockFileMaintenance?.automerge as boolean | undefined) ?? automerge;
  }
  for (const rule of config.packageRules) {
    const fields = Object.keys(rule).filter((key) => key.startsWith("match"));
    const matches = fields.every((field) => {
      const value = MATCHERS[field];
      if (value === undefined) throw new Error(`no matcher for ${field}`);
      return listed(rule[field], value(update));
    });
    if (matches && rule.automerge !== undefined) automerge = rule.automerge;
  }
  return automerge;
}

/** Every update type Renovate proposes. */
const UPDATE_TYPES = [
  "major",
  "minor",
  "patch",
  "pin",
  "digest",
  "pinDigest",
  "bump",
  "rollback",
  "replacement",
  "lockFileMaintenance",
];

/** The fields of a package.json that Renovate's npm manager reads dependencies from. */
const DEP_TYPES = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "overrides",
  "engines",
  "packageManager",
];

/** Every dependency each package.json in the repository lists, by its field. */
function npmDependencies(): { packageFile: string; depName: string; depType: string }[] {
  const files = globSync("**/package.json", { cwd: ROOT, exclude: ["**/node_modules/**"] });
  return files.flatMap((packageFile) => {
    const manifest = JSON.parse(readFileSync(join(ROOT, packageFile), "utf8")) as Record<
      string,
      unknown
    >;
    return DEP_TYPES.flatMap((depType) => {
      const field = manifest[depType];
      if (field === undefined) return [];
      const names =
        typeof field === "string" ? [field.split("@")[0] ?? field] : Object.keys(field as object);
      return names.map((depName) => ({ packageFile, depName, depType }));
    });
  });
}

describe("renovate.json5", () => {
  it("holds an update for a person unless a rule lets it merge on its own", () => {
    expect(config.automerge).toBe(false);
  });

  it("lets one rule, for the end-to-end test servers alone, merge an update on its own", () => {
    // The reviewed allow-list: a manager or datasource added to it is a
    // person's decision, made here.
    expect(config.packageRules.filter((rule) => rule.automerge === true)).toEqual([
      {
        matchFileNames: ["e2e/**"],
        matchManagers: ["docker-compose", "dockerfile", "regex"],
        matchDatasources: ["docker", "git-refs"],
        automerge: true,
      },
    ]);
  });

  it("merges a minor or patch update on its own only where the allow-list names it", () => {
    const managers = [
      "npm",
      "github-actions",
      "pip-compile",
      "devcontainer",
      "nvm",
      "dockerfile",
      "docker-compose",
      "regex",
      "a-new-manager",
    ];
    const datasources = [
      "npm",
      "docker",
      "pypi",
      "git-refs",
      "github-tags",
      "github-release-attachments",
      "node-version",
      "a-new-datasource",
    ];
    const merged = managers.flatMap((manager) =>
      datasources.flatMap((datasource) =>
        ["e2e/pod/servers/jss/Dockerfile", "Dockerfile", "scripts/requirements-ci.txt"].flatMap(
          (packageFile) =>
            ["minor", "patch"].flatMap((updateType) => {
              const update = { manager, datasource, packageFile, depName: "a-dep", updateType };
              return automerges(update) ? [`${manager} ${datasource} ${packageFile}`] : [];
            }),
        ),
      ),
    );
    expect([...new Set(merged)].sort()).toEqual([
      "docker-compose docker e2e/pod/servers/jss/Dockerfile",
      "docker-compose git-refs e2e/pod/servers/jss/Dockerfile",
      "dockerfile docker e2e/pod/servers/jss/Dockerfile",
      "dockerfile git-refs e2e/pod/servers/jss/Dockerfile",
      "regex docker e2e/pod/servers/jss/Dockerfile",
      "regex git-refs e2e/pod/servers/jss/Dockerfile",
    ]);
  });

  it("holds every update of a Python tool for a person", () => {
    for (const packageFile of ["scripts/requirements-lint.txt", "scripts/requirements-ci.txt"]) {
      for (const depName of ["zizmor", "reuse", "pyshacl", "actionlint-py", "a-new-tool"]) {
        for (const updateType of UPDATE_TYPES) {
          const update = {
            manager: "pip-compile",
            datasource: "pypi",
            packageFile,
            depName,
            updateType,
          };
          expect(automerges(update)).toBe(false);
        }
      }
    }
  });

  it("holds every update of the dev container's image and features for a person", () => {
    for (const depName of [
      "mcr.microsoft.com/devcontainers/typescript-node",
      "ghcr.io/devcontainers/features/git",
      "ghcr.io/devcontainers/features/docker-in-docker",
      "ghcr.io/devcontainers/features/python",
    ]) {
      for (const updateType of UPDATE_TYPES) {
        const update = {
          manager: "devcontainer",
          datasource: "docker",
          packageFile: ".devcontainer/devcontainer.json",
          depName,
          updateType,
        };
        expect(automerges(update)).toBe(false);
      }
    }
  });

  it("still merges a new commit of Nextcloud's app on its own, but not of the Linked Web Storage fork", () => {
    const update = {
      manager: "regex",
      datasource: "git-refs",
      packageFile: "e2e/pod/servers/nextcloud/Dockerfile",
      depName: "https://github.com/pdsinterop/solid-nextcloud",
      updateType: "digest",
    };
    expect(automerges(update)).toBe(true);
    expect(
      automerges({
        ...update,
        packageFile: "e2e/pod/servers/css-lws/Dockerfile",
        depName: "https://github.com/jeswr/CommunitySolidServer",
      }),
    ).toBe(false);
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

  it("holds every npm update for a person, development tools' included", () => {
    const dependencies = npmDependencies();
    // The root's, the shipped workspaces' and the end-to-end tests'.
    const files = new Set(dependencies.map((dependency) => dependency.packageFile));
    expect(files).toContain("package.json");
    expect(files).toContain("apps/web/package.json");
    expect(files).toContain("e2e/journeys/package.json");
    // A development tool that the deployed site's build runs, one that
    // the release job runs, and one that shares shipped packages with the
    // app in the lockfile.
    const names = new Set(dependencies.map((dependency) => dependency.depName));
    for (const name of ["@preact/preset-vite", "turbo", "semantic-release", "markdownlint-cli2"]) {
      expect(names).toContain(name);
    }
    const merged = dependencies.flatMap((dependency) =>
      UPDATE_TYPES.flatMap((updateType) => {
        const update = { manager: "npm", datasource: "npm", updateType, ...dependency };
        return automerges(update) ? [update] : [];
      }),
    );
    expect(merged).toEqual([]);
  });

  it("holds an npm update whatever it names, in whatever package file", () => {
    for (const depType of [undefined, "devDependencies"]) {
      for (const updateType of UPDATE_TYPES) {
        const update = {
          manager: "npm",
          datasource: "npm",
          packageFile: "tools/new/package.json",
          depName: "a-new-tool",
          depType,
          updateType,
        };
        expect(automerges(update)).toBe(false);
      }
    }
  });

  it("holds an npm package's update in a workflow's comment too", () => {
    // The workflows' regex manager takes whatever datasource a comment names.
    for (const updateType of UPDATE_TYPES) {
      const update = {
        manager: "regex",
        datasource: "npm",
        packageFile: ".github/workflows/ci.yml",
        depName: "a-new-tool",
        updateType,
      };
      expect(automerges(update)).toBe(false);
    }
  });

  it("holds every npm registry package with one rule that matches by its datasource alone", () => {
    const rules = config.packageRules.filter(
      (rule) =>
        JSON.stringify(rule.matchDatasources) === JSON.stringify(["npm"]) &&
        rule.automerge === false,
    );
    expect(rules.map((rule) => Object.keys(rule).sort())).toEqual([
      ["automerge", "matchDatasources"],
    ]);
  });

  it("holds every update to a workflow's action, of every type", () => {
    for (const updateType of UPDATE_TYPES) {
      const update = {
        manager: "github-actions",
        datasource: "github-tags",
        packageFile: ".github/workflows/ci.yml",
        depName: "actions/checkout",
        updateType,
      };
      expect(automerges(update)).toBe(false);
    }
  });

  it("still merges a minor update of another manager's image on its own", () => {
    const update = {
      manager: "docker-compose",
      datasource: "docker",
      packageFile: "e2e/journeys/css/compose.yml",
      depName: "solidproject/community-server",
      updateType: "minor",
    };
    expect(automerges(update)).toBe(true);
    expect(automerges({ ...update, updateType: "major" })).toBe(false);
    expect(automerges({ ...update, updateType: "digest" })).toBe(false);
  });

  it("holds every update of a tool a workflow downloads for a person", () => {
    const update = {
      manager: "regex",
      datasource: "github-release-attachments",
      packageFile: ".github/workflows/ci.yml",
      depName: "owner/tool",
      updateType: "patch",
    };
    expect(automerges(update)).toBe(false);
  });

  it("holds every npm update with one rule that matches by its manager alone", () => {
    const rules = config.packageRules.filter(
      (rule) =>
        JSON.stringify(rule.matchManagers) === JSON.stringify(["npm"]) && rule.automerge === false,
    );
    expect(rules.map((rule) => Object.keys(rule).sort())).toEqual([["automerge", "matchManagers"]]);
  });

  it("refuses a rule field the check does not know", () => {
    // A matcher the check skipped could hold or merge an update unseen.
    expect(() => {
      config.packageRules.push({ matchCategories: ["js"], automerge: true });
      try {
        automerges({
          manager: "npm",
          datasource: "npm",
          packageFile: "package.json",
          depName: "turbo",
          updateType: "patch",
        });
      } finally {
        config.packageRules.pop();
      }
    }).toThrow("no matcher for matchCategories");
  });

  it("holds every major update for a person", () => {
    expect(heldMajor).toBeGreaterThanOrEqual(0);
    expect(Object.keys(config.packageRules[heldMajor] ?? {}).sort()).toEqual([
      "automerge",
      "matchUpdateTypes",
    ]);
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

  it("proposes the update of the Renovate the Pending updates workflow runs once a week", () => {
    const rules = config.packageRules.filter(
      (rule) => JSON.stringify(rule.matchDepNames) === JSON.stringify(["renovate"]),
    );
    expect(rules).toEqual([
      {
        matchFileNames: ["scripts/renovate/package.json"],
        matchDepNames: ["renovate"],
        schedule: ["* 0-3 * * 1"],
      },
    ]);
    expect(
      automerges({
        manager: "npm",
        datasource: "npm",
        packageFile: "scripts/renovate/package.json",
        depName: "renovate",
        depType: "dependencies",
        updateType: "patch",
      }),
    ).toBe(false);
  });

  it("keeps each .npmrc's settings under the npm settings it gives Renovate", () => {
    // Without npmrcMerge, Renovate's npm would lock without the .npmrc
    // files' 3-day wait (scripts/npmrc.test.ts).
    expect(config.npmrc).toBe("allow-remote=all");
    expect(config.npmrcMerge).toBe(true);
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

describe(".devcontainer/devcontainer.json", () => {
  /**
   * A feature named by its major version alone: the dev container CLI can't
   * read a tag and a digest together, so the lock file holds the digest.
   */
  const MAJOR = /^([^@:\s]+):(\d+)$/;

  it("pins its image by digest", () => {
    expect(devcontainer.image).toMatch(/^[^@\s]+:[^@\s]+@sha256:[0-9a-f]{64}$/);
  });

  it("names each feature by its major version", () => {
    const features = Object.keys(devcontainer.features);
    expect(features.length).toBeGreaterThan(0);
    for (const feature of features) expect(feature).toMatch(MAJOR);
  });

  it("locks each feature, and only those, to a digest of that major version", () => {
    const features = Object.keys(devcontainer.features);
    expect(Object.keys(devcontainerLock.features).sort()).toEqual([...features].sort());
    for (const feature of features) {
      const [, name, major] = MAJOR.exec(feature) ?? [];
      const locked = devcontainerLock.features[feature];
      expect(locked?.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(locked?.resolved).toBe(`${name}@${locked?.integrity}`);
      expect(locked?.version).toMatch(new RegExp(`^${major}\\.\\d+\\.\\d+$`));
    }
  });
});
