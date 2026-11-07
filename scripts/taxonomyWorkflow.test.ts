// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The taxonomy workflow's own pull request is the one from this
 * repository's branch (docs/deck-library.md#the-taxonomy-deck). Its steps
 * run here as the workflow states them, against a stand-in for gh that
 * answers as GitHub does: the head filter of the REST call matches owner
 * and branch, the state filter leaves closed pull requests out, and a pull
 * request is edited by its number. A fork's pull request from a branch of
 * the same name changes nothing, and neither does a closed one.
 */

const ROOT = join(import.meta.dirname, "..");

interface PullRequest {
  number: number;
  /** The owner of the repository the pull request comes from. */
  owner: string;
  state: "open" | "closed";
  title: string;
}

/** The newest first, as GitHub lists them. */
const FORK: PullRequest = {
  number: 42,
  owner: "someone",
  state: "open",
  title: "taxonomy version 31 taxonomy version 32 ",
};
const OWN: PullRequest = {
  number: 7,
  owner: "solid-memo",
  state: "open",
  title: "feat(decks): add taxonomy version 32 to the occupation names deck",
};
const OLDER: PullRequest = {
  ...OWN,
  title: "feat(decks): add taxonomy version 31 to the occupation names deck",
};
const CLOSED: PullRequest = { ...OWN, number: 3, state: "closed" };

const FAKE_GH = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.GH_LOG, JSON.stringify(args) + "\\n");
const pulls = JSON.parse(process.env.PULLS);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const [command, subcommand] = args;
if (command === "api" && subcommand.startsWith("/users/")) {
  console.log("1");
} else if (command === "api") {
  const query = new URL(subcommand, "https://api.github.com/").searchParams;
  if (query.get("state") !== "open") fail("unexpected state " + query.get("state"));
  const found = pulls.filter(
    (pull) =>
      pull.state === "open" &&
      (!query.has("head") || pull.owner + ":taxonomy-deck" === query.get("head")),
  );
  const expression = args[args.indexOf("--jq") + 1];
  const field = { '.[0].title // ""': "title", '.[0].number // ""': "number" }[expression];
  if (field === undefined) fail("unexpected --jq " + expression);
  console.log(found.length === 0 ? "" : found[0][field]);
} else if (command === "pr" && subcommand === "list") {
  const field = args[args.indexOf("--json") + 1];
  if (field === "number") console.log(pulls.length);
  else console.log(pulls.length === 0 ? "" : pulls[0][field]);
} else if (command === "pr" && subcommand === "edit") {
  const number = Number(args[2]);
  if (!pulls.some((pull) => pull.number === number && pull.owner === "solid-memo")) {
    fail('no pull requests found for branch "' + args[2] + '"');
  }
} else if (!(command === "pr" && subcommand === "create")) {
  fail("unexpected gh " + args.join(" "));
}
`;

/** A workflow's job, by name (indented 2 under `jobs:`). */
function job(name: string): string {
  const yaml = readFileSync(join(ROOT, ".github/workflows/taxonomy.yml"), "utf8");
  return yaml.split(new RegExp(`^ {2}${name}:$`, "m"))[1].split(/^ {2}[\w-]+:$/m)[0];
}

/** The shell script of the job's step that holds `text`. */
function script(jobName: string, text: string): string {
  const step = job(jobName)
    .split(/^ {6}- /m)
    .find((s) => s.includes(text));
  if (step === undefined) throw new Error(`no step with ${text}`);
  return step
    .split(/^ {8}run: \|\n/m)[1]
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

let temp: string;

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), "taxonomy-workflow-"));
  const bin = join(temp, "bin");
  mkdirSync(bin);
  mkdirSync(join(temp, "deck"));
  writeFileSync(join(temp, "deck", "notes.txt"), "Adds taxonomy version 32.\n");
  writeFileSync(join(bin, "gh"), FAKE_GH);
  // The publish step's commit and push are not what is tested.
  writeFileSync(join(bin, "git"), "#!/bin/sh\n");
  chmodSync(join(bin, "gh"), 0o755);
  chmodSync(join(bin, "git"), 0o755);
});

afterEach(() => {
  rmSync(temp, { recursive: true, force: true });
});

/** Runs a step's script as GitHub runs a bash step, with the runner's paths here. */
function run(source: string, pulls: PullRequest[], env: Record<string, string>) {
  const output = join(temp, "output");
  const log = join(temp, "gh.log");
  writeFileSync(output, "");
  writeFileSync(log, "");
  const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", source], {
    encoding: "utf8",
    env: {
      PATH: `${join(temp, "bin")}${delimiter}${process.env.PATH}`,
      BRANCH: "taxonomy-deck",
      GH_LOG: log,
      GITHUB_OUTPUT: output,
      GITHUB_REPOSITORY: "solid-memo/website",
      GITHUB_REPOSITORY_OWNER: "solid-memo",
      GITHUB_RUN_ID: "1",
      GITHUB_SERVER_URL: "https://github.com",
      NEWEST: "32",
      NEXT: "4",
      PULLS: JSON.stringify(pulls),
      RUNNER_TEMP: temp,
      ...env,
    },
  });
  const calls = readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line): string[] => JSON.parse(line));
  return { ...result, calls, output: readFileSync(output, "utf8") };
}

describe("taxonomy.yml's check job", () => {
  const check = (pulls: PullRequest[], update = "true") =>
    run(script("check", "GH_TOKEN"), pulls, { UPDATE: update });

  it("reads pull requests with a token that may", () => {
    expect(job("check")).toMatch(/^ {6}pull-requests: read$/m);
  });

  it("goes on when no pull request is open", () => {
    const { status, output } = check([]);
    expect(status).toBe(0);
    expect(output).toBe("update=true\n");
  });

  it("leaves the repository's pull request for the newest version alone", () => {
    const { status, output } = check([OWN]);
    expect(status).toBe(0);
    expect(output).toBe("update=false\n");
  });

  it("goes on when the repository's pull request is for an older version", () => {
    expect(check([OLDER]).output).toBe("update=true\n");
  });

  it("goes on when only a fork's pull request names the newest version", () => {
    const { status, output } = check([FORK]);
    expect(status).toBe(0);
    expect(output).toBe("update=true\n");
    expect(check([FORK, OLDER]).output).toBe("update=true\n");
  });

  it("goes on when the repository's pull request for the newest version is closed", () => {
    const { status, output } = check([CLOSED]);
    expect(status).toBe(0);
    expect(output).toBe("update=true\n");
  });

  it("makes nothing when the deck is up to date", () => {
    expect(check([], "false").output).toBe("update=false\n");
  });
});

describe("taxonomy.yml's publish job", () => {
  const publish = (pulls: PullRequest[]) =>
    run(script("publish", "git push --force"), pulls, {
      APP: "app",
      CLOSES: "Closes: #1",
    });
  const pr = (calls: string[][]) => calls.filter(([command]) => command === "pr");

  it("opens a pull request when none is open", () => {
    const { status, calls } = publish([]);
    expect(status).toBe(0);
    expect(pr(calls).map((call) => call.slice(0, 4))).toEqual([
      ["pr", "create", "--head", "taxonomy-deck"],
    ]);
  });

  it("updates the repository's pull request by its number", () => {
    const { status, calls } = publish([OWN]);
    expect(status).toBe(0);
    expect(pr(calls).map((call) => call.slice(0, 3))).toEqual([["pr", "edit", "7"]]);
  });

  it("opens its own pull request when only a fork's is open", () => {
    const { status, calls } = publish([FORK]);
    expect(status).toBe(0);
    expect(pr(calls).map((call) => call.slice(0, 2))).toEqual([["pr", "create"]]);
  });

  it("opens a pull request when the repository's is closed", () => {
    const { status, calls } = publish([CLOSED]);
    expect(status).toBe(0);
    expect(pr(calls).map((call) => call.slice(0, 2))).toEqual([["pr", "create"]]);
  });

  it("updates the repository's open pull request beside a closed one", () => {
    const { status, calls } = publish([CLOSED, OWN]);
    expect(status).toBe(0);
    expect(pr(calls).map((call) => call.slice(0, 3))).toEqual([["pr", "edit", "7"]]);
  });

  it("updates the repository's pull request beside a newer one from a fork", () => {
    const { status, calls } = publish([FORK, OWN]);
    expect(status).toBe(0);
    expect(pr(calls).map((call) => call.slice(0, 3))).toEqual([["pr", "edit", "7"]]);
  });
});
