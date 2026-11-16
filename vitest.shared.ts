// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { availableParallelism, totalmem } from "node:os";
import { defineConfig, type ViteUserConfig } from "vitest/config";
import { solidClientPlugin } from "./scripts/solidClient.ts";

/**
 * The test setup every package shares (docs/testing.md): each package's
 * own code at 100% coverage, test helpers (`src/testing/`, `src/test/`)
 * excepted. `environment` is "node" unless the package runs in the
 * browser; `include` lists what counts, beyond `src/`.
 *
 * A test may take 60 s, not vitest's 5: CI runs every package's tests at
 * once, coverage on, on a runner that takes some tests fifty times as
 * long as a laptop does (the generator's check of `ns/`, 0.1 s on a
 * laptop, ran out of 5 s there; reading a file at the size limits, about
 * a second on a laptop, ran out of 30 s). A test that hangs still fails.
 *
 * Off CI, a run starts only as many workers as its share of the memory
 * holds, given how many tasks Turbo runs at once (testWorkers, below).
 */
export function packageConfig({
  environment = "node",
  include = [],
  exclude = [],
  test = {},
}: {
  environment?: "node" | "happy-dom";
  include?: string[];
  exclude?: string[];
  test?: NonNullable<ViteUserConfig["test"]>;
} = {}) {
  return defineConfig({
    plugins: [solidClientPlugin()],
    test: {
      environment,
      testTimeout: 60_000,
      maxWorkers: testWorkers({
        ci: process.env.CI,
        concurrency: process.env.TURBO_CONCURRENCY,
        cpus: availableParallelism(),
        memoryGb: totalmem() / 2 ** 30,
      }),
      ...test,
      coverage: {
        provider: "v8",
        // json-summary: the totals CI's run summary shows (scripts/coverageSummary.ts).
        reporter: ["text", "html", "json-summary"],
        include: ["src/**/*.{ts,tsx}", ...include],
        exclude: ["src/testing/**", "src/test/**", ...exclude],
        thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  });
}

/**
 * How many workers each package's Vitest run may start
 * (docs/testing.md#on-your-own-machine).
 *
 * Turbo runs up to TURBO_CONCURRENCY tasks at once, 10 by default, and
 * Vitest's default is a worker for every CPU but one in each of them. On
 * a machine with many CPUs and little memory, such as a laptop's WSL with
 * 24 CPUs and 15 GB, `npm run check` could start some 230 workers, which ran the
 * machine out of memory. So, off CI, the runs share three quarters of the
 * memory instead: a run's own process takes about RUN_GB and each of its
 * workers about WORKER_GB (`ui`'s tests, with coverage and four workers,
 * took 1.8 GB). A run has one worker at least, and no more than Vitest's
 * default. CI keeps that default: its runners' four CPUs hold each run to
 * three workers already.
 */

/** About what a Vitest run's own process takes, in GB. */
const RUN_GB = 0.75;

/** About what each of its workers takes, in GB. */
const WORKER_GB = 0.5;

/** The share of the memory the runs may take together. */
const MEMORY_SHARE = 0.75;

/** Turbo's concurrency when TURBO_CONCURRENCY doesn't set one. */
const TURBO_DEFAULT = 10;

/**
 * The tasks Turbo runs at once: TURBO_CONCURRENCY as a number, or as a
 * percentage of the CPUs, and Turbo's default otherwise.
 */
function turboTasks(concurrency: string | undefined, cpus: number): number {
  const value = concurrency?.trim() ?? "";
  const percent = /^(\d+)%$/.exec(value);
  if (percent) return Math.max(1, Math.round((Number(percent[1]) / 100) * cpus));
  return /^[1-9]\d*$/.test(value) ? Number(value) : TURBO_DEFAULT;
}

/**
 * The workers a package's Vitest run may start, or undefined on CI, for
 * Vitest's default.
 */
export function testWorkers({
  ci,
  concurrency,
  cpus,
  memoryGb,
}: {
  /** CI, as the environment has it. */
  ci: string | undefined;
  /** TURBO_CONCURRENCY, as the environment has it. */
  concurrency: string | undefined;
  /** The CPUs the machine has (os.availableParallelism()). */
  cpus: number;
  /** The machine's memory, in GB (os.totalmem()). */
  memoryGb: number;
}): number | undefined {
  if (ci !== undefined && ci !== "") return undefined;
  const tasks = turboTasks(concurrency, cpus);
  const share = (memoryGb * MEMORY_SHARE - tasks * RUN_GB) / tasks;
  const vitestDefault = Math.max(cpus - 1, 1);
  return Math.min(Math.max(Math.floor(share / WORKER_GB), 1), vitestDefault);
}
