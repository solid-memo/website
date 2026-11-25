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
 * The deploy's journeys and storybook jobs each publish an artifact of
 * the CI run, which any job of that run could have replaced, with a
 * deploy key of another repository: the journeys' report
 * (docs/deployment.md#the-journeys-report) and the Storybook
 * (docs/storybook.md#where-it-is-published). Their steps run here as the
 * workflow states them, on an artifact with a git directory, hooks and
 * links of its own: the artifact is refused, and git keeps its
 * repository out of the artifact and runs nothing the artifact names.
 */

const ROOT = join(import.meta.dirname, "..");

/** The steps of the deploy workflow's job `job` (indented 6). */
function jobSteps(job: string): string[] {
  const yaml = readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8");
  const text = yaml.split(new RegExp(`^ {2}${job}:$`, "m"))[1].split(/^ {2}[\w-]+:$/m)[0];
  return text.split(/^ {6}- /m).slice(1);
}

/** The shell script of the step named `name` of the job `job`. */
function script(job: string, name: string): string {
  const step = jobSteps(job).find((s) => s.startsWith(`name: ${name}\n`));
  if (step === undefined) throw new Error(`no step named ${name}`);
  const run = step.split(/^ {8}run: \|\n/m)[1];
  return run
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

/** A job that publishes an artifact to a repository of its own, and what it is tested with. */
interface PublishingJob {
  /** The job's name in deploy.yml. */
  job: string;
  /** The artifact's folder under RUNNER_TEMP. */
  folder: string;
  /** The step that checks the artifact, and its error's start. */
  check: string;
  refused: string;
  /** The step that publishes it. */
  publish: string;
  /** The host its CNAME names, here. */
  host: string;
  /** What the repository's commit holds, from an artifact of an index.html and data/trace.zip. */
  published: string[];
}

const JOBS: PublishingJob[] = [
  {
    job: "journeys",
    folder: "journeys",
    check: "The report is plain files",
    refused: "::error::The journeys-report artifact holds a hidden entry",
    publish: "Publish the report to the journeys repository",
    host: "journeys.example",
    published: [
      ".nojekyll",
      "CNAME",
      "data/trace.zip",
      "index.html",
      "robots.txt",
      "trace/index.html",
      "trace/sw.bundle.js",
    ],
  },
  {
    job: "storybook",
    folder: "storybook",
    check: "The Storybook is plain files",
    refused: "::error::The storybook artifact holds a hidden entry",
    publish: "Publish the Storybook to the storybook repository",
    host: "storybook.example",
    published: [".nojekyll", "CNAME", "data/trace.zip", "index.html", "robots.txt"],
  },
];

let temp: string;
let artifact: string;
let remote: string;
/** A file the artifact's hooks and monitor write to, when they run. */
let ran: string;

/** Runs a step's script of a job as GitHub runs a bash step, with the runner's paths here. */
function run(job: string, name: string) {
  const bin = join(temp, "bin");
  return spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script(job, name)], {
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
      STORYBOOK_REPO: "solid-memo/storybook",
      STORYBOOK_HOST: "storybook.example",
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

/** An artifact as any job could upload it: a git directory with a hook and a monitor. */
function plantGit() {
  git("init", "--quiet", artifact);
  const hook = `#!/bin/sh\necho hook >> "${ran}"\n`;
  for (const name of ["pre-commit", "post-commit", "pre-push", "reference-transaction"]) {
    writeFileSync(join(artifact, ".git/hooks", name), hook);
    chmodSync(join(artifact, ".git/hooks", name), 0o755);
  }
  git("-C", artifact, "config", "core.fsmonitor", `echo monitor >> "${ran}"; false`);
}

describe.each(JOBS)("the $job job", ({ job, folder, check, refused, publish, host, published }) => {
  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), `${job}-deploy-`));
    artifact = join(temp, folder);
    remote = join(temp, "remote.git");
    ran = join(temp, "ran");
    mkdirSync(join(artifact, "data"), { recursive: true });
    writeFileSync(join(artifact, "index.html"), "<html></html>\n");
    writeFileSync(join(artifact, "data", "trace.zip"), "zip\n");
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

  describe("the artifact is plain files", () => {
    it("passes plain files", () => {
      const out = run(job, check);
      expect(out.status, out.stderr).toBe(0);
    });

    it("refuses an artifact with a git directory", () => {
      plantGit();
      const out = run(job, check);
      expect(out.status).not.toBe(0);
      expect(out.stdout).toContain("./.git\n");
      expect(out.stdout).toContain(refused);
      expect(existsSync(ran)).toBe(false);
    });

    it("refuses an artifact with a hidden file anywhere", () => {
      writeFileSync(join(artifact, "data", ".gitattributes"), "* filter=x\n");
      const out = run(job, check);
      expect(out.status).not.toBe(0);
      expect(out.stdout).toContain("./data/.gitattributes");
    });

    it("refuses an artifact with a link", () => {
      symlinkSync(temp, join(artifact, "trace"));
      const out = run(job, check);
      expect(out.status).not.toBe(0);
      expect(out.stdout).toContain("./trace\n");
    });

    it("refuses an artifact without its index", () => {
      rmSync(join(artifact, "index.html"));
      expect(run(job, check).status).not.toBe(0);
    });
  });

  describe("publishing the artifact", () => {
    it("pushes the artifact and the files Pages needs as one commit", () => {
      const out = run(job, publish);
      expect(out.status, out.stderr).toBe(0);
      expect(git("--git-dir", remote, "rev-list", "--count", "main").trim()).toBe("1");
      expect(git("--git-dir", remote, "ls-tree", "-r", "--name-only", "main").split("\n")).toEqual([
        ...published,
        "",
      ]);
      expect(git("--git-dir", remote, "show", "main:CNAME")).toBe(`${host}\n`);
    });

    // Even past the check, git neither uses nor runs what the artifact holds.
    it("keeps git's repository out of the artifact and runs none of its hooks", () => {
      plantGit();
      const out = run(job, publish);
      expect(out.status, out.stderr).toBe(0);
      expect(existsSync(ran)).toBe(false);
      expect(git("-C", artifact, "-c", "core.fsmonitor=false", "rev-list", "--all")).toBe("");
      expect(git("--git-dir", remote, "ls-tree", "-r", "--name-only", "main")).not.toContain(
        ".git/",
      );
    });
  });
});
