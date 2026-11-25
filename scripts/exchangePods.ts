// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Runs earlier releases' own code against this checkout's
 * (docs/releasing.md#what-never-changes): for this checkout itself, the
 * first release that can take part, and the first release of each major
 * version after it, a pod is exchanged with this checkout
 * (packages/adapters/solid/src/testing/podExchange.ts):
 *
 * 1. the release writes a pod, with its own scenario;
 * 2. this checkout uses it, and loses nothing it said;
 * 3. the release reads it, each value as this checkout read it, and
 *    saves it back, no save refused and each document as it was.
 *
 * The snapshots (podSnapshots.roundtrip.test.ts) show that this code
 * reads what earlier code wrote; only this shows that earlier code
 * still reads and saves what this code writes. A release takes part
 * when it has the runner, so the first that does is found, not named.
 * Each is checked out in a worktree of its own, with its own
 * dependencies, and removed after.
 */

/** The runner a release has to have to take part, by its path in the repository. */
export const RUNNER = "packages/adapters/solid/src/testing/podExchange.ts";

/** The steps of one exchange, each with the side that takes it. */
const STEPS = [
  ["write", "theirs"],
  ["use", "ours"],
  ["read", "theirs"],
] as const;

type Step = (typeof STEPS)[number][0];

const RELEASE = /^v(\d+)\.(\d+)\.(\d+)$/;

/** A release tag's version, or null for any other tag. */
function versionOf(tag: string): [number, number, number] | null {
  const parts = RELEASE.exec(tag);
  return parts === null ? null : [Number(parts[1]), Number(parts[2]), Number(parts[3])];
}

/**
 * Of the tags of releases that have the runner, the ones a pod is
 * exchanged with: the earliest, then the earliest of each major version
 * after its own, oldest first. A tag that is no release (`v1.2.3`)
 * counts for nothing. Every release between two of them shares a major
 * version with one, and a major version is where a change that breaks
 * is made.
 */
export function releasesToExchange(tags: readonly string[]): string[] {
  const releases = tags
    .flatMap((tag) => {
      const version = versionOf(tag);
      return version === null ? [] : [{ tag, version }];
    })
    .sort(
      (a, b) =>
        a.version[0] - b.version[0] || a.version[1] - b.version[1] || a.version[2] - b.version[2],
    );
  return releases
    .filter(({ version }, at) => at === 0 || version[0] !== releases[at - 1]!.version[0])
    .map(({ tag }) => tag);
}

/** What the exchange asks of the repository, the releases' checkouts and the runner. */
export interface ExchangeIo {
  /** Every tag of the repository. */
  tags(): string[];
  /** Whether the release at `tag` has the runner. */
  hasRunner(tag: string): boolean;
  /** A checkout of `tag` with its dependencies installed, by its folder. */
  checkout(tag: string): string;
  /** Removes a checkout made by `checkout`. */
  remove(dir: string): void;
  /** A new, empty folder for the pods of one exchange. */
  podsDir(): string;
  /** Takes one step in the checkout at `dir` (this one: null), the pods in `pods`; throws when it fails. */
  step(dir: string | null, step: Step, pods: string): void;
  log(message: string): void;
}

const USAGE = "Usage: npm run check:exchange [-- --self]";

/**
 * Exchanges a pod between this checkout and `theirs` (null: itself);
 * says which step failed, if one did.
 */
function exchange(io: ExchangeIo, name: string, theirs: string | null): boolean {
  const pods = io.podsDir();
  for (const [step, side] of STEPS) {
    try {
      io.step(side === "ours" ? null : theirs, step, pods);
    } catch (error) {
      const who = side === "ours" ? "this checkout" : name;
      io.log(`${name}: the step "${step}", taken by ${who}, failed: ${(error as Error).message}`);
      return false;
    }
  }
  io.log(`${name}: a pod it wrote was used here, and it read and saved the pod again.`);
  return true;
}

/** Exit code: 0 when every exchange went through. `--self` exchanges with this checkout alone. */
export function main(argv: readonly string[], io: ExchangeIo): number {
  // `node -e` puts the node binary first and drops the `--`.
  const args = argv.slice(1);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--self")) {
    io.log(USAGE);
    return 1;
  }
  let failed = exchange(io, "this checkout", null) ? 0 : 1;
  if (args.length === 1) return failed;
  const releases = releasesToExchange(io.tags().filter((tag) => io.hasRunner(tag)));
  if (releases.length === 0) {
    io.log(`No release has ${RUNNER} yet: the first that does takes part from then on.`);
  }
  for (const tag of releases) {
    let dir: string | undefined;
    try {
      dir = io.checkout(tag);
      if (!exchange(io, tag, dir)) failed = 1;
    } catch (error) {
      io.log(`${tag}: could not be checked out: ${(error as Error).message}`);
      failed = 1;
    } finally {
      if (dir !== undefined) io.remove(dir);
    }
  }
  return failed;
}

/** How a command is run: as execFileSync runs one. */
type Exec = (
  file: string,
  args: readonly string[],
  options: { cwd?: string; encoding?: "utf8"; stdio?: "inherit"; env?: NodeJS.ProcessEnv },
) => string | Buffer | null;

/** The io of the repository at `repo`, its commands run by `exec`, its folders made under `temp`. */
export function defaultIo(
  repo: string,
  exec: Exec = execFileSync,
  temp: string = tmpdir(),
): ExchangeIo {
  const git = (...args: string[]) =>
    String(exec("git", ["-C", repo, ...args], { encoding: "utf8" }));
  const folder = (prefix: string) => mkdtempSync(join(temp, prefix));
  return {
    tags: () =>
      git("tag", "--list")
        .split("\n")
        .filter((tag) => tag !== ""),
    hasRunner(tag) {
      try {
        git("cat-file", "-e", `${tag}:${RUNNER}`);
        return true;
      } catch {
        return false;
      }
    },
    checkout(tag) {
      const dir = join(folder("pod-exchange-release-"), tag);
      git("worktree", "add", "--detach", dir, tag);
      // As CI installs: no package's script is run.
      exec("npm", ["ci", "--ignore-scripts"], { cwd: dir, stdio: "inherit" });
      return dir;
    },
    remove(dir) {
      git("worktree", "remove", "--force", dir);
      rmSync(join(dir, ".."), { recursive: true, force: true });
    },
    podsDir: () => folder("pod-exchange-pods-"),
    step(dir, step, pods) {
      exec("npm", ["run", "exchange", "-w", "@solid-memo/solid"], {
        cwd: dir ?? repo,
        stdio: "inherit",
        env: { ...process.env, POD_EXCHANGE: step, POD_EXCHANGE_DIR: pods },
      });
    },
    log: (message) => console.log(message),
  };
}

/** The script entry: `node -e "import('./scripts/exchangePods.ts').then((m) => m.run(process))" -- [--self]`. */
export function run(process: {
  argv: readonly string[];
  exitCode?: number | string | null | undefined;
}): void {
  process.exitCode = main(process.argv, defaultIo(resolve(import.meta.dirname, "..")));
}
