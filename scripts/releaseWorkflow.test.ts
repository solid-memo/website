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
 * write main's cache entries.
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
