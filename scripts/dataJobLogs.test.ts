// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The scheduled jobs print text from outside the repository into the
 * log: the Wikidata and taxonomy jobs, names and labels in reports and an
 * error's text in a warning (docs/deck-library.md); the Links workflow,
 * what the web's addresses and the Pod providers' issuers answer; the
 * Pending updates workflow, what the registries answer Renovate
 * (docs/testing.md). The runner reads a line of the log that starts
 * with `::`, or holds `##[`, as a workflow command, so each step that
 * prints such text stops reading commands while it runs, between
 * `::stop-commands::<token>` and `::<token>::`, with a token new on every
 * run and printed nowhere else. The steps run here as the workflows state
 * them, with the tools they run standing in for ones that print
 * commands and then pass or fail.
 */

const ROOT = join(import.meta.dirname, "..");

/** Text a log would read as commands. */
const COMMANDS = [
  "INCLUDED",
  "::add-mask::Förskollärare",
  "  ::warning title=Deck check passed::all good",
  "Why ##[add-mask]Förskollärare",
].join("\n");

/** The warning the Wikidata script writes to stdout, as one line. */
const WARNING =
  "::warning::capitals not verified: Wikidata could not be reached (Wikidata answered x: y%0A::notice::z)";

/** A job's steps, by the job's name (indented 2 under `jobs:`). */
function steps(workflow: string, name: string): string[] {
  const yaml = readFileSync(join(ROOT, ".github/workflows", workflow), "utf8");
  const job = yaml.split(new RegExp(`^ {2}${name}:$`, "m"))[1].split(/^ {2}[\w-]+:$/m)[0];
  return job.split(/^ {6}- /m).slice(1);
}

/**
 * The shell GitHub runs a step's `run:` in, as its arguments to bash: a
 * workflow or step that names `shell: bash` gets pipefail, and one that
 * names no shell gets `bash -e {0}` alone.
 */
function shellOf(workflow: string, step: string): string[] {
  const yaml = readFileSync(join(ROOT, ".github/workflows", workflow), "utf8");
  if (/^ {8}shell: /m.test(step) || /^defaults:\n {2}run:\n {4}shell: (?!bash$)/m.test(yaml)) {
    throw new Error(`${workflow}: a shell this test does not know`);
  }
  return /^defaults:\n {2}run:\n {4}shell: bash$/m.test(yaml)
    ? ["--noprofile", "--norc", "-eo", "pipefail"]
    : ["-e"];
}

/** The step of `workflow`'s `job` that runs `command`. */
function stepRunning(workflow: string, job: string, command: string): string {
  const found = steps(workflow, job).filter((step) => step.includes(command));
  expect(found).toHaveLength(1);
  return found[0];
}

/** A step's `run: |` script, as bash runs it. */
function scriptOf(step: string): string {
  const body = step.slice(step.indexOf("run: |\n") + "run: |\n".length).split("\n");
  const indent = " ".repeat(/^ */.exec(body[0])![0].length);
  const end = body.findIndex((line) => !line.startsWith(indent));
  return body
    .slice(0, end === -1 ? undefined : end)
    .map((line) => line.slice(indent.length))
    .join("\n");
}

/** What a step runs: the arguments to bash, and its script. */
type Step = { shell: string[]; script: string };

/** The step of `workflow`'s `job` that runs `command`, as GitHub runs it. */
function workflowStep(workflow: string, job: string, command: string): Step {
  const step = stepRunning(workflow, job, command);
  return { shell: shellOf(workflow, step), script: scriptOf(step) };
}

/**
 * The step of the local action at `.github/actions/<name>` that runs
 * `command`. Each step of a composite action names `shell: bash`, which
 * GitHub runs with pipefail.
 */
function actionStep(name: string, command: string): Step {
  const yaml = readFileSync(join(ROOT, ".github/actions", name, "action.yml"), "utf8");
  const found = yaml
    .split(/^ {4}- /m)
    .slice(1)
    .filter((step) => step.includes(command));
  expect(found).toHaveLength(1);
  expect(found[0]).toMatch(/^shell: bash$/m);
  return { shell: ["--noprofile", "--norc", "-eo", "pipefail"], script: scriptOf(found[0]) };
}

/** The tools a step runs that print, by default: in the PATH, by name. */
const SCRIPTS = ["python3", "python", "npm"];

/**
 * Runs a step as GitHub runs it, in a checkout with a publiccode.yml,
 * with `fakes` (names in the PATH, or paths from the checkout, which is
 * also RUNNER_TEMP) that print WARNING to stdout, then COMMANDS and
 * `ending` to stderr, as the tools print their reports, and exit with
 * `status`. What the step printed, stdout and stderr together in the
 * order printed, line by line, its status, and what it wrote to its
 * outputs and to the job's summary.
 */
function runPrinting(
  { shell, script }: Step,
  status: number,
  ending: string,
  fakes: readonly string[],
): { lines: string[]; status: number | null; output: string; summary: string } {
  const root = mkdtempSync(join(tmpdir(), "solid-memo-data-job-logs-"));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(root, "report.txt"), `${COMMANDS}${ending}`);
    writeFileSync(join(root, "publiccode.yml"), "");
    for (const fake of fakes) {
      const path = fake.includes("/") ? join(root, fake) : join(bin, fake);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        `#!/bin/sh\necho '${WARNING}'\ncat "${join(root, "report.txt")}" >&2\nexit ${status}\n`,
        { mode: 0o755 },
      );
    }
    const log = join(root, "log.txt");
    const output = join(root, "output.txt");
    const summary = join(root, "summary.md");
    writeFileSync(output, "");
    writeFileSync(summary, "");
    const fd = openSync(log, "w");
    try {
      const run = spawnSync("bash", [...shell, "-c", script], {
        cwd: root,
        env: {
          PATH: `${bin}${delimiter}${process.env.PATH}`,
          HOME: root,
          RUNNER_TEMP: root,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
        stdio: ["ignore", fd, fd],
      });
      return {
        lines: readFileSync(log, "utf8").trimEnd().split("\n"),
        status: run.status,
        output: readFileSync(output, "utf8"),
        summary: readFileSync(summary, "utf8"),
      };
    } finally {
      closeSync(fd);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * `step`, with `fakes` for the tools it runs, prints `inside` (with what
 * COMMANDS ends in) where the runner
 * reads no command, resumes when it fails too, on a line of its own when
 * the output before it ends mid-line, and then prints `after`, which the
 * runner reads as commands again. The token is new on every run. When
 * `piped`, stdout goes through a pipe, so its lines may come in another
 * order than stderr's. What the step wrote to its outputs and to the
 * job's summary, on each run, is returned.
 */
function expectStopsCommands(
  step: Step,
  inside: (ending: string) => string,
  after: string[],
  { piped = false, fakes = SCRIPTS }: { piped?: boolean; fakes?: readonly string[] } = {},
): { outputs: string[]; summaries: string[] } {
  const outputs: string[] = [];
  const summaries: string[] = [];
  const tokens = new Set<string>();
  for (const [status, ending] of [
    [0, "\n"],
    [1, "\n"],
    [0, ""],
  ] as const) {
    const { lines, status: exit, output, summary } = runPrinting(step, status, ending, fakes);
    outputs.push(output);
    summaries.push(summary);
    expect(exit).toBe(status);
    expect(lines[0]).toMatch(/^::stop-commands::[0-9a-f]{32}$/);
    const token = lines[0].slice("::stop-commands::".length);
    tokens.add(token);
    const resume = lines.length - after.length - 1;
    expect(lines[resume]).toBe(`::${token}::`);
    const printed = lines.slice(1, resume).join("\n");
    if (piped) {
      expect(printed.split("\n").sort()).toEqual(inside(ending).split("\n").sort());
    } else {
      expect(printed).toBe(inside(ending));
    }
    expect(lines.slice(resume + 1)).toEqual(after);
    expect(lines.filter((line) => line.includes(token))).toHaveLength(2);
  }
  expect(tokens.size).toBe(3);
  return { outputs, summaries };
}

describe("the shells the steps run in", () => {
  it("are bash -e for wikidata.yml, which names none, and bash with pipefail for taxonomy.yml", () => {
    const wikidata = stepRunning("wikidata.yml", "verify", "wikidata_labels.py --verify");
    expect(shellOf("wikidata.yml", wikidata)).toEqual(["-e"]);
    const taxonomy = stepRunning("taxonomy.yml", "check", "taxonomy_deck.py --check");
    expect(shellOf("taxonomy.yml", taxonomy)).toEqual(["--noprofile", "--norc", "-eo", "pipefail"]);
  });

  it("are refused when a step names one of its own", () => {
    expect(() => shellOf("wikidata.yml", "run: x\n        shell: sh\n")).toThrow(/shell/);
  });
});

describe("wikidata.yml's verify job", () => {
  it("reads no command from Wikidata's text, and still reads the script's warnings", () => {
    // The script's stdout, its warnings, is printed once commands resume.
    expectStopsCommands(
      workflowStep("wikidata.yml", "verify", "wikidata_labels.py --verify"),
      (ending) => `${COMMANDS}${ending}`,
      [WARNING],
    );
  });
});

describe("taxonomy.yml's update job", () => {
  it.each([
    "taxonomy_deck.py --verify",
    "taxonomy_deck.py --to",
    "npm run format:turtle",
    "npm run library\n",
    "npm run library:check",
    "shacl_crosscheck.py",
  ])("reads no command from the taxonomy's text where it runs %s", (command) => {
    expectStopsCommands(
      workflowStep("taxonomy.yml", "update", command),
      (ending) => `${WARNING}\n${COMMANDS}${ending}`,
      [],
    );
  });
});

describe("taxonomy.yml's check job", () => {
  it("reads no command from the taxonomy's text, and keeps the script's stdout as outputs", () => {
    const { outputs } = expectStopsCommands(
      workflowStep("taxonomy.yml", "check", "taxonomy_deck.py --check"),
      (ending) => `${WARNING}\n${COMMANDS}${ending}`,
      [],
      { piped: true },
    );
    expect(outputs).toEqual([`${WARNING}\n`, `${WARNING}\n`, `${WARNING}\n`]);
  });
});

describe("links.yml's links job", () => {
  it("reads no command from the web's answers to lychee, and keeps its report as the summary", () => {
    const { summaries } = expectStopsCommands(
      workflowStep("links.yml", "links", "lychee --max-retries"),
      (ending) => `${COMMANDS}${ending}${WARNING}\n`,
      [],
      { fakes: ["lychee"] },
    );
    expect(summaries).toEqual([`${WARNING}\n`, `${WARNING}\n`, `${WARNING}\n`]);
  });

  it("reads no command from those the addresses publiccode.yml names answer", () => {
    expectStopsCommands(
      actionStep("publiccode", '"$dir/publiccode-parser" publiccode.yml'),
      (ending) => `${WARNING}\n${COMMANDS}${ending}`,
      [],
      { fakes: ["publiccode-parser/publiccode-parser"] },
    );
  });
});

describe("links.yml's providers job", () => {
  it("reads no command from the Pod providers' issuers", () => {
    expectStopsCommands(
      workflowStep("links.yml", "providers", "npm run check:providers"),
      (ending) => `${WARNING}\n${COMMANDS}${ending}`,
      [],
    );
  });
});

describe("pending-updates.yml's lookup job", () => {
  it("reads no command from what the registries answer Renovate", () => {
    expectStopsCommands(
      workflowStep("pending-updates.yml", "lookup", "--dry-run=lookup"),
      (ending) => `${WARNING}\n${COMMANDS}${ending}`,
      [],
      { fakes: ["scripts/renovate/node_modules/.bin/renovate"] },
    );
  });
});
