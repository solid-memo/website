// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The release workflow's jobs restore nothing from GitHub's cache
 * (docs/releasing.md#the-deploy-key): the release job holds the deploy
 * key, the docs job attests what it renders, and any job on main can
 * write main's cache entries. Nor do the jobs that build the site that
 * is deployed (docs/deployment.md#the-build-ci-tested): ci.yml's site
 * job and deploy.yml's build job. And the deploy ships CI's site only
 * once its files match the site job's attestation, which no other job
 * of a run can make. ci.yml's check job and the release job check the
 * registry's signatures of what they install, the release job before
 * Chromium and the key (docs/testing.md#the-workflows).
 */

const ROOT = join(import.meta.dirname, "..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

/** The steps of a workflow (indented 6) or of a composite action (indented 4). */
function steps(yaml: string, indent: number): string[] {
  return yaml.split(new RegExp(`^ {${indent}}- `, "m")).slice(1);
}

/** A workflow's jobs, by name (each indented 2 under `jobs:`). */
function jobs(yaml: string): Map<string, string> {
  const parts = yaml.slice(yaml.indexOf("\njobs:\n")).split(/^ {2}([\w-]+):$/m);
  const byName = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 2) byName.set(parts[i], parts[i + 1]);
  return byName;
}

const workflow = jobs(read(".github/workflows/release.yml"));
const release = [...workflow.values()].flatMap((job) => steps(job, 6));

describe("release.yml", () => {
  it("has the release and docs jobs", () => {
    expect([...workflow.keys()]).toEqual(["release", "docs"]);
  });

  it("uses no cache action", () => {
    expect(release.filter((step) => /uses:\s*actions\/cache/.test(step))).toEqual([]);
  });

  it("sets up Node without npm's cache", () => {
    const setups = release.filter((step) => step.includes("uses: actions/setup-node@"));
    expect(setups).toHaveLength(2);
    for (const step of setups) {
      expect(step).not.toMatch(/^\s+cache:/m);
      expect(step).toMatch(/^\s+package-manager-cache: false$/m);
    }
  });

  it("installs Chromium and its system libraries without the cache in the release job", () => {
    const local = steps(workflow.get("release") ?? "", 6).filter((step) =>
      /uses: \.\/\.github\/actions\//.test(step),
    );
    expect(local.map((step) => step.match(/uses: (\S+)/)?.[1])).toEqual([
      "./.github/actions/chromium",
    ]);
    for (const step of local) expect(step).toMatch(/^\s+with:\n\s+cache: false$/m);
  });

  // A local action is the checkout's, and the docs job checks out the
  // tag, whose copy of an action may restore from the cache.
  it("runs no local action in the docs job, which checks out the tag", () => {
    const docs = steps(workflow.get("docs") ?? "", 6);
    expect(docs.some((step) => step.includes("ref: ${{ inputs.tag }}"))).toBe(true);
    expect(docs.filter((step) => /uses:\s*\.\//.test(step))).toEqual([]);
    expect(docs.filter((step) => step.includes("npx playwright install"))).toEqual([
      expect.stringContaining("run: npx playwright install --with-deps --only-shell chromium"),
    ]);
  });
});

// Any commit can be titled chore(release), and a pull request's commits
// stay in main's history, so a release commit is told apart by
// scripts/releaseCommit.ts, not by its subject (docs/releasing.md#when-a-release-fails).
describe("the release commit's checks", () => {
  const releaseJob = steps(workflow.get("release") ?? "", 6);
  const version = steps(jobs(read(".github/workflows/deploy.yml")).get("version") ?? "", 6);
  const at = (job: string[], text: string) => job.findIndex((step) => step.includes(text));

  it("find the last release in release.yml with the script, after Node is set up", () => {
    const tip = at(releaseJob, "name: CI passed on main's tip");
    expect(releaseJob[tip]).toMatch(/^ {10}npm run release:commit -- last$/m);
    expect(releaseJob[tip]).not.toContain("git log");
    expect(at(releaseJob, "uses: actions/setup-node@")).toBeLessThan(tip);
    expect(at(releaseJob, "uses: actions/setup-node@")).toBeGreaterThan(
      at(releaseJob, "uses: actions/checkout@"),
    );
  });

  it("check the tag's commit in deploy.yml with the script, against origin/main", () => {
    const checked = at(version, "name: The tag is the newest release");
    expect(version[checked]).toMatch(
      /^ {10}RELEASE_MAIN=FETCH_HEAD npm run release:commit -- tag "\$TAG"$/m,
    );
    expect(version[checked]).not.toContain("git log");
    expect(version[checked].indexOf("git fetch --force --quiet origin main")).toBeLessThan(
      version[checked].indexOf("npm run release:commit"),
    );
    expect(version[checked].indexOf("npm run release:commit")).toBeLessThan(
      version[checked].indexOf('echo "sha=$sha"'),
    );
    const setup = at(version, "uses: actions/setup-node@");
    expect(setup).toBeGreaterThan(-1);
    expect(setup).toBeLessThan(checked);
    expect(version[setup]).toMatch(/^\s+package-manager-cache: false$/m);
  });
});

describe.each([
  [".github/workflows/ci.yml", "site"],
  [".github/workflows/deploy.yml", "build"],
])("%s's %s job, which builds the site that is deployed", (path, name) => {
  const job = steps(jobs(read(path)).get(name) ?? "", 6);

  it("uses no cache action", () => {
    expect(job).not.toEqual([]);
    expect(job.filter((step) => /uses:\s*actions\/cache/.test(step))).toEqual([]);
  });

  it("sets up Node without npm's cache", () => {
    const setups = job.filter((step) => step.includes("uses: actions/setup-node@"));
    expect(setups).toHaveLength(1);
    for (const step of setups) {
      expect(step).not.toMatch(/^\s+cache:/m);
      expect(step).toMatch(/^\s+package-manager-cache: false$/m);
    }
  });

  it("installs Chromium and its system libraries without the cache", () => {
    const local = job.filter((step) => /uses: \.\/\.github\/actions\//.test(step));
    expect(local.map((step) => step.match(/uses: (\S+)/)?.[1])).toEqual([
      "./.github/actions/chromium",
    ]);
    for (const step of local) expect(step).toMatch(/^\s+with:\n\s+cache: false$/m);
  });
});

describe("the site the deploy ships", () => {
  const ci = read(".github/workflows/ci.yml");
  const ciJobs = jobs(ci);
  const site = steps(ciJobs.get("site") ?? "", 6);
  const deploy = jobs(read(".github/workflows/deploy.yml"));
  const build = steps(deploy.get("build") ?? "", 6);
  /** The list of the site's files and their SHA-256 that is attested. */
  const manifest = "find . ! -type d -print0 | LC_ALL=C sort -z | xargs -0r sha256sum";
  const at = (job: string[], text: string) => job.findIndex((step) => step.includes(text));

  it("is uploaded as ci.yml's site artifact by the site and reuse jobs alone", () => {
    const uploaders = [...ciJobs]
      .filter(([, job]) =>
        steps(job, 6).some(
          (step) =>
            step.includes("uses: actions/upload-artifact@") && /^\s+name: site$/m.test(step),
        ),
      )
      .map(([name]) => name);
    expect(uploaders).toEqual(["site", "reuse"]);
  });

  it("is taken over by a reuse job that restores no cache and runs no code", () => {
    const reuse = steps(ciJobs.get("reuse") ?? "", 6);
    expect(reuse).not.toEqual([]);
    for (const step of reuse) {
      expect(step).toMatch(/uses: actions\/(download-artifact|upload-artifact|cache\/save)@/);
      expect(step).not.toMatch(/^\s+run:/m);
    }
  });

  it("is attested by the site job, the only job of ci.yml that can attest", () => {
    expect(ci.match(/^\s+id-token: write$/gm)).toHaveLength(1);
    expect(ci.match(/^\s+attestations: write$/gm)).toHaveLength(1);
    expect(ciJobs.get("site")).toMatch(/^ {6}id-token: write$/m);
    const listed = at(site, manifest);
    const attested = at(site, "uses: actions/attest@");
    const uploaded = at(site, "uses: actions/upload-artifact@");
    expect(site[listed]).toContain('> "$RUNNER_TEMP/site.sha256"');
    expect(site[attested]).toMatch(/^\s+subject-path: \$\{\{ runner\.temp \}\}\/site\.sha256$/m);
    expect(listed).toBeGreaterThan(-1);
    expect(attested).toBeGreaterThan(listed);
    expect(uploaded).toBeGreaterThan(attested);
  });

  it("is checked against that attestation before the deploy states its version", () => {
    const downloaded = at(build, "uses: actions/download-artifact@");
    const checked = at(build, "gh attestation verify");
    const stated = at(build, 'npm run site:version -- "$SITE"');
    expect(downloaded).toBeGreaterThan(-1);
    expect(checked).toBeGreaterThan(downloaded);
    expect(stated).toBeGreaterThan(checked);
    expect(build[checked]).toContain(manifest);
    expect(build[checked]).toContain(
      "^https://github\\.com/$GH_REPO/\\.github/workflows/ci\\.yml@refs/heads/(main|gh-readonly-queue/main/.+)\\$",
    );
    expect(build[checked]).toContain('for digest in "$SHA" "$PARENT"; do');
    expect(build[checked]).toContain('--source-digest "$digest" --deny-self-hosted-runners');
    expect(deploy.get("build")).toMatch(/^ {6}attestations: read$/m);
    expect(deploy.get("version")).toMatch(
      /^ {6}parent: \$\{\{ steps\.release\.outputs\.parent \}\}$/m,
    );
  });
});

describe("npm audit signatures", () => {
  const at = (job: string[], text: string) => job.findIndex((step) => step.includes(text));
  const install = "npm ci --ignore-scripts";
  const audit = /^\s*run: npm audit signatures$/m;

  it("runs right after the install in ci.yml's check job", () => {
    const check = steps(jobs(read(".github/workflows/ci.yml")).get("check") ?? "", 6);
    const installed = at(check, install);
    expect(installed).toBeGreaterThan(-1);
    expect(check[installed + 1]).toMatch(audit);
  });

  it("runs right after the install in the release job, before Chromium and semantic-release", () => {
    const job = steps(workflow.get("release") ?? "", 6);
    const installed = at(job, install);
    expect(installed).toBeGreaterThan(-1);
    const audited = job[installed + 1];
    expect(audited).toMatch(audit);
    expect(audited).toMatch(/^if: steps\.tip\.outputs\.release == 'true'$/m);
    expect(audited).not.toContain("secrets.");
    expect(at(job, "uses: ./.github/actions/chromium")).toBe(installed + 2);
    expect(at(job, "name: npx semantic-release")).toBeGreaterThan(installed + 2);
  });
});

describe("the Chromium action's cache input", () => {
  const chromium = steps(read(".github/actions/chromium/action.yml"), 4);
  const deps = steps(read(".github/actions/playwright-deps/action.yml"), 4);

  it("skips every cache step when false", () => {
    for (const step of [...chromium, ...deps].filter((s) => s.includes("uses: actions/cache"))) {
      expect(step).toMatch(/inputs\.cache == 'true'/);
    }
  });

  it("is passed on to playwright-deps", () => {
    const call = chromium.find((step) => step.includes("uses: ./.github/actions/playwright-deps"));
    expect(call).toMatch(/^\s+cache: \$\{\{ inputs\.cache \}\}$/m);
  });
});
