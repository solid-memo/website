// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:shell`: the Chromium headless shell the workflows
 * download is the build the installed playwright-core wants, checked
 * against one SHA-256 (docs/testing.md#the-repositorys-own-checks).
 * Playwright's own download checks no hash, so the workflows download
 * the zip themselves and check it against the hash committed beside its
 * version and revision: in actions/headless-shell, and in release.yml's
 * docs job, which cannot use a local action. An update to playwright
 * that moves the shell fails here until a person records the new
 * build's hash in both, which are the same step, one that checks the
 * zip with sha256sum, failing, before it unpacks it. No workflow
 * or action installs the shell with Playwright (`playwright install
 * --only-shell`, or `chromium-headless-shell`), whichever way the CLI
 * is named or a `run:` step's script is split over lines, and no job
 * that restores nothing from GitHub's cache installs any browser with
 * it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

/** The files that download the shell, each pinning it once. */
export const PINNED = [
  ".github/actions/headless-shell/action.yml",
  ".github/workflows/release.yml",
];

export type Shell = { version: string; revision: string };
export type Pin = Shell & { sha256: string };

/** The headless shell a playwright-core's browsers.json names. */
export function wanted(browsersJson: string): Shell {
  const { browsers } = JSON.parse(browsersJson) as {
    browsers: { name: string; revision: string; browserVersion?: string }[];
  };
  const shell = browsers.find((browser) => browser.name === "chromium-headless-shell");
  if (shell?.browserVersion === undefined) {
    throw new Error("playwright-core's browsers.json names no chromium-headless-shell");
  }
  return { version: shell.browserVersion, revision: shell.revision };
}

/** Each value of an env key (`KEY: value`, the value quoted or not) in a workflow, in order. */
function values(yaml: string, key: string): string[] {
  return [...yaml.matchAll(new RegExp(`^\\s*${key}: "?([^"\\s]*)"?\\s*$`, "gm"))].map(
    ([, value]) => value!,
  );
}

/** The shell's pins in a workflow or action: version, revision and SHA-256, together. */
export function pins(yaml: string): Pin[] | null {
  const version = values(yaml, "CHROMIUM_HEADLESS_SHELL_VERSION");
  const revision = values(yaml, "CHROMIUM_HEADLESS_SHELL_REVISION");
  const sha256 = values(yaml, "CHROMIUM_HEADLESS_SHELL_SHA256");
  if (version.length !== revision.length || version.length !== sha256.length) return null;
  return version.map((v, i) => ({ version: v, revision: revision[i]!, sha256: sha256[i]! }));
}

/** The check of the zip against the pinned SHA-256, which fails the step when they differ. */
export const VERIFY = 'echo "$CHROMIUM_HEADLESS_SHELL_SHA256  $zip" | sha256sum -c -';

/** The indentation of a line. */
const indent = (line: string) => line.length - line.trimStart().length;

/**
 * The step that pins the shell, dedented, its first key's `- ` left
 * out, and its `if:`, which may differ between the two copies, too;
 * empty when the file has no such step.
 */
export function step(yaml: string): string[] {
  const lines = yaml.split("\n");
  const pin = lines.findIndex((line) => /^\s*CHROMIUM_HEADLESS_SHELL_VERSION:/.test(line));
  let first = pin;
  while (first >= 0 && !/^\s*-\s/.test(lines[first]!)) first--;
  if (first < 0) return [];
  const column = /^\s*-\s+/.exec(lines[first]!)![0].length;
  const found = [lines[first]!.slice(column)];
  for (let next = first + 1; next < lines.length; next++) {
    const line = lines[next]!;
    if (line.trim() !== "" && indent(line) < column) break;
    found.push(line.slice(column));
  }
  while (found.at(-1)?.trim() === "") found.pop();
  const kept: string[] = [];
  let inIf = false;
  for (const line of found) {
    if (indent(line) === 0 && line.trim() !== "") inIf = line.startsWith("if:");
    if (!inIf) kept.push(line);
  }
  return kept;
}

/**
 * What keeps a pinned step from checking the zip before it is
 * unpacked: its script runs under `set -e` in bash, with no `set +`
 * after, and the line after the download is VERIFY, at the script's
 * top level, with nothing (`|| true`, `|| :`) that ignores a failure.
 */
export function verification(lines: string[]): string[] {
  const found: string[] = [];
  if (!lines.includes("shell: bash")) found.push("does not run in bash (shell: bash)");
  const run = lines.indexOf("run: |");
  const body = run < 0 ? [] : lines.slice(run + 1);
  const column = body.length === 0 ? 0 : indent(body[0]!);
  const script = body.map((line) => line.slice(column));
  if (!/^set -\w*e\w*(?:\s|$)/.test(script[0] ?? "")) {
    found.push("does not start its script with set -e");
  }
  if (script.some((line) => /\bset \+/.test(line))) found.push("turns set -e off");
  if (script.some((line) => /\|\|\s*(?:true|:)(?:[\s;)]|$)/.test(line))) {
    found.push("ignores a failure with || true");
  }
  const curl = script.findIndex((line) => line.startsWith("curl ") && line.includes('-o "$zip"'));
  const unzip = script.findIndex((line) => /\bunzip\b/.test(line));
  if (curl < 0 || script[curl + 1] !== VERIFY || unzip < curl + 1) {
    found.push(`does not run ${VERIFY} right after the download and before unzip`);
  }
  return found;
}

/**
 * A `playwright install`, not `install-deps`, however the CLI is named:
 * `playwright`, `playwright@<version>`, `@playwright/test`, or its
 * `cli.js` run with node, as npx, `npm exec` or node runs it.
 */
const INSTALL =
  /\bplaywright(?:-core)?(?:\/test)?(?:@[^\s/]+)?(?:\/(?:lib\/)?cli\.js)?\s+(?:--\s+)?install\b(?!-)/;
/** An install that names the headless shell. */
const SHELL_ARG = /--only-shell|\bchromium-headless-shell\b/;
/** A job that restores nothing from GitHub's cache: setup-node's or the Chromium action's `cache: false`. */
const UNCACHED = /^\s+(?:package-manager-)?cache: false\s*$/m;

/** A workflow's jobs, or an action whole, each with the index of its first line. */
export function units(yaml: string): { start: number; lines: string[] }[] {
  const lines = yaml.split("\n");
  const jobs = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobs < 0) return [{ start: 0, lines }];
  const found: { start: number; lines: string[] }[] = [];
  lines.forEach((line, index) => {
    if (index <= jobs) return;
    if (/^ {2}[\w-]+:\s*$/.test(line)) found.push({ start: index, lines: [] });
    found.at(-1)?.lines.push(line);
  });
  return found;
}

/** A `run:` key, after a step's `- ` or not, and its value on the same line. */
const RUN = /^(\s*(?:-\s+)?)run:\s*(.*)$/;

/**
 * Each command in a job's lines, with the index of its first line: a
 * `run:` step's whole script on one line, however its scalar is written
 * (literal, folded or plain over several lines), and any other line
 * with the lines a trailing backslash continues it onto.
 */
function commands(lines: string[]): { index: number; command: string }[] {
  const found: { index: number; command: string }[] = [];
  for (let index = 0; index < lines.length; index++) {
    const run = RUN.exec(lines[index]!);
    if (run !== null) {
      const column = run[1]!.length;
      const body: string[] = /^[|>][-+0-9]*\s*(?:#.*)?$/.test(run[2]!) ? [] : [run[2]!];
      let next = index + 1;
      for (; next < lines.length; next++) {
        const line = lines[next]!;
        if (line.trim() !== "" && line.length - line.trimStart().length <= column) break;
        body.push(line.trim());
      }
      const command = body
        .map((line) => (line.endsWith("\\") ? line.slice(0, -1) : line))
        .join(" ");
      found.push({ index, command });
      index = next - 1;
      continue;
    }
    let command = lines[index]!;
    for (let next = index + 1; command.endsWith("\\") && next < lines.length; next++) {
      command = `${command.slice(0, -1)} ${lines[next]}`;
    }
    found.push({ index, command });
  }
  return found;
}

/** What is wrong with a file's installs of browsers with Playwright, by line. */
function installs(path: string, yaml: string): string[] {
  const found: string[] = [];
  for (const { start, lines } of units(yaml)) {
    const uncached = UNCACHED.test(lines.join("\n"));
    for (const { index, command } of commands(lines)) {
      if (!INSTALL.test(command)) continue;
      const at = `${path}:${start + index + 1}`;
      if (SHELL_ARG.test(command)) {
        found.push(
          `${at}: installs the headless shell with Playwright, which checks no hash: use .github/actions/headless-shell.`,
        );
      } else if (uncached) {
        found.push(
          `${at}: installs a browser with Playwright, which checks no hash, in a job that restores nothing from GitHub's cache: use .github/actions/headless-shell.`,
        );
      }
    }
  }
  return found;
}

/** What is wrong with the workflows' pins of the shell, and their installs of it; empty when nothing. */
export function problems(shell: Shell, files: ReadonlyMap<string, string>): string[] {
  const found: string[] = [];
  const hashes = new Set<string>();
  const steps = new Set<string>();
  for (const path of PINNED) {
    const yaml = files.get(path) ?? "";
    const all = pins(yaml);
    if (all === null) {
      found.push(`${path}: the shell's version, revision and SHA-256 are not given together.`);
      continue;
    }
    if (all.length !== 1) {
      found.push(`${path}: pins the headless shell ${all.length} times, not once.`);
      continue;
    }
    const [pin] = all as [Pin];
    if (pin.version !== shell.version || pin.revision !== shell.revision) {
      found.push(
        `${path}: pins the headless shell ${pin.version} (revision ${pin.revision}), and playwright-core wants ${shell.version} (revision ${shell.revision}): record that build's SHA-256.`,
      );
    }
    if (!/^[0-9a-f]{64}$/.test(pin.sha256)) {
      found.push(`${path}: CHROMIUM_HEADLESS_SHELL_SHA256 is not a SHA-256 in hex.`);
    }
    hashes.add(pin.sha256);
    const lines = step(yaml);
    steps.add(lines.join("\n"));
    for (const problem of verification(lines)) {
      found.push(`${path}: the step that pins the headless shell ${problem}.`);
    }
  }
  if (hashes.size > 1) {
    found.push(`${PINNED.join(" and ")} pin the headless shell with different SHA-256s.`);
  }
  if (steps.size > 1) {
    found.push(
      `${PINNED.join(" and ")} download the headless shell with different steps: make them the same step.`,
    );
  }
  for (const [path, yaml] of files) found.push(...installs(path, yaml));
  return found;
}

export type ShellIo = {
  /** The installed playwright-core's browsers.json. */
  browsersJson(): string;
  /** Every workflow and action, by its path from the repository's root. */
  files(): Map<string, string>;
  log(message: string): void;
};

/** Every .yml file under `dir`, by its path from `root`. */
function ymlFiles(root: string, dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return ymlFiles(root, path);
    return path.endsWith(".yml") ? [path] : [];
  });
}

export function defaultIo(root: string): ShellIo {
  const require = createRequire(join(root, "package.json"));
  return {
    browsersJson: () =>
      readFileSync(
        join(dirname(require.resolve("playwright-core/package.json")), "browsers.json"),
        "utf8",
      ),
    files: () =>
      new Map(
        ymlFiles(root, ".github").map((path) => [path, readFileSync(join(root, path), "utf8")]),
      ),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when the workflows pin the shell playwright-core wants. */
export function main(io: ShellIo): number {
  const shell = wanted(io.browsersJson());
  const found = problems(shell, io.files());
  for (const problem of found) io.log(problem);
  if (found.length > 0) return 1;
  io.log(
    `The workflows download the headless shell ${shell.version} (revision ${shell.revision}) that playwright-core wants, checked against its SHA-256.`,
  );
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkHeadlessShell.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
