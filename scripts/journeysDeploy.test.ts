// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The deploy's journeys job publishes the journeys-report artifact of
 * the CI run, which any job of that run could have replaced, with the
 * journeys repository's deploy key (docs/deployment.md#the-journeys-report).
 * Its steps run here as the workflow states them, on a report with a git
 * directory, hooks and links of its own: the report is refused, and git
 * keeps its repository out of the report and runs nothing the report
 * names.
 */

const ROOT = join(import.meta.dirname, "..");

/** The steps of the deploy workflow's journeys job (indented 6). */
function journeysSteps(): string[] {
  const yaml = readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8");
  const job = yaml.split(/^ {2}journeys:$/m)[1].split(/^ {2}[\w-]+:$/m)[0];
  return job.split(/^ {6}- /m).slice(1);
}

/** The shell script of the step named `name`. */
function script(name: string): string {
  const step = journeysSteps().find((s) => s.startsWith(`name: ${name}\n`));
  if (step === undefined) throw new Error(`no step named ${name}`);
  const run = step.split(/^ {8}run: \|\n/m)[1];
  return run
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

let temp: string;
let report: string;
let remote: string;
/** A file the report's hooks and monitor write to, when they run. */
let ran: string;

/** Runs a step's script as GitHub runs a bash step, with the runner's paths here. */
function run(name: string) {
  const bin = join(temp, "bin");
  return spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script(name)], {
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: temp,
      GIT_CONFIG_NOSYSTEM: "1",
      RUNNER_TEMP: temp,
      GITHUB_WORKSPACE: ROOT,
      GITHUB_REPOSITORY: "solid-memo/website",
      JOURNEYS_REPO: "solid-memo/journeys",
      JOURNEYS_HOST: "journeys.example",
      KEY: "not-a-key",
      TAG: "v1.2.3",
      RUN_URL: "https://example.com/run",
      GH_TOKEN: "",
    },
  });
}

function git(...args: string[]): string {
  const out = spawnSync("git", args, {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: temp, GIT_CONFIG_NOSYSTEM: "1" },
  });
  expect(out.status, out.stderr).toBe(0);
  return out.stdout;
}

/** A report as an artifact any job could upload: a git directory with a hook and a monitor. */
function plantGit() {
  git("init", "--quiet", report);
  const hook = `#!/bin/sh\necho hook >> "${ran}"\n`;
  for (const name of ["pre-commit", "post-commit", "pre-push", "reference-transaction"]) {
    writeFileSync(join(report, ".git/hooks", name), hook);
    chmodSync(join(report, ".git/hooks", name), 0o755);
  }
  git("-C", report, "config", "core.fsmonitor", `echo monitor >> "${ran}"; false`);
}

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), "journeys-deploy-"));
  report = join(temp, "journeys");
  remote = join(temp, "remote.git");
  ran = join(temp, "ran");
  mkdirSync(join(report, "data"), { recursive: true });
  writeFileSync(join(report, "index.html"), "<html></html>\n");
  writeFileSync(join(report, "data", "trace.zip"), "zip\n");
  git("init", "--quiet", "--bare", remote);
  // gh answers with no host keys, and ssh hands the push to the bare
  // repository here.
  mkdirSync(join(temp, "bin"));
  writeFileSync(join(temp, "bin", "gh"), "#!/bin/sh\n");
  writeFileSync(
    join(temp, "bin", "ssh"),
    `#!/bin/sh\nfor last; do :; done\ncase "$last" in git-receive-pack*) ;; *) exit 1;; esac\nunset GIT_DIR GIT_WORK_TREE\nexec git receive-pack "${remote}"\n`,
  );
  chmodSync(join(temp, "bin", "gh"), 0o755);
  chmodSync(join(temp, "bin", "ssh"), 0o755);
});

afterEach(() => {
  rmSync(temp, { recursive: true, force: true });
});

describe("the report is plain files", () => {
  it("passes Playwright's report", () => {
    const out = run("The report is plain files");
    expect(out.status, out.stderr).toBe(0);
  });

  it("refuses a report with a git directory", () => {
    plantGit();
    const out = run("The report is plain files");
    expect(out.status).not.toBe(0);
    expect(out.stdout).toContain("./.git\n");
    expect(out.stdout).toContain("::error::The journeys-report artifact holds a hidden entry");
    expect(existsSync(ran)).toBe(false);
  });

  it("refuses a report with a hidden file anywhere", () => {
    writeFileSync(join(report, "data", ".gitattributes"), "* filter=x\n");
    const out = run("The report is plain files");
    expect(out.status).not.toBe(0);
    expect(out.stdout).toContain("./data/.gitattributes");
  });

  it("refuses a report with a link", () => {
    symlinkSync(temp, join(report, "trace"));
    const out = run("The report is plain files");
    expect(out.status).not.toBe(0);
    expect(out.stdout).toContain("./trace\n");
  });

  it("refuses a report without its index", () => {
    rmSync(join(report, "index.html"));
    expect(run("The report is plain files").status).not.toBe(0);
  });
});

describe("publishing the report", () => {
  it("pushes the report and the files Pages needs as one commit", () => {
    const out = run("Publish the report to the journeys repository");
    expect(out.status, out.stderr).toBe(0);
    expect(git("--git-dir", remote, "rev-list", "--count", "main").trim()).toBe("1");
    expect(git("--git-dir", remote, "ls-tree", "-r", "--name-only", "main").split("\n")).toEqual([
      ".nojekyll",
      "CNAME",
      "data/trace.zip",
      "index.html",
      "robots.txt",
      "trace/index.html",
      "trace/sw.bundle.js",
      "",
    ]);
    expect(git("--git-dir", remote, "show", "main:CNAME")).toBe("journeys.example\n");
  });

  // Even past the check, git neither uses nor runs what the report holds.
  it("keeps git's repository out of the report and runs none of its hooks", () => {
    plantGit();
    const out = run("Publish the report to the journeys repository");
    expect(out.status, out.stderr).toBe(0);
    expect(existsSync(ran)).toBe(false);
    expect(git("-C", report, "-c", "core.fsmonitor=false", "rev-list", "--all")).toBe("");
    expect(git("--git-dir", remote, "ls-tree", "-r", "--name-only", "main")).not.toContain(".git/");
  });
});
