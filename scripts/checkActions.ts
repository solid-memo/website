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
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** A `uses:` that is not a comment, its value unquoted, and what follows it. */
const USES = /^\s*(?:-\s+)?uses:\s*(["']?)([^\s"']+)\1(.*)$/;

/** An action from a repository, pinned: `owner/repo[/path]@<sha> # v<version>`. */
const PINNED = /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/;
const VERSION = /^\s+#\s+v\d\S*$/;

/** What is wrong with each `uses:` of one file; none when every one is pinned. */
export function fileProblems(path: string, yaml: string): string[] {
  return yaml.split("\n").flatMap((line, index) => {
    const uses = USES.exec(line);
    if (uses === null) return [];
    const action = uses[2]!;
    const rest = uses[3]!;
    if (action.startsWith("./")) return [];
    const where = `${path}:${index + 1}`;
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

/** Exit code: 0 when every external action is pinned to a commit. */
export function main(io: ActionsIo): number {
  const files = io.files();
  const problems = files.flatMap((path) => fileProblems(path, io.read(path)));
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) return 1;
  io.log(`All ${files.length} workflows and actions pin every action they use to a commit.`);
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkActions.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
