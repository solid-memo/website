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
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The weekly Wikidata and taxonomy jobs print text from those APIs into
 * the log: names and labels in reports, an error's text in a warning
 * (docs/deck-library.md). The runner reads a line of the log that starts
 * with `::`, or holds `##[`, as a workflow command, so each step that
 * prints such text stops reading commands while it runs, between
 * `::stop-commands::<token>` and `::<token>::`, with a token new on every
 * run and printed nowhere else. The steps run here as the workflows state
 * them, with the scripts they run standing in for ones that print
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
  const end = body.findIndex((line) => !line.startsWith(" ".repeat(10)));
  return body
    .slice(0, end === -1 ? undefined : end)
    .map((line) => line.slice(10))
    .join("\n");
}

/**
 * Runs a step's script under `shell` (the arguments to bash), as GitHub
 * runs the step, with `python3`,
 * `python` and `npm` that print WARNING to stdout, then COMMANDS and
 * `ending` to stderr, as the scripts print their reports, and exit with
 * `status`. What the step printed, stdout and stderr together in the
 * order printed, line by line, its status, and what it wrote to its
 * outputs.
 */
function runPrinting(
  shell: string[],
  script: string,
  status: number,
  ending: string,
): { lines: string[]; status: number | null; output: string } {
  const root = mkdtempSync(join(tmpdir(), "solid-memo-data-job-logs-"));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(root, "report.txt"), `${COMMANDS}${ending}`);
    for (const name of ["python3", "python", "npm"]) {
      writeFileSync(
        join(bin, name),
        `#!/bin/sh\necho '${WARNING}'\ncat "${join(root, "report.txt")}" >&2\nexit ${status}\n`,
        { mode: 0o755 },
      );
    }
    const log = join(root, "log.txt");
    const output = join(root, "output.txt");
    writeFileSync(output, "");
    const fd = openSync(log, "w");
    try {
      const run = spawnSync("bash", [...shell, "-c", script], {
        cwd: root,
        env: {
          PATH: `${bin}${delimiter}${process.env.PATH}`,
          HOME: root,
          RUNNER_TEMP: root,
          GITHUB_OUTPUT: output,
        },
        stdio: ["ignore", fd, fd],
      });
      return {
        lines: readFileSync(log, "utf8").trimEnd().split("\n"),
        status: run.status,
        output: readFileSync(output, "utf8"),
      };
    } finally {
      closeSync(fd);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * The step of `workflow`'s `job` that runs `command`, run under the shell
 * the workflow gives it, prints `inside` (with what COMMANDS ends in) where the runner
 * reads no command, resumes when it fails too, on a line of its own when
 * the output before it ends mid-line, and then prints `after`, which the
 * runner reads as commands again. The token is new on every run. When
 * `piped`, stdout goes through a pipe, so its lines may come in another
 * order than stderr's, and what the step wrote to its outputs is
 * returned.
 */
function expectStopsCommands(
  workflow: string,
  job: string,
  command: string,
  inside: (ending: string) => string,
  after: string[],
  piped = false,
): string[] {
  const outputs: string[] = [];
  const step = stepRunning(workflow, job, command);
  const shell = shellOf(workflow, step);
  const script = scriptOf(step);
  const tokens = new Set<string>();
  for (const [status, ending] of [
    [0, "\n"],
    [1, "\n"],
    [0, ""],
  ] as const) {
    const { lines, status: exit, output } = runPrinting(shell, script, status, ending);
    outputs.push(output);
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
  return outputs;
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
      "wikidata.yml",
      "verify",
      "wikidata_labels.py --verify",
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
      "taxonomy.yml",
      "update",
      command,
      (ending) => `${WARNING}\n${COMMANDS}${ending}`,
      [],
    );
  });
});

describe("taxonomy.yml's check job", () => {
  it("reads no command from the taxonomy's text, and keeps the script's stdout as outputs", () => {
    const outputs = expectStopsCommands(
      "taxonomy.yml",
      "check",
      "taxonomy_deck.py --check",
      (ending) => `${WARNING}\n${COMMANDS}${ending}`,
      [],
      true,
    );
    expect(outputs).toEqual([`${WARNING}\n`, `${WARNING}\n`, `${WARNING}\n`]);
  });
});
