// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  defaultIo,
  main,
  PINNED,
  type Pin,
  pins,
  problems,
  run,
  type ShellIo,
  step,
  units,
  VERIFY,
  verification,
  wanted,
} from "./checkHeadlessShell.ts";

const SHELL = { version: "156.0.8078.4", revision: "1248" };
const SHA = "a".repeat(64);

const browsersJson = (shell: { version: string; revision: string } = SHELL) =>
  JSON.stringify({
    browsers: [
      { name: "chromium", revision: shell.revision, browserVersion: shell.version },
      { name: "chromium-headless-shell", revision: shell.revision, browserVersion: shell.version },
      { name: "ffmpeg", revision: "1013" },
    ],
  });

/** A pinned step's script, from its guards to marking the shell installed. */
const SCRIPT = [
  "set -eo pipefail",
  'expected=$(node -p "...")',
  'if [ "$expected" != "$CHROMIUM_HEADLESS_SHELL_VERSION" ]; then',
  '  echo "::error::playwright-core wants $expected."',
  "  exit 1",
  "fi",
  'curl -fsSL -o "$zip" "$url"',
  VERIFY,
  'unzip -q "$zip" -d "$dir"',
  'touch "$dir/INSTALLATION_COMPLETE"',
];

/** A step that pins the shell and downloads it, after `before` (a step's first keys). */
const pin = (
  { version, revision, sha256 }: Pin,
  script: string[] = SCRIPT,
  before: string[] = ["- shell: bash"],
) =>
  [
    "jobs:",
    "  docs:",
    "    steps:",
    "      - run: echo before",
    ...before.map((line, i) => (i === 0 ? `      ${line}` : `        ${line}`)),
    "        env:",
    `          CHROMIUM_HEADLESS_SHELL_VERSION: ${version}`,
    `          CHROMIUM_HEADLESS_SHELL_REVISION: "${revision}"`,
    `          CHROMIUM_HEADLESS_SHELL_SHA256: ${sha256}`,
    "        run: |",
    ...script.map((line) => (line === "" ? "" : `          ${line}`)),
    "",
    "      - run: echo after",
  ].join("\n");

const pinnedFiles = (yaml: string = pin({ ...SHELL, sha256: SHA })) =>
  new Map(PINNED.map((path) => [path, yaml]));

describe("checkHeadlessShell", () => {
  it("reads the headless shell playwright-core wants", () => {
    expect(wanted(browsersJson())).toEqual(SHELL);
    expect(() => wanted(JSON.stringify({ browsers: [{ name: "chromium" }] }))).toThrow(
      "names no chromium-headless-shell",
    );
  });

  it("reads a workflow's pins, quoted or not", () => {
    expect(pins(pin({ ...SHELL, sha256: SHA }))).toEqual([{ ...SHELL, sha256: SHA }]);
    expect(pins("jobs: {}\n")).toEqual([]);
    expect(pins("        CHROMIUM_HEADLESS_SHELL_VERSION: 1\n")).toBeNull();
  });

  it("passes the pins playwright-core wants, with one SHA-256", () => {
    expect(problems(SHELL, pinnedFiles())).toEqual([]);
  });

  // A Playwright update that moves the shell to a new build.
  it("fails when playwright-core wants another build than the one pinned", () => {
    const moved = { version: "157.0.1.2", revision: "1250" };
    expect(problems(moved, pinnedFiles())).toEqual(
      PINNED.map(
        (path) =>
          `${path}: pins the headless shell 156.0.8078.4 (revision 1248), and playwright-core wants 157.0.1.2 (revision 1250): record that build's SHA-256.`,
      ),
    );
  });

  it("fails on a pin that is missing, given more than once, incomplete or not a hash", () => {
    const [action, release] = PINNED as [string, string];
    const twice = `${pin({ ...SHELL, sha256: SHA })}\n${pin({ ...SHELL, sha256: SHA })}`;
    expect(problems(SHELL, new Map([[action, twice]]))).toEqual([
      `${action}: pins the headless shell 2 times, not once.`,
      `${release}: pins the headless shell 0 times, not once.`,
    ]);
    const incomplete = pin({ ...SHELL, sha256: SHA }).replace(/^.*SHA256.*$/m, "");
    expect(problems(SHELL, pinnedFiles(incomplete))).toEqual(
      PINNED.map(
        (path) => `${path}: the shell's version, revision and SHA-256 are not given together.`,
      ),
    );
    expect(problems(SHELL, pinnedFiles(pin({ ...SHELL, sha256: "latest" })))).toEqual(
      PINNED.map((path) => `${path}: CHROMIUM_HEADLESS_SHELL_SHA256 is not a SHA-256 in hex.`),
    );
  });

  it("fails when the two pins name different hashes", () => {
    const files = pinnedFiles();
    files.set(PINNED[1]!, pin({ ...SHELL, sha256: "b".repeat(64) }));
    expect(problems(SHELL, files)).toEqual([
      `${PINNED.join(" and ")} pin the headless shell with different SHA-256s.`,
      `${PINNED.join(" and ")} download the headless shell with different steps: make them the same step.`,
    ]);
  });

  it("reads the step that pins the shell, without its if", () => {
    const steps = step(
      pin({ ...SHELL, sha256: SHA }, SCRIPT, [
        "- if: >-",
        "    github.ref == 'refs/heads/main'",
        "name: Shell",
        "shell: bash",
      ]),
    );
    expect(steps.slice(0, 4)).toEqual([
      "name: Shell",
      "shell: bash",
      "env:",
      "  CHROMIUM_HEADLESS_SHELL_VERSION: 156.0.8078.4",
    ]);
    expect(steps.at(-1)).toBe('  touch "$dir/INSTALLATION_COMPLETE"');
    expect(step("jobs: {}")).toEqual([]);
    expect(step("CHROMIUM_HEADLESS_SHELL_VERSION: 1")).toEqual([]);
  });

  it("passes a step that checks the zip before it unpacks it, under set -e", () => {
    expect(verification(step(pin({ ...SHELL, sha256: SHA })))).toEqual([]);
  });

  it("fails a step that does not check the zip, or ignores the check failing", () => {
    const check = (script: string[], before?: string[]) =>
      verification(step(pin({ ...SHELL, sha256: SHA }, script, before)));
    const unverified = `does not run ${VERIFY} right after the download and before unzip`;
    expect(check(SCRIPT.filter((line) => line !== VERIFY))).toEqual([unverified]);
    expect(check(SCRIPT.map((line) => (line === VERIFY ? `${VERIFY} || true` : line)))).toEqual([
      "ignores a failure with || true",
      unverified,
    ]);
    expect(check(SCRIPT.map((line) => (line === VERIFY ? `${VERIFY} || :` : line)))).toEqual([
      "ignores a failure with || true",
      unverified,
    ]);
    expect(
      check(SCRIPT.map((line) => (line === VERIFY ? `if true; then ${line}; fi` : line))),
    ).toEqual([unverified]);
    expect(check(SCRIPT.map((line) => (line === VERIFY ? `  ${line}` : line)))).toEqual([
      unverified,
    ]);
    const [, ...unset] = SCRIPT;
    expect(check(unset)).toEqual(["does not start its script with set -e"]);
    expect(check([...SCRIPT.slice(0, 6), "set +e", ...SCRIPT.slice(6)])).toEqual([
      "turns set -e off",
    ]);
    const unpackedFirst = ['unzip -q "$zip" -d "$dir"', ...SCRIPT];
    expect(check(unpackedFirst)).toEqual(["does not start its script with set -e", unverified]);
    expect(check(SCRIPT, ["- name: Shell"])).toEqual(["does not run in bash (shell: bash)"]);
    expect(verification([])).toEqual([
      "does not run in bash (shell: bash)",
      "does not start its script with set -e",
      unverified,
    ]);
  });

  it("fails when a pinned file's step does not check the zip", () => {
    const files = pinnedFiles();
    const [action, release] = PINNED as [string, string];
    files.set(
      release,
      pin(
        { ...SHELL, sha256: SHA },
        SCRIPT.map((line) => (line === VERIFY ? `${VERIFY} || true` : line)),
      ),
    );
    expect(problems(SHELL, files)).toEqual([
      `${release}: the step that pins the headless shell ignores a failure with || true.`,
      `${release}: the step that pins the headless shell does not run ${VERIFY} right after the download and before unzip.`,
      `${action} and ${release} download the headless shell with different steps: make them the same step.`,
    ]);
    // Both copies the same, and both without the check.
    const unchecked = pin(
      { ...SHELL, sha256: SHA },
      SCRIPT.filter((line) => line !== VERIFY),
    );
    expect(problems(SHELL, pinnedFiles(unchecked))).toEqual(
      PINNED.map(
        (path) =>
          `${path}: the step that pins the headless shell does not run ${VERIFY} right after the download and before unzip.`,
      ),
    );
  });

  it("fails when the pinned files' steps differ in anything but their if", () => {
    const [action, release] = PINNED as [string, string];
    const files = pinnedFiles();
    files.set(
      release,
      pin({ ...SHELL, sha256: SHA }, SCRIPT, [
        "- if: steps.release.outputs.attach == 'true'",
        "shell: bash",
      ]),
    );
    expect(problems(SHELL, files)).toEqual([]);
    files.set(
      release,
      pin(
        { ...SHELL, sha256: SHA },
        SCRIPT.map((line) => line.replace("::error::", "::warning::")),
      ),
    );
    expect(problems(SHELL, files)).toEqual([
      `${action} and ${release} download the headless shell with different steps: make them the same step.`,
    ]);
  });

  it("splits a workflow into its jobs, and takes an action whole", () => {
    expect(units("on: push\njobs:\n  a:\n    x: 1\n  b-2:\n    y: 2")).toEqual([
      { start: 2, lines: ["  a:", "    x: 1"] },
      { start: 4, lines: ["  b-2:", "    y: 2"] },
    ]);
    expect(units("runs:\n  using: composite")).toEqual([
      { start: 0, lines: ["runs:", "  using: composite"] },
    ]);
  });

  // What the jobs ran before: Playwright's download, which checks no hash.
  it("fails on a workflow that installs the shell with Playwright, however spelled", () => {
    const files = pinnedFiles();
    files.set(
      ".github/workflows/site.yml",
      [
        "jobs:",
        "  journeys:",
        "    steps:",
        "      - run: npx playwright install-deps chromium",
        "      - run: npx playwright install --with-deps --only-shell chromium",
        "      - run: npx playwright install firefox",
        "      - run: npx playwright  install chromium-headless-shell",
        "      - run: npm exec playwright -- install --only-shell chromium",
        "      - run: |",
        "          npx playwright install \\",
        "            --only-shell chromium",
        "      - run: npx playwright@1.64.1 install --only-shell chromium",
        "      - run: npx @playwright/test install --only-shell chromium",
        "      - run: node node_modules/playwright/cli.js install --only-shell chromium",
        "      - run: >-",
        "          npx playwright",
        "          install --only-shell chromium",
        "        env:",
        "          CI: true",
        "      - name: Plain",
        "        run: npx playwright",
        "          install chromium-headless-shell",
        "      - run: |",
        "          npx playwright --version",
        "",
        "          echo install --only-shell",
        "      - with:",
        "          script: |",
        "            npx playwright install \\",
        "              --only-shell chromium",
      ].join("\n"),
    );
    const message =
      "installs the headless shell with Playwright, which checks no hash: use .github/actions/headless-shell.";
    expect(problems(SHELL, files)).toEqual(
      [5, 7, 8, 9, 12, 13, 14, 15, 21, 29].map(
        (line) => `.github/workflows/site.yml:${line}: ${message}`,
      ),
    );
  });

  // Chromium installs the headless shell and FFmpeg too, unchecked.
  it("fails on a job that restores nothing from the cache and installs any browser with Playwright", () => {
    const files = pinnedFiles();
    files.set(
      ".github/workflows/site.yml",
      [
        "jobs:",
        "  journeys:",
        "    steps:",
        "      - run: npx playwright install chromium",
        "  site:",
        "    steps:",
        "      - uses: ./.github/actions/chromium",
        "        with:",
        "          cache: false",
        "      - run: npx playwright install-deps chromium",
        "      - run: npx playwright install --with-deps chromium",
      ].join("\n"),
    );
    expect(problems(SHELL, files)).toEqual([
      ".github/workflows/site.yml:11: installs a browser with Playwright, which checks no hash, in a job that restores nothing from GitHub's cache: use .github/actions/headless-shell.",
    ]);
  });

  it("logs each problem and fails, or passes and says which shell", () => {
    const io = (files: Map<string, string>): ShellIo & { logged: string[] } => {
      const logged: string[] = [];
      return { browsersJson, files: () => files, log: (m) => void logged.push(m), logged };
    };
    const good = io(pinnedFiles());
    expect(main(good)).toBe(0);
    expect(good.logged).toEqual([
      "The workflows download the headless shell 156.0.8078.4 (revision 1248) that playwright-core wants, checked against its SHA-256.",
    ]);
    const bad = io(new Map());
    expect(main(bad)).toBe(1);
    expect(bad.logged).toHaveLength(2);
  });

  it("holds the repository's own workflows to the installed playwright-core", () => {
    const io = defaultIo(join(import.meta.dirname, ".."));
    const files = io.files();
    expect([...files.keys()]).toEqual(expect.arrayContaining([...PINNED]));
    expect([...files.keys()].every((path) => path.endsWith(".yml"))).toBe(true);
    expect(problems(wanted(io.browsersJson()), files)).toEqual([]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    io.log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    const process = { exitCode: undefined as number | string | null | undefined };
    run(process);
    expect(process.exitCode).toBe(0);
    log.mockRestore();
  });
});
