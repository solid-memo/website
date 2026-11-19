// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archivePath } from "./docsArchive.ts";

/**
 * The release workflow's jobs restore nothing from GitHub's cache
 * (docs/releasing.md#the-deploy-key): what the prepare job makes is
 * pushed with the deploy key, the docs job attests what it renders, and
 * any job on main can write main's cache entries. Nor do the jobs that
 * build the site that is deployed (docs/deployment.md#the-build-ci-tested):
 * ci.yml's site job and deploy.yml's build job. And the deploy ships
 * CI's site only once its files match the site job's attestation, which
 * no other job of a run can make. ci.yml's check job and the release
 * workflow's prepare job check the registry's signatures of what they
 * install, the prepare job before Chromium
 * (docs/testing.md#the-workflows). Only the push job holds the deploy
 * key, every step of which can read it: it installs nothing, loads no
 * package and runs no browser, and pushes a release commit only once
 * main's script has checked it (docs/releasing.md#the-deploy-key).
 * semantic-release runs in the prepare job, which holds no key and no
 * token that can write, and pushes only to a bare copy of its checkout.
 * A push run releases only while the merge queue is empty, which a job
 * that holds nothing asks (docs/releasing.md#what-a-release-does).
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

const releaseYml = read(".github/workflows/release.yml");
const workflow = jobs(releaseYml);
const release = [...workflow.values()].flatMap((job) => steps(job, 6));

/** A job's lines that are not comments. */
function code(job: string): string {
  return job
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

describe("release.yml", () => {
  it("has the queue, draw, prepare, push, publish and docs jobs", () => {
    expect([...workflow.keys()]).toEqual(["queue", "prepare", "push", "publish", "docs"]);
  });

  // Each job asks for what it needs; only the push job holds the key.
  it("gives the key to the push job alone", () => {
    expect(releaseYml).toMatch(/^permissions: \{\}$/m);
    for (const [name, job] of workflow) {
      expect(job, name).toMatch(/^ {4}permissions:$/m);
      const keyed = name === "push";
      expect(/^ {4}environment: release$/m.test(job), name).toBe(keyed);
      expect(/secrets\./.test(code(job)), name).toBe(keyed);
    }
    expect(code(releaseYml.slice(0, releaseYml.indexOf("\njobs:\n")))).not.toMatch(/secrets\./);
  });

  // One run at a time, so no run's prepare job runs between another's
  // prepare and push; a run that cannot release never replaces one
  // waiting.
  it("runs one release at a time, in a group of the workflow's", () => {
    const head = releaseYml.slice(0, releaseYml.indexOf("\njobs:\n"));
    expect(head).toMatch(/^concurrency:\n {2}group: >-\n/m);
    expect(head).toContain("format('release-docs-{0}', inputs.tag)");
    expect(head).toContain("'release') ||");
    expect(head).toContain("format('release-none-{0}', github.run_id)");
    expect(head).toMatch(/^ {2}cancel-in-progress: false$/m);
    for (const [name, job] of workflow) expect(job, name).not.toMatch(/concurrency:/);
  });

  // The queue job runs on workflow_run, beside the job that holds the
  // key, so it holds nothing: no secret, no environment, no checkout,
  // and a token that can only read.
  it("asks for the merge queue's entries in a job that holds nothing", () => {
    const queue = workflow.get("queue") ?? "";
    expect(queue).toMatch(/^ {4}permissions:\n {6}contents: read\n {4}outputs:$/m);
    expect(queue).not.toMatch(/secrets\.|environment:|uses:/);
    expect(queue).toContain('mergeQueue(branch: "main") { entries { totalCount } }');
  });

  // A run by hand releases main's tip whatever the queue holds; a push
  // run, only once the queue job found it empty.
  it("releases after a push run only when the merge queue is empty", () => {
    const job = workflow.get("prepare") ?? "";
    expect(job).toContain(
      "needs.queue.result == 'success' && needs.queue.outputs.entries == '0'))",
    );
    expect(job).toMatch(/^ {4}needs: queue$/m);
    expect(job).toMatch(/^ {6}!cancelled\(\) && \($/m);
    expect(workflow.get("push")).toMatch(
      /^ {4}needs: prepare\n {4}if: needs\.prepare\.outputs\.tag != ''$/m,
    );
    expect(workflow.get("publish")).toMatch(
      /^ {4}needs: \[prepare, push\]\n {4}if: needs\.push\.outputs\.pushed == 'true'$/m,
    );
  });

  it("uses no cache action", () => {
    expect(release.filter((step) => /uses:\s*actions\/cache/.test(step))).toEqual([]);
  });

  it("sets up Node without npm's cache", () => {
    const setups = release.filter((step) => step.includes("uses: actions/setup-node@"));
    expect(setups).toHaveLength(5);
    for (const step of setups) {
      expect(step).not.toMatch(/^\s+cache:/m);
      expect(step).toMatch(/^\s+package-manager-cache: false$/m);
    }
  });

  it("installs Chromium and its system libraries without the cache in the prepare job", () => {
    const local = steps(workflow.get("prepare") ?? "", 6).filter((step) =>
      /uses: \.\/\.github\/actions\//.test(step),
    );
    expect(local.map((step) => step.match(/uses: (\S+)/)?.[1])).toEqual([
      "./.github/actions/chromium",
    ]);
    for (const step of local) expect(step).toMatch(/^\s+with:\n\s+cache: false$/m);
  });

  // A local action is the checkout's, and the docs job checks out the
  // tag's commit, whose copy of an action may restore from the cache.
  it("runs no local action in the docs job, which checks out the tag's commit", () => {
    const docs = steps(workflow.get("docs") ?? "", 6);
    expect(docs.some((step) => step.includes('git checkout --quiet --detach "$SHA"'))).toBe(true);
    expect(docs.filter((step) => /uses:\s*\.\//.test(step))).toEqual([]);
    // The shell from its own download, checked against the pinned
    // SHA-256 (npm run check:shell), and only the libraries from
    // Playwright, which takes them from Ubuntu's signed mirror.
    const installs = docs.filter((step) => step.includes("npx playwright install"));
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatch(/^ {8}run: npx playwright install-deps chromium$/m);
    expect(installs[0]).not.toMatch(/playwright install(?!-deps)/);
    const shell = docs.findIndex((step) => step.includes("sha256sum -c -"));
    expect(docs[shell]).toMatch(/^ {10}CHROMIUM_HEADLESS_SHELL_SHA256: [0-9a-f]{64}$/m);
    expect(docs[shell + 1]).toBe(installs[0]);
  });

  // GitHub hands a job its environment's secrets when it starts, so any
  // step of the push job could read the key: it runs only actions that
  // check out, set up Node and download this run's bundle, git, ssh and
  // main's own scripts, which import no package.
  it("installs nothing and loads no package in the job that holds the deploy key", () => {
    const push = workflow.get("push") ?? "";
    expect(push).toMatch(/^ {4}permissions:\n {6}contents: read\n/m);
    expect(code(push)).not.toMatch(
      /npm ci|npm install|npx|\.\/\.github\/actions\/|playwright|\bapt(-get)?\b|chromium|docs:archive/i,
    );
    const job = steps(push, 6);
    expect(job.map((step) => step.match(/uses: ([^@\s]+)/)?.[1]).filter(Boolean)).toEqual([
      "actions/checkout",
      "actions/setup-node",
      "actions/download-artifact",
    ]);
    const at = (text: string) => job.findIndex((step) => step.includes(text));
    expect(job[at("uses: actions/checkout@")]).toMatch(/^ {10}persist-credentials: false$/m);
    const downloaded = at("uses: actions/download-artifact@");
    expect(job[downloaded]).toMatch(/^ {10}name: release-bundle$/m);
    expect(job[downloaded]).not.toMatch(/run-id|github-token|repository:/);
    // The tag alone from the bundle, and its commit checked by main's
    // script before the key is written anywhere.
    const checked = at("name: The release commit may be pushed onto main");
    expect(checked).toBe(downloaded + 1);
    expect(job[checked]).toContain('git bundle verify --quiet "$bundle"');
    expect(job[checked]).toContain(
      'git fetch --no-tags --quiet "$bundle" "refs/tags/$TAG:refs/tags/$TAG"',
    );
    expect(job[checked]).toMatch(/^ {10}npm run release:commit -- next "\$TAG"$/m);
    const pushed = at("name: Push the release commit and its tag");
    expect(pushed).toBe(checked + 1);
    expect(job[pushed]).toMatch(
      /^ {10}git push --atomic "\$REPOSITORY_URL" "\$sha:refs\/heads\/main" "refs\/tags\/\$TAG:refs\/tags\/\$TAG"$/m,
    );
    expect(job[pushed]).not.toMatch(/--force|\s-f\b|"\+/);
    const keyed = job.filter((step) => step.includes("secrets.SEMANTIC_RELEASE_KEY"));
    expect(keyed.map((step) => job.indexOf(step))).toEqual([
      at("name: The deploy key is set"),
      pushed,
    ]);
  });

  // semantic-release, with no key and no token that can write, pushes to
  // a bare copy that stands in for GitHub's URL, with https refused.
  it("runs semantic-release in a job that holds no key, into a bare copy", () => {
    const prepare = workflow.get("prepare") ?? "";
    expect(prepare).toMatch(
      /^ {4}permissions:\n {6}contents: read\n(?: {6}#.*\n)* {6}actions: read\n {4}outputs:$/m,
    );
    const job = steps(prepare, 6);
    const at = (text: string) => job.findIndex((step) => step.includes(text));
    expect(job[at("uses: actions/checkout@")]).toMatch(/^ {10}persist-credentials: false$/m);
    // This run's drawings, made in Chromium before semantic-release,
    // whose archive draws nothing.
    const drawn = at("name: Draw the docs' diagrams");
    expect(drawn).toBe(at("uses: ./.github/actions/chromium") + 1);
    expect(job[drawn]).toMatch(/^ {8}run: npm run docs:archive -- --draw$/m);
    expect(job.filter((step) => step.includes("download-artifact"))).toEqual([]);
    const released = at("name: npx semantic-release");
    expect(released).toBe(drawn + 1);
    expect(job[released]).not.toMatch(/TOKEN|secrets\.|docs:archive/);
    expect(job[released]).toMatch(
      /^ {10}REPOSITORY_URL: https:\/\/github\.com\/\$\{\{ github\.repository \}\}\.git$/m,
    );
    const lines = job[released]!.split("\n").map((line) => line.trim());
    const line = (text: string) => lines.indexOf(text);
    expect(line('git clone --quiet --bare . "$copy"')).toBeGreaterThan(-1);
    expect(line('git config "url.file://$copy.insteadOf" "$REPOSITORY_URL"')).toBe(
      line('git clone --quiet --bare . "$copy"') + 1,
    );
    expect(line("git config protocol.https.allow never")).toBe(
      line('git config "url.file://$copy.insteadOf" "$REPOSITORY_URL"') + 1,
    );
    expect(line('npx semantic-release --repository-url "$REPOSITORY_URL"')).toBe(
      line("git config protocol.https.allow never") + 1,
    );
    const bundled = at("name: The release, as a bundle");
    expect(bundled).toBe(released + 1);
    expect(job[bundled]).toContain(
      'git -C "$copy" bundle create "$RUNNER_TEMP/bundle/release.bundle" "refs/tags/$tag" "^$TIP"',
    );
    const uploads = job.slice(bundled + 1);
    expect(uploads.map((step) => step.match(/^ {10}name: (\S+)$/m)?.[1])).toEqual([
      "release-bundle",
      "release-docs",
    ]);
    expect(uploads[1]).toContain(`path: ${archivePath("${{ steps.released.outputs.version }}")}`);
  });

  // The release is made as a draft, which the deploy refuses, and
  // published once its archive is attested and attached.
  it("makes the GitHub release in a job that holds no key, from main's notes", () => {
    const publish = workflow.get("publish") ?? "";
    expect(code(publish)).not.toMatch(/npm ci|npx|\.\/\.github\/actions\//);
    const job = steps(publish, 6);
    const at = (text: string) => job.findIndex((step) => step.includes(text));
    expect(job[at("uses: actions/checkout@")]).toMatch(/^ {10}persist-credentials: false$/m);
    const notes = at("name: The release's notes");
    expect(job[notes]).toMatch(/^ {10}npm run release:commit -- tag "\$TAG"$/m);
    expect(job[notes]).toMatch(
      /^ {10}npm run --silent release:commit -- notes "\$TAG" > "\$RUNNER_TEMP\/notes\.md"$/m,
    );
    const downloaded = at("uses: actions/download-artifact@");
    expect(job[downloaded]).toMatch(/^ {10}name: release-docs$/m);
    const attested = at("uses: actions/attest@");
    expect(attested).toBe(downloaded + 1);
    const made = at("name: Make the GitHub release");
    expect(made).toBe(attested + 1);
    const commands = job[made]!.split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("gh "));
    expect(commands).toEqual([
      'gh release create "$TAG" --verify-tag --draft --title "Solid Memo $version" --notes-file "$RUNNER_TEMP/notes.md"',
      `gh release upload "$TAG" "${archivePath("$version")}#Documentation $version (HTML)"`,
      'gh release edit "$TAG" --draft=false --latest',
    ]);
  });
});

// Any commit can be titled chore(release), and a pull request's commits
// stay in main's history, so a release commit is told apart by
// scripts/releaseCommit.ts, not by its subject (docs/releasing.md#when-a-release-fails).
describe("the release commit's checks", () => {
  const releaseJob = steps(workflow.get("prepare") ?? "", 6);
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

  // A bare name is a branch's before it is a tag's for actions/checkout,
  // so the docs job reads the tag as refs/tags/<tag>, checks its commit
  // with main's script before anything of the tag's is checked out, and
  // checks out that commit by its SHA.
  it("check the tag's commit in release.yml's docs job, then check out its SHA", () => {
    const docs = steps(workflow.get("docs") ?? "", 6);
    expect(docs.filter((step) => step.includes("inputs.tag") && /\bref:/.test(step))).toEqual([]);
    const checkouts = docs.filter((step) => step.includes("uses: actions/checkout@"));
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0]).not.toMatch(/^\s+ref:/m);
    expect(checkouts[0]).toMatch(/^\s+fetch-depth: 0$/m);
    const checked = at(docs, "name: The tag names its release commit on main");
    expect(docs[checked]).toContain(
      'git fetch --force --no-tags --quiet origin "+refs/tags/$TAG:refs/tags/$TAG"',
    );
    expect(docs[checked]).toMatch(
      /^ {10}RELEASE_MAIN=HEAD npm run release:commit -- tag "\$TAG"$/m,
    );
    expect(docs[checked]).toContain('git rev-parse --verify "refs/tags/$TAG^{commit}"');
    expect(docs[checked]).not.toMatch(/^\s+if:/m);
    expect(at(docs, "uses: actions/checkout@")).toBeLessThan(checked);
    expect(at(docs, "uses: actions/setup-node@")).toBeLessThan(checked);
    const switched = at(docs, "name: Check out the tag's commit");
    expect(switched).toBe(checked + 2);
    expect(docs[switched]).toContain("SHA: ${{ steps.commit.outputs.sha }}");
    // A release made where there was none, by main's script, before
    // anything of the tag's is checked out.
    const made = at(docs, "name: Make the release as a draft");
    expect(made).toBeGreaterThan(checked);
    expect(made).toBeLessThan(switched);
    expect(docs[made]).toMatch(/^if: steps\.release\.outputs\.made == 'false'$/m);
    expect(docs[switched + 1]).toContain("name: The version can archive its docs");
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
    expect(version[checked]).toContain('sha=$(git rev-parse --verify "refs/tags/$TAG^{commit}")');
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

  it("runs right after the install in the prepare job, before Chromium and semantic-release", () => {
    const job = steps(workflow.get("prepare") ?? "", 6);
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

  it("downloads a shell the cache lacks through the checked download, not Playwright's", () => {
    const missed = chromium.filter((step) => step.includes("cache-hit != 'true'"));
    expect(missed).toHaveLength(1);
    expect(missed[0]).toMatch(/^\s+uses: \.\/\.github\/actions\/headless-shell$/m);
    expect(chromium.filter((step) => step.includes("playwright install"))).toEqual([]);
  });

  it("is passed on to playwright-deps", () => {
    const call = chromium.find((step) => step.includes("uses: ./.github/actions/playwright-deps"));
    expect(call).toMatch(/^\s+cache: \$\{\{ inputs\.cache \}\}$/m);
  });

  // The entry under the cache's key is the journeys' too, which show the
  // app, so one saved without the fonts would reach them.
  it("leaves out the system's fonts only when false", () => {
    const call = chromium.find((step) => step.includes("uses: ./.github/actions/playwright-deps"));
    expect(call).toMatch(/^\s+fonts: \$\{\{ inputs\.cache \}\}$/m);
    const listed = deps.find((step) => step.includes("install-deps --dry-run"));
    expect(listed).toMatch(/^\s+FONTS: \$\{\{ inputs\.fonts \}\}$/m);
    expect(listed).toMatch(/if \[\[ \$FONTS == false \]\]; then\n.*grep -Ev '\^\(x\?fonts-\|\$\)'/);
    expect(read(".github/actions/playwright-deps/action.yml")).toMatch(
      /^ {2}fonts:\n.*\n {4}default: "true"$/m,
    );
  });

  it("is the only caller to choose the fonts", () => {
    for (const file of ["ci", "release", "deploy"]) {
      expect(read(`.github/workflows/${file}.yml`)).not.toMatch(/^\s+fonts:/m);
    }
  });
});

// The commits job's reading of what commitlint doesn't read, on the
// refs of the run's own event, and ci-ok's asking for the job
// (docs/releasing.md#what-a-merge-commit-decides).
describe("ci.yml's check:merges", () => {
  const ci = jobs(read(".github/workflows/ci.yml"));
  const commits = steps(ci.get("commits") ?? "", 6);
  const step = (event: string) =>
    commits.filter(
      (text) => text.includes(`event_name == '${event}'`) && text.includes("check:merges"),
    );

  it("reads a merge queue run's commits, and asks for a merge commit", () => {
    const [queue, ...rest] = step("merge_group");
    expect(rest).toEqual([]);
    expect(queue).toContain("BASE: ${{ github.event.merge_group.base_sha }}");
    expect(queue).toContain("HEAD: ${{ github.event.merge_group.head_sha }}");
    expect(queue).toContain('run: npm run check:merges -- --base "$BASE" --head "$HEAD" --queue');
  });

  // It reads messages with the release's parser, a package.
  it("installs the packages first, in the queue too", () => {
    const install = commits.findIndex(
      (text) => text.includes("event_name == 'merge_group'") && text.includes("run: npm ci"),
    );
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(commits.indexOf(step("merge_group")[0] as string));
  });

  it("reads a pull request's commits", () => {
    const [pull, ...rest] = step("pull_request");
    expect(rest).toEqual([]);
    expect(pull).toContain("BASE: ${{ github.event.pull_request.base.sha }}");
    expect(pull).toContain("HEAD: ${{ github.event.pull_request.head.sha }}");
    expect(pull).toContain('run: npm run check:merges -- --base "$BASE" --head "$HEAD"\n');
  });

  it("counts toward ci-ok", () => {
    const ok = ci.get("ci-ok") ?? "";
    expect(ok).toMatch(/needs:\s*\[[^\]]*\bcommits\b/);
    expect(ok).toContain("${{ needs.commits.result }}");
  });
});
