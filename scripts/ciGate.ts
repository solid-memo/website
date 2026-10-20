// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run ci:gate`: which of CI's jobs this run runs
 * (docs/releasing.md#what-each-stage-checks): every job, or only the
 * deterministic ones, the timing-dependent ones (real servers, the
 * journeys in Firefox, WebKit and on a phone) skipped where the same
 * tree already passed them. Every job that runs blocks.
 *
 * - A pull request, the merge queue and a run by hand: every job. The
 *   merge queue is where a tree is tested at full strength before it
 *   lands, so a flaky check is fixed there, not retried later.
 * - A push to main whose commit a merge_group run passed: the
 *   deterministic jobs. The same tree passed every job already.
 * - A push to main that skipped the queue (a merge through a ruleset
 *   bypass, such as an advisory's): every job, as in the queue, so a
 *   release built on it waits for the full run.
 * - A release commit, whose parent passed CI on main: the deterministic
 *   jobs, and the commit must change nothing but the files a release
 *   writes (release.config.mjs), or the gate fails. Its code is its
 *   parent's, already tested.
 *
 * It writes `jobs=all` or `jobs=deterministic` to GITHUB_OUTPUT, and with
 * the latter `tested-by=<run id>`: the CI run that ran the timing-dependent
 * jobs on this tree, whose engines' journeys the report on main takes in.
 * When that run's report of them has expired (GitHub keeps it 7 days, as
 * after a release made late by hand), every job runs instead, so the
 * report is never short of them.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

/** The files a release commits (release.config.mjs), each naming the version. */
const { assets } = (await import(new URL("../release.config.mjs", import.meta.url).href)) as {
  assets: string[];
};

/**
 * What a run runs, every job or the deterministic ones alone, and, when
 * those alone, the run that ran the others on this code.
 */
export type Gate =
  | { jobs: "all"; why: string }
  | { jobs: "deterministic"; testedBy: number; why: string };

const MAIN = "refs/heads/main";
/** The artifact of the engines' journeys that main's report takes from the run that ran them. */
export const ENGINES_BLOB = "journeys-blob-engines";
const RELEASE = "chore(release): ";

/** Whether a commit is a release commit, as ci.yml's concurrency group tells them apart. */
export function isRelease(subject: string): boolean {
  return subject.startsWith(RELEASE);
}

/** The files a release commit changes that a release never writes. */
export function strayFiles(changed: readonly string[]): string[] {
  return changed.filter((file) => !assets.includes(file));
}

/** What the gate reads. */
export interface GateIo {
  /** The run's event (GITHUB_EVENT_NAME) and ref (GITHUB_REF). */
  event: string;
  ref: string;
  /** The commit checked: its hash, subject and parents. */
  head(): { sha: string; subject: string; parents: string[] };
  /** The files a commit changes against its parent. */
  changed(sha: string): string[];
  /** The id of a CI run for `event` that passed on the commit, if there is one. */
  passed(sha: string, event: "merge_group" | "push"): Promise<number | undefined>;
  /** Whether a run still has an artifact of that name, not expired. */
  kept(run: number, artifact: string): Promise<boolean>;
  output(name: string, value: string): void;
  log(message: string): void;
}

/** The deterministic jobs, the others having run in `testedBy`, while its engines' report is kept. */
async function testedIn(io: GateIo, testedBy: number, why: string): Promise<Gate> {
  if (await io.kept(testedBy, ENGINES_BLOB)) {
    return { jobs: "deterministic", testedBy, why: `${why}: the deterministic jobs run.` };
  }
  return {
    jobs: "all",
    why: `${why}, but its ${ENGINES_BLOB} has expired: every job runs, so the journeys' report has the engines'.`,
  };
}

/** What this run runs, and why; throws when a release commit is not one. */
export async function decide(io: GateIo): Promise<Gate> {
  if (io.event !== "push" || io.ref !== MAIN) {
    return { jobs: "all", why: `A ${io.event} run on ${io.ref}: every job runs.` };
  }
  const { sha, subject, parents } = io.head();
  if (isRelease(subject)) {
    if (parents.length !== 1) {
      throw new Error(`The release commit ${sha} has ${parents.length} parents, not one.`);
    }
    const stray = strayFiles(io.changed(sha));
    if (stray.length > 0) {
      throw new Error(
        `The release commit ${sha} changes ${stray.join(", ")}, which a release never writes (release.config.mjs): only ${assets.join(", ")}.`,
      );
    }
    const parent = parents[0]!;
    const onMain = await io.passed(parent, "push");
    if (onMain === undefined) {
      return {
        jobs: "all",
        why: `A release commit on ${parent.slice(0, 8)}, which CI has not passed on main: every job runs.`,
      };
    }
    // The parent's push run ran every job only when the queue had not.
    const testedBy = (await io.passed(parent, "merge_group")) ?? onMain;
    return testedIn(
      io,
      testedBy,
      `A release commit, changing only the version's files, on ${parent.slice(0, 8)}, which CI passed on main; run ${testedBy} ran every job on its code`,
    );
  }
  const queued = await io.passed(sha, "merge_group");
  if (queued !== undefined) {
    return testedIn(io, queued, `${sha.slice(0, 8)} passed the merge queue in run ${queued}`);
  }
  return {
    jobs: "all",
    why: `${sha.slice(0, 8)} reached main without passing the merge queue: every job runs, as in the queue.`,
  };
}

/** Exit code: 0 once the gate is written, 1 when a release commit is not one. */
export async function main(io: GateIo): Promise<number> {
  try {
    const gate = await decide(io);
    io.log(gate.why);
    io.output("jobs", gate.jobs);
    if (gate.jobs === "deterministic") io.output("tested-by", String(gate.testedBy));
    return 0;
  } catch (error) {
    io.log((error as Error).message);
    return 1;
  }
}

/** The environment a GitHub Actions step gives the gate. */
export type GateEnv = Partial<
  Record<
    | "GITHUB_EVENT_NAME"
    | "GITHUB_REF"
    | "GITHUB_REPOSITORY"
    | "GITHUB_API_URL"
    | "GITHUB_OUTPUT"
    | "GH_TOKEN",
    string
  >
>;

/** The io of the repository at `repo`, in a run with environment `env`. */
export function defaultIo(repo: string, env: GateEnv, fetch: typeof globalThis.fetch): GateIo {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  /** A GET of the repository's REST API, its JSON answer. */
  const api = async (path: string, query: Record<string, string>): Promise<unknown> => {
    const url = new URL(
      `repos/${env.GITHUB_REPOSITORY}/${path}`,
      `${env.GITHUB_API_URL ?? "https://api.github.com"}/`,
    );
    url.search = new URLSearchParams(query).toString();
    const response = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${env.GH_TOKEN}`,
        "x-github-api-version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${url}.`);
    return response.json();
  };
  return {
    event: env.GITHUB_EVENT_NAME ?? "",
    ref: env.GITHUB_REF ?? "",
    head: () => {
      const [sha, parents, subject] = git("log", "-1", "--format=%H%x1f%P%x1f%s", "HEAD").split(
        "\x1f",
      );
      return { sha: sha!, subject: subject!, parents: parents!.split(" ").filter(Boolean) };
    },
    changed: (sha) =>
      git("diff", "--name-only", `${sha}^`, sha)
        .split("\n")
        .filter((file) => file !== ""),
    passed: async (sha, event) =>
      (
        (await api(`actions/workflows/ci.yml/runs`, {
          head_sha: sha,
          event,
          status: "success",
          per_page: "1",
        })) as { workflow_runs: { id: number }[] }
      ).workflow_runs[0]?.id,
    kept: async (run, artifact) =>
      (
        (await api(`actions/runs/${run}/artifacts`, { name: artifact })) as {
          artifacts: { expired: boolean }[];
        }
      ).artifacts.some(({ expired }) => !expired),
    output: (name, value) => {
      if (env.GITHUB_OUTPUT !== undefined) appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
    },
    log: (message) => console.log(message),
  };
}

/** The script entry: `node -e "import('./scripts/ciGate.ts').then((m) => m.run(process))"`. */
export async function run(process: {
  env: GateEnv;
  exitCode?: number | string | null | undefined;
}): Promise<void> {
  process.exitCode = await main(
    defaultIo(resolve(import.meta.dirname, ".."), process.env, globalThis.fetch),
  );
}
