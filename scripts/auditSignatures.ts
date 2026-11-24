// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run audit:signatures`: `npm audit signatures`, asked again when
 * the registry's answer couldn't be read (docs/testing.md#the-workflows).
 * The registry now and then answers a record or attestation request
 * with a body that isn't JSON (`OK`), or not at all, and npm stops the
 * whole command with that error rather than counting it against the
 * package. Only such an error is retried, up to three tries, each after
 * the first fetching every record again (`--prefer-online`) rather than
 * reading a cached copy of the broken answer. Any other failure, an
 * invalid or missing signature or attestation among them, fails on the
 * first try, as npm's own does. Its arguments go to npm, such as
 * `--prefix scripts/renovate`.
 */
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

/** How many times npm is run before the step fails. */
export const TRIES = 3;

/** How long to wait between two tries, in milliseconds. */
export const PAUSE = 15_000;

/**
 * npm's error codes for an answer it couldn't fetch or read: a body
 * that isn't JSON (FETCH_ERROR), a dropped or slow connection, a name
 * that didn't resolve, too many requests, or a server error.
 */
const UNREACHABLE =
  /^npm error code (?:FETCH_ERROR|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|E429|E5\d\d)$/m;

/** Whether npm's output says it failed on fetching from the registry. */
export function unreachable(output: string): boolean {
  return UNREACHABLE.test(output);
}

/** What one run of npm printed and how it exited. */
export type Audit = { status: number; stdout: string; stderr: string };

export type AuditIo = {
  /** Runs `npm audit signatures` with these arguments. */
  audit: (args: readonly string[]) => Audit;
  /** Waits this many milliseconds. */
  wait: (ms: number) => Promise<void>;
  /** Writes npm's output on, stdout and stderr each to its own. */
  print: (audit: Audit) => void;
  /** Leaves a warning in the run. */
  warn: (message: string) => void;
};

/** Runs the audit until it passes, fails on something other than a fetch, or runs out of tries. */
export async function main(args: readonly string[], io: AuditIo): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    const audit = io.audit(attempt === 1 ? args : [...args, "--prefer-online"]);
    io.print(audit);
    if (audit.status === 0) return 0;
    if (!unreachable(`${audit.stdout}\n${audit.stderr}`) || attempt === TRIES) return audit.status;
    io.warn(
      `npm audit signatures could not read the registry's answer (try ${attempt} of ${TRIES})`,
    );
    await io.wait(PAUSE);
  }
}

/** npm on the path, its output printed once it exits, and warnings as workflow commands. */
export function defaultIo(): AuditIo {
  return {
    audit: (args) => {
      const { status, stdout, stderr } = spawnSync("npm", ["audit", "signatures", ...args], {
        encoding: "utf8",
      });
      return { status: status ?? 1, stdout, stderr };
    },
    wait: (ms) => setTimeout(ms),
    print: ({ stdout, stderr }) => {
      process.stdout.write(stdout);
      process.stderr.write(stderr);
    },
    warn: (message) => console.log(`::warning::${message}`),
  };
}

/** The script entry: `node -e "import('./scripts/auditSignatures.ts').then((m) => m.run(process))" --`. */
export async function run(process: {
  argv: readonly string[];
  exitCode?: number | string | null | undefined;
}): Promise<void> {
  process.exitCode = await main(process.argv.slice(1), defaultIo());
}
