// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:actions`: every action a workflow or a local action uses
 * from outside the repository is pinned to a full commit SHA, with the
 * version it is after a comment (`uses: actions/checkout@<sha> # v7.0.1`),
 * as Renovate writes and updates them (helpers:pinGitHubActionDigests in
 * renovate.json5). A tag can be moved to other code; a commit cannot. The
 * end-to-end tests' images are pinned by digest for the same reason
 * (e2e/pod/servers.ts). A local action (`./.github/actions/...`) is the
 * repository's own code, and is left out.
 *
 * Every `npm ci`, `npm install`, `npm update`, `npm dedupe`, `npm link`
 * or `npm rebuild` they run, under any of its names, says
 * `--ignore-scripts`, and none sets `npm_config_ignore_scripts` but to
 * true, so no package runs code of its own as it is installed
 * (docs/vendor-code.md#installing).
 * The root .npmrc says so too, but a job may check out a commit from
 * before it.
 *
 * A tool a workflow downloads, its version after a `# renovate:`
 * comment, has the SHA-256 of the file it downloads on the line after
 * its version (`<NAME>_SHA256: <hash>`), which the workflow checks the
 * file against: checksums published beside the file can be replaced
 * with it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** A `uses:` that is not a comment, its value unquoted, and what follows it. */
const USES = /^\s*(?:-\s+)?uses:\s*(["']?)([^\s"']+)\1(.*)$/;

/** An action from a repository, pinned: `owner/repo[/path]@<sha> # v<version>`. */
const PINNED = /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/;
const VERSION = /^\s+#\s+v\d\S*$/;

/**
 * A command that installs packages, under any of npm's names for it and
 * after any of npm's own options (`npm -w app ci`), and the flag that
 * keeps install scripts from running, as a whole word. What follows a
 * `#` is a comment, and is not read.
 */
const NPM_INSTALL =
  /\bnpm(?:\s+-{1,2}[\w-]+(?:=\S*|\s+(?!-)\S+)?)*\s+(ci|clean-install|ic|install-clean|isntall-clean|install-test|it|install-ci-test|cit|clean-install-test|sit|install|i|in|ins|inst|insta|instal|isnt|isnta|isntal|isntall|add|update|up|upgrade|udpate|dedupe|ddp|link|ln|rebuild|rb)(?=\s|$)/;
const IGNORE_SCRIPTS = /\s--ignore-scripts(?:=true)?(?=\s|$)/;
/** A flag or a setting that turns install scripts back on. */
const SCRIPTS_ON = /\s--(?:no-ignore-scripts|ignore-scripts(?:=(?!true(?:\s|$))|\s+false\b))/;
const CONFIG = /\bnpm_config_ignore_scripts\b(?!\s*[:=]\s*(["']?)true\1(?:\s|$))/i;

/** A tool a workflow downloads: its comment, version and hash, as renovate.json5 reads them. */
const DOWNLOAD = /^\s*# renovate: datasource=\S+ depName=(\S+)/;
const DOWNLOAD_VERSION = /^\s*[A-Z_]+: \S+$/;
const DOWNLOAD_SHA256 = /^\s*([A-Z_]+_SHA256): [0-9a-f]{64}$/;

/** What is wrong with each `uses:`, npm install and npm setting of one file; none when every one is as it should be. */
export function fileProblems(path: string, yaml: string): string[] {
  return yaml.split("\n").flatMap((line, index) => {
    const where = `${path}:${index + 1}`;
    const code = line.split("#")[0]!;
    const install = NPM_INSTALL.exec(code);
    if (install !== null && (!IGNORE_SCRIPTS.test(code) || SCRIPTS_ON.test(code))) {
      return [
        `${where}: npm ${install[1]} without --ignore-scripts runs the packages' install scripts.`,
      ];
    }
    if (CONFIG.test(code)) {
      return [
        `${where}: npm_config_ignore_scripts other than true runs the packages' install scripts.`,
      ];
    }
    const uses = USES.exec(line);
    if (uses === null) return [];
    const action = uses[2]!;
    const rest = uses[3]!;
    if (action.startsWith("./")) return [];
    if (!PINNED.test(action)) {
      return [
        `${where}: ${action} is not pinned to a full commit SHA (owner/repo@<sha> # vX.Y.Z).`,
      ];
    }
    if (!VERSION.test(rest)) {
      return [`${where}: ${action} names no version after it (# vX.Y.Z), which Renovate updates.`];
    }
    return [];
  });
}

/** What is wrong with each tool one file downloads; none when each names its hash and checks it. */
export function downloadProblems(path: string, yaml: string): string[] {
  const lines = yaml.split("\n");
  return lines.flatMap((line, index) => {
    const download = DOWNLOAD.exec(line);
    if (download === null) return [];
    const where = `${path}:${index + 1}: ${download[1]}`;
    const sha256 = DOWNLOAD_VERSION.test(lines[index + 1] ?? "")
      ? DOWNLOAD_SHA256.exec(lines[index + 2] ?? "")
      : null;
    if (sha256 === null) {
      return [
        `${where} names no version and SHA-256 after it (<NAME>_VERSION: and <NAME>_SHA256: on the next lines), which the workflow checks the download against.`,
      ];
    }
    if (!yaml.includes(`$${sha256[1]}`)) {
      return [`${where}: nothing checks the download against ${sha256[1]}.`];
    }
    return [];
  });
}

export type ActionsIo = {
  /** Every workflow and local action, as a path from the repository's root. */
  files(): string[];
  read(path: string): string;
  log(message: string): void;
};

export function defaultIo(root: string): ActionsIo {
  return {
    files: () =>
      readdirSync(join(root, ".github"), { recursive: true, encoding: "utf8" })
        .filter((file) => /\.ya?ml$/.test(file))
        .filter((file) => /^(workflows|actions)\//.test(file))
        .map((file) => `.github/${file}`)
        .sort(),
    read: (path) => readFileSync(join(root, path), "utf8"),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when every external action is pinned to a commit, every download to its hash, and no npm install runs an install script. */
export function main(io: ActionsIo): number {
  const files = io.files();
  const problems = files.flatMap((path) => {
    const yaml = io.read(path);
    return [...fileProblems(path, yaml), ...downloadProblems(path, yaml)];
  });
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) return 1;
  io.log(
    `All ${files.length} workflows and actions pin every action they use to a commit and every tool they download to its hash, and install no package's script.`,
  );
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkActions.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
