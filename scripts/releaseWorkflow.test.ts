// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archivePath } from "./docsArchive.ts";

/**
 * The release workflow's jobs restore nothing from GitHub's cache
 * (docs/releasing.md#the-deploy-key): what the prepare job makes is
 * pushed with the deploy key, what the docs-render job renders is
 * attested, and any job on main can write main's cache entries. Nor do
 * the jobs that build the site that is deployed
 * (docs/deployment.md#the-build-ci-tested):
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
 * that holds nothing asks (docs/releasing.md#what-a-release-does). No
 * job of the release and deploy workflows that can write the
 * repository, attest or deploy installs or loads a package: the docs
 * of a tag run by hand are rendered in a job that
 * can only read, and attested and attached in one that loads none
 * (docs/releasing.md#when-a-release-fails).
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

/** The permissions block that starts at a `permissions:` line indented `indent`. */
function permissionsAt(yaml: string, indent: number): string | undefined {
  return yaml.match(
    new RegExp(`^ {${indent}}permissions:.*(?:\\n(?: {${indent + 2}}| *#).*)*`, "m"),
  )?.[0];
}

/**
 * Whether a job holds something a cache entry must not reach
 * (docs/releasing.md#the-deploy-key): a token that can write, the
 * workflow's when the job asks for none of its own, an OIDC token,
 * a secret or an environment, whose secrets GitHub hands the job.
 */
function privileged(head: string, job: string): boolean {
  const permissions = code(permissionsAt(job, 4) ?? permissionsAt(head, 0) ?? "");
  return (
    /: *write\b|write-all/.test(permissions) ||
    /secrets\./.test(code(job)) ||
    /^ {4}environment:/m.test(job)
  );
}

/** Whether a local action (`./.github/actions/<name>`) uses GitHub's cache. */
function cachingAction(uses: string): boolean {
  return /uses:\s*actions\/cache/.test(read(join(uses, "action.yml")));
}

/**
 * The steps of a job that restore from GitHub's cache in a workflow that
 * leaves it open: setup-node, which restores npm's cache for
 * packageManager in package.json unless told not to, any step given a
 * `cache` other than false, the cache action, and a local action that
 * uses it, unless that action is given `cache: false`.
 */
function restores(job: string): string[] {
  return steps(job, 6).filter((step) => {
    const uses = step.match(/uses:\s*(\S+)/)?.[1] ?? "";
    const cache = step.match(/^\s+cache: *(\S+)/m)?.[1];
    if (/^actions\/cache[/@]/.test(uses)) return true;
    if (cache !== undefined) return cache !== "false";
    if (uses.startsWith("actions/setup-node@"))
      return !/^\s+package-manager-cache: false$/m.test(step);
    return uses.startsWith("./") && cachingAction(uses);
  });
}

/** The jobs of a workflow that hold something and restore from the cache. */
function privilegedRestores(yaml: string): string[] {
  if (/^cache-mode: none$/m.test(yaml)) return [];
  const head = yaml.slice(0, yaml.indexOf("\njobs:\n"));
  return [...jobs(yaml)]
    .filter(([, job]) => privileged(head, job) && restores(job).length > 0)
    .map(([name]) => name);
}

const workflows = readdirSync(join(ROOT, ".github/workflows")).map(
  (name) => `.github/workflows/${name}`,
);

describe("GitHub's cache", () => {
  // The rule holds in every workflow, not only the release's and the
  // deploy's: a job that can write, attest or holds a secret restores
  // nothing a job on main could have saved
  // (docs/releasing.md#the-deploy-key).
  it.each(workflows)("restores nothing in a job of %s that can write or holds a secret", (path) => {
    expect(privilegedRestores(read(path))).toEqual([]);
  });

  it("finds the jobs that can write or hold a secret", () => {
    const found = workflows.flatMap((path) => {
      const yaml = read(path);
      const head = yaml.slice(0, yaml.indexOf("\njobs:\n"));
      return [...jobs(yaml)]
        .filter(([, job]) => privileged(head, job))
        .map(([name]) => `${path.replace(/^.*\//, "")} ${name}`);
    });
    expect(found).toEqual(
      expect.arrayContaining([
        "ci.yml caches",
        "ci.yml site",
        "deploy.yml deploy",
        "deploy.yml journeys",
        "pending-updates.yml comment",
        "release.yml push",
        "release.yml publish",
        "taxonomy.yml publish",
        "taxonomy.yml failed",
      ]),
    );
    expect(found).not.toContain("pending-updates.yml lookup");
    expect(found).not.toContain("ci.yml check");
  });

  const job = (lines: string): string =>
    `name: Test\non: push\npermissions:\n  contents: read\njobs:\n  test:\n${lines}`;
  const writes = "    permissions:\n      issues: write\n    steps:\n";
  const node =
    "      - uses: actions/setup-node@0 # v7\n        with:\n          node-version-file: .nvmrc\n";

  it.each([
    ["setup-node with packageManager", writes + node],
    ["setup-node with cache: npm", `${writes}${node}          cache: npm\n`],
    [
      "setup-python with cache: pip",
      `${writes}      - uses: actions/setup-python@0\n        with:\n          cache: pip\n`,
    ],
    ["the cache action", `${writes}      - uses: actions/cache/restore@0\n`],
    ["a local action that caches", `${writes}      - uses: ./.github/actions/e2e-images\n`],
    [
      "a token from the workflow",
      `    steps:\n${node}`,
      "name: Test\non: push\npermissions:\n  issues: write\njobs:\n  test:\n",
    ],
    ["an OIDC token", `    permissions:\n      id-token: write\n    steps:\n${node}`],
    ["a secret", `    steps:\n${node}        env:\n          KEY: \${{ secrets.KEY }}\n`],
    ["an environment", `    environment: release\n    steps:\n${node}`],
  ])("refuses %s", (_, lines, head?: string) => {
    const yaml = head ? head + lines : job(lines);
    expect(privilegedRestores(yaml)).toEqual(["test"]);
  });

  it.each([
    ["setup-node without npm's cache", `${writes}${node}          package-manager-cache: false\n`],
    [
      "a local action told not to cache",
      `${writes}      - uses: ./.github/actions/chromium\n        with:\n          cache: false\n`,
    ],
    ["a local action that does not cache", `${writes}      - uses: ./.github/actions/publiccode\n`],
    ["a job that only reads", `    permissions:\n      contents: read\n    steps:\n${node}`],
  ])("allows %s", (_, lines) => {
    expect(privilegedRestores(job(lines))).toEqual([]);
  });

  it("allows anything in a workflow closed to the cache", () => {
    expect(privilegedRestores(`cache-mode: none\n${job(writes + node)}`)).toEqual([]);
  });

  // Neither workflow touches the cache: a run on main could otherwise
  // write main's entries from a job that runs packages
  // (docs/releasing.md#the-deploy-key).
  it.each([".github/workflows/release.yml", ".github/workflows/deploy.yml"])(
    "is closed to every job of %s",
    (path) => {
      const yaml = read(path);
      expect(yaml).toMatch(/^cache-mode: none$/m);
      expect(code(yaml).match(/^ +cache-mode:/gm)).toBeNull();
    },
  );
});

describe("release.yml", () => {
  it("has the queue, prepare, push, publish and three docs jobs", () => {
    expect([...workflow.keys()]).toEqual([
      "queue",
      "prepare",
      "push",
      "publish",
      "docs-release",
      "docs-render",
      "docs-publish",
    ]);
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

  // A local action is the checkout's, and the docs-render job checks out
  // the tag's commit, whose copy of an action may restore from the cache.
  it("runs no local action in the docs-render job, which checks out the tag's commit", () => {
    const docs = steps(workflow.get("docs-render") ?? "", 6);
    expect(docs[0]).toMatch(/^ {10}ref: \$\{\{ needs\.docs-release\.outputs\.sha \}\}$/m);
    expect(docs.filter((step) => /uses:\s*\.\//.test(step))).toEqual([]);
    // The shell from its own download, checked against the pinned
    // SHA-256 (npm run check:shell), and only the libraries from
    // Playwright, which takes them from Ubuntu's signed mirror.
    const installs = docs.filter((step) => step.includes("npx playwright install"));
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatch(/^run: npx playwright install-deps chromium$/m);
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

  // A job gets its token's permissions, and the means to sign as this
  // workflow, when it starts, so every step of it can use them: the
  // tag's packages, and the build that loads them, run only where the
  // token can read alone.
  it("renders a tag's docs in a job that can only read, with nothing to attest with", () => {
    const render = workflow.get("docs-render") ?? "";
    expect(render).toMatch(/^ {4}permissions:\n {6}contents: read\n {4}outputs:$/m);
    expect(code(render)).not.toMatch(/id-token|attestations|actions\/attest|secrets\.|GH_TOKEN/);
    const job = steps(render, 6);
    const at = (text: string) => job.findIndex((step) => step.includes(text));
    expect(job[0]).toMatch(/^ {10}persist-credentials: false$/m);
    const archived = at("name: npm run docs:archive");
    expect(job[archived]).toContain(
      "sha256sum \"release-assets/docs-$VERSION.tar.gz\" | cut -d ' ' -f 1",
    );
    expect(job[archived + 1]).toMatch(/uses: actions\/upload-artifact@/);
    expect(job[archived + 1]).toMatch(/^ {10}name: release-docs$/m);
    expect(job[archived + 1]).toContain(
      `path: ${archivePath("${{ needs.docs-release.outputs.version }}")}`,
    );
  });

  // What docs-render made is the tag's packages' output: the job that
  // attests and attaches it takes it as one regular file of the
  // version's name, with the SHA-256 docs-render stated, and runs
  // nothing of it.
  it("attests and attaches a tag's docs in a job that checks out nothing and loads no package", () => {
    const publish = workflow.get("docs-publish") ?? "";
    expect(publish).toMatch(/^ {4}needs: \[docs-release, docs-render\]$/m);
    const job = steps(publish, 6);
    expect(job.map((step) => step.match(/uses: ([^@\s]+)/)?.[1]).filter(Boolean)).toEqual([
      "actions/download-artifact",
      "actions/attest",
    ]);
    expect(code(publish)).not.toMatch(/npm|npx|node |checkout|\.\/\.github\/actions\//);
    const at = (text: string) => job.findIndex((step) => step.includes(text));
    expect(at("name: The archive was rendered, if the release needs it")).toBe(0);
    const downloaded = at("uses: actions/download-artifact@");
    expect(job[downloaded]).toMatch(/^ {10}name: release-docs$/m);
    expect(job[downloaded]).toMatch(/^ {10}path: \$\{\{ runner\.temp \}\}\/docs$/m);
    expect(job[downloaded]).not.toMatch(/run-id|github-token|repository:/);
    const checked = at("name: The archive is the version's, as docs-render made it");
    expect(checked).toBe(downloaded + 1);
    expect(job[checked]).toContain("SHA256: ${{ needs.docs-render.outputs.sha256 }}");
    expect(job[checked]).toContain(
      'if [ "$found" != "./$name" ] || [ -L "$name" ] || [ ! -f "$name" ]; then',
    );
    expect(job[checked]).toContain('[ "$(sha256sum "$name" | cut -d \' \' -f 1)" != "$SHA256" ]');
    expect(job[checked]).not.toMatch(/tar -x|tar x|\bunzip\b|\bsource\b|\bbash\b/);
    const attested = at("uses: actions/attest@");
    expect(attested).toBe(checked + 1);
    expect(job[attested]).toMatch(
      /^ {10}subject-path: \$\{\{ runner\.temp \}\}\/docs\/docs-\$\{\{ needs\.docs-release\.outputs\.version \}\}\.tar\.gz$/m,
    );
    expect(job[attested + 1]).toContain(
      'gh release upload --clobber "$TAG" "$RUNNER_TEMP/docs/docs-$VERSION.tar.gz#Documentation $VERSION (HTML)"',
    );
  });

  // The check runs as the step runs it, with bash, on archives packed
  // here: only one that lists files under docs/ by plain relative paths
  // passes, and none is unpacked.
  describe("the archive's shape", () => {
    const step =
      steps(workflow.get("docs-publish") ?? "", 6).find((text) =>
        text.includes("name: The archive is the version's, as docs-render made it"),
      ) ?? "";
    const body = step.slice(step.indexOf("run: |\n") + "run: |\n".length).split("\n");
    const end = body.findIndex((line) => !line.startsWith(" ".repeat(10)));
    const script = body
      .slice(0, end)
      .map((line) => line.slice(10))
      .join("\n");
    const version = "1.2.3";
    const name = `docs-${version}.tar.gz`;

    /** Runs the step on the archive `tar` packs from a folder `make` fills; what it printed, and whether it passed. */
    function check(
      make: (dir: string) => void,
      args: (dir: string) => string[],
      after: (archive: string, dir: string) => void = () => {},
    ): { passed: boolean; output: string } {
      const root = mkdtempSync(join(tmpdir(), "solid-memo-docs-shape-"));
      try {
        const source = join(root, "source");
        mkdirSync(join(source, "docs"), { recursive: true });
        make(source);
        mkdirSync(join(root, "docs"));
        const archive = join(root, "docs", name);
        execFileSync("tar", ["-czf", archive, "-C", source, ...args(source)]);
        after(archive, source);
        const sha256 = execFileSync("sha256sum", [archive], { encoding: "utf8" }).split(" ")[0];
        const run = spawnSync("bash", ["-c", script], {
          env: { PATH: process.env.PATH, RUNNER_TEMP: root, VERSION: version, SHA256: sha256 },
          encoding: "utf8",
        });
        return { passed: run.status === 0, output: `${run.stdout}${run.stderr}` };
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
    const page = (dir: string) => writeFileSync(join(dir, "docs", "index.html"), "<p>docs</p>");

    it("passes files under docs/, as npm run docs:archive packs them", () => {
      expect(check(page, () => ["docs/index.html"])).toEqual({ passed: true, output: "" });
    });

    it("refuses an archive with an entry past the end tar would stop at", () => {
      // A second archive appended to the first: tar stops listing at the
      // first end of archive unless it ignores the zero blocks.
      const appended = (archive: string, dir: string) => {
        symlinkSync("/etc/hostname", join(dir, "link"));
        const second = `${archive}.second`;
        execFileSync("tar", ["-czf", second, "-C", dir, "link"]);
        appendFileSync(archive, readFileSync(second));
        rmSync(second);
      };
      const { passed, output } = check(page, () => ["docs/index.html"], appended);
      expect(passed).toBe(false);
      expect(output).toContain(`::error::${name} holds no entry, or one that is not a file`);
    });

    it.each<[string, (dir: string) => void, (dir: string) => string[]]>([
      ["no entry", () => {}, () => ["-T", "/dev/null"]],
      [
        "an entry outside docs/",
        (dir) => writeFileSync(join(dir, "other.html"), ""),
        () => ["other.html"],
      ],
      ["an absolute path", page, (dir) => ["--absolute-names", join(dir, "docs", "index.html")]],
      ["a path with ..", page, () => ["--absolute-names", "docs/../docs/index.html"]],
      [
        "a name tar escapes",
        (dir) => writeFileSync(join(dir, "docs", "a\nb.html"), ""),
        () => ["docs/a\nb.html"],
      ],
      [
        "a symbolic link",
        (dir) => symlinkSync("/etc/hostname", join(dir, "docs", "link")),
        () => ["docs/link"],
      ],
      [
        "a hard link",
        (dir) => {
          page(dir);
          linkSync(join(dir, "docs", "index.html"), join(dir, "docs", "copy.html"));
        },
        () => ["docs/index.html", "docs/copy.html"],
      ],
    ])("refuses an archive with %s", (_, make, args) => {
      const { passed, output } = check(make, args);
      expect(passed).toBe(false);
      expect(output).toContain(`::error::${name} holds no entry, or one that is not a file`);
    });
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
  // so the docs-release job reads the tag as refs/tags/<tag> and checks
  // its commit with main's script, and the docs-render job checks out
  // that commit by its SHA.
  it("check the tag's commit in release.yml's docs-release job, then check out its SHA", () => {
    const docs = steps(workflow.get("docs-release") ?? "", 6);
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
    expect(workflow.get("docs-release")).toMatch(
      /^ {6}sha: \$\{\{ steps\.commit\.outputs\.sha \}\}$/m,
    );
    // A release made where there was none, by main's script.
    const made = at(docs, "name: Make the release as a draft");
    expect(made).toBe(checked + 1);
    expect(docs[made]).toMatch(/^if: steps\.release\.outputs\.made == 'false'$/m);
    // The docs-render job checks out that commit, and nothing else.
    const render = steps(workflow.get("docs-render") ?? "", 6);
    expect(render.filter((step) => step.includes("uses: actions/checkout@"))).toEqual([render[0]]);
    expect(render.filter((step) => /git (checkout|switch|fetch)/.test(step))).toEqual([]);
    expect(render[1]).toContain("name: The version can archive its docs");
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

describe("npm run audit:signatures", () => {
  const at = (job: string[], text: string) => job.findIndex((step) => step.includes(text));
  const install = "npm ci --ignore-scripts";
  const audit = /^\s*run: npm run audit:signatures$/m;

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

// GitHub hands a job its token, and with id-token: write the means to
// sign as its workflow, when the job starts, and any step of it can
// reach them, not only the steps that name them. So in the workflows
// that release and deploy, a job that can write the repository, attest
// or deploy installs and loads no package: it runs main's own scripts,
// which import none (docs/releasing.md#the-deploy-key).
describe.each([".github/workflows/release.yml", ".github/workflows/deploy.yml"])(
  "%s's jobs that can write",
  (path) => {
    const writes =
      /^ {6}(contents|id-token|attestations|artifact-metadata|pages|packages|deployments): write$/m;
    const loads =
      /npm ci|npm install|npx |\.\/\.github\/actions\/|playwright|docs:archive|npm run (?!(?:--silent )?release:commit )/;

    it("load no package", () => {
      const writing = [...jobs(read(path))].filter(([, job]) => writes.test(job));
      expect(writing).not.toEqual([]);
      for (const [name, job] of writing) expect(code(job), name).not.toMatch(loads);
    });

    it("are the jobs that need to", () => {
      const writing = [...jobs(read(path))]
        .filter(([, job]) => writes.test(job))
        .map(([name]) => name);
      expect(writing).toEqual(
        path.endsWith("release.yml") ? ["publish", "docs-release", "docs-publish"] : ["deploy"],
      );
    });
  },
);
