// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run pending:updates -- <report.json>`: one comment on Renovate's
 * Dependency Dashboard, kept up to date, that says when each update still
 * waiting for its release age will be proposed
 * (GOVERNANCE.md#dependency-updates). Renovate proposes a version only once
 * it has been public for `minimumReleaseAge`, and lists an update that waits
 * under "Pending Status Checks" with no date.
 *
 * The Pending updates workflow runs Renovate read-only on the repository
 * (`--platform=local --dry-run=lookup`), whose report gives each update its
 * branch, whether it waits (`pendingChecks`) and its version's release date
 * (`releaseTimestamp`). The earliest time Renovate may propose a branch is
 * its newest release date plus the wait. A version with no release date
 * waits until Renovate finds one; a digest update's date is not in the
 * report. A branch the dashboard still lists as waiting, but which this run
 * no longer holds back, is past its age and is proposed on the Renovate
 * app's next run. A branch with a pull request already is left out.
 *
 * It reads the wait from renovate.json5 as a plain line, so that it needs
 * no npm package and its job installs none, and refuses to estimate when a
 * rule sets another wait. Only a comment of this workflow's bot, starting
 * with its marker, is ever edited.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** The first line of the comment, by which it is found again. */
export const MARKER = "<!-- pending-release-age -->";

/** Who opens the Dependency Dashboard, and who writes the comment. */
const RENOVATE = "renovate[bot]";
const ACTIONS = "github-actions[bot]";
const DASHBOARD = "Dependency Dashboard";

const UNITS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
};

/** The wait renovate.json5 sets on every update, in milliseconds. */
export function minimumReleaseAge(config: string): number {
  const lines = config.split("\n").filter((line) => /^\s*minimumReleaseAge:/.test(line));
  const top = lines.filter((line) => /^ {4}\S/.test(line));
  const others = lines.filter(
    (line) => !/^ {4}\S/.test(line) && !/^ {8}minimumReleaseAge: null,$/.test(line),
  );
  if (top.length !== 1 || others.length > 0) {
    throw new Error(
      "renovate.json5 sets minimumReleaseAge other than once at its top (and to null for security updates): the estimate would not be Renovate's.",
    );
  }
  const age = /^ {4}minimumReleaseAge: '(\d+) (minute|hour|day|week)s?',$/.exec(top[0]!);
  if (age === null)
    throw new Error(
      `renovate.json5's wait is not a number of minutes, hours, days or weeks: ${top[0]!.trim()}`,
    );
  return Number(age[1]) * UNITS[age[2]!]!;
}

/** The part of an update in Renovate's report that the estimate reads. */
type Update = {
  branchName?: string;
  updateType?: string;
  newValue?: string;
  newDigest?: string | null;
  pendingChecks?: boolean;
  releaseTimestamp?: string;
};

/** Renovate's report (`--report-type=file`), as far as the estimate reads it. */
export type Report = {
  repositories: Record<
    string,
    { packageFiles?: Record<string, { deps: { depName?: string; updates?: Update[] }[] }[]> }
  >;
};

/** One branch of the report: what it updates, and how long it waits. */
export type Branch = {
  name: string;
  /** Each update in it, once, as `name → version`. */
  updates: string[];
  /** Whether Renovate holds it back. */
  pending: boolean;
  /** Its newest release date, in milliseconds. */
  released?: number;
  /** A version in it with no release date. */
  undated: boolean;
  /** A digest update in it, whose date the report doesn't give. */
  digest: boolean;
};

/** Text from the report or the repository, safe in a table cell's code span. */
function code(text: string): string {
  return `\`${text.replace(/[`|\r\n]/g, "")}\``;
}

/** Every update in the report, with the name of the dependency it updates. */
function updates(report: Report): { depName: string; update: Update }[] {
  return Object.values(report.repositories)
    .flatMap((repository) => Object.values(repository.packageFiles ?? {}).flat())
    .flatMap((file) => file.deps)
    .flatMap((dep) =>
      (dep.updates ?? []).map((update) => ({ depName: dep.depName ?? "", update })),
    );
}

/** `branch` with one more of its updates. */
function add(branch: Branch, depName: string, update: Update): Branch {
  const digest = update.updateType === "digest";
  const to = digest
    ? `digest ${(update.newDigest ?? "").replace(/^sha256:/, "").slice(0, 7)}`
    : (update.newValue ?? "");
  const label = `${code(depName)} → ${code(to)}`;
  if (!branch.updates.includes(label)) branch.updates.push(label);
  branch.pending ||= update.pendingChecks === true;
  if (update.releaseTimestamp !== undefined) {
    branch.released = Math.max(branch.released ?? 0, Date.parse(update.releaseTimestamp));
  } else if (digest) {
    branch.digest = true;
  } else {
    branch.undated = true;
  }
  return branch;
}

/** Each branch the report proposes, by name. */
export function branches(report: Report): Map<string, Branch> {
  const found = new Map<string, Branch>();
  for (const { depName, update } of updates(report)) {
    const name = update.branchName;
    if (name === undefined) continue;
    const branch = found.get(name) ?? {
      name,
      updates: [],
      pending: false,
      undated: false,
      digest: false,
    };
    found.set(name, add(branch, depName, update));
  }
  return found;
}

/** A branch name as the dashboard marks it, of the characters a branch name here has. */
const BRANCH = "([\\w./@+-]+)";

/**
 * The branches the dashboard lists under "Pending Status Checks", and those
 * it lists with a pull request already (`rebase-branch`), which are
 * proposed and so left out.
 */
export function dashboard(body: string): { pending: string[]; open: string[] } {
  const marked = (text: string, mark: string) =>
    [...text.matchAll(new RegExp(`<!-- ${mark}=${BRANCH} -->`, "g"))].map((match) => match[1]!);
  const section = /^## Pending Status Checks\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body);
  return {
    pending: section === null ? [] : marked(section[1]!, "unpend-branch"),
    open: marked(body, "rebase-branch"),
  };
}

/** A time, to the minute, in UTC. */
function when(time: number): string {
  return `${new Date(time).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** A span of time, in days and hours. */
function span(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "in under an hour";
  const days = Math.floor(hours / 24);
  return `in ${days > 0 ? `${days} d ` : ""}${hours % 24} h`;
}

/** One row of the table, and where it sorts. */
type Row = { order: number; cells: string[] };

const NEXT_RUN = "past its age: on Renovate's next run";

/** The row of one branch: in the report, the dashboard, or both. */
function row(name: string, branch: Branch | undefined, age: number, now: number): Row {
  const updates = branch === undefined ? "—" : branch.updates.join("<br>");
  const released = branch?.released === undefined ? "—" : when(branch.released);
  const cells = (earliest: string, status: string) => [
    updates,
    code(name),
    released,
    earliest,
    status,
  ];
  if (branch === undefined) {
    return { order: Number.MAX_SAFE_INTEGER, cells: cells("—", "not found by this run") };
  }
  if (!branch.pending) return { order: 0, cells: cells("—", NEXT_RUN) };
  if (branch.undated) {
    return {
      order: Number.MAX_SAFE_INTEGER - 2,
      cells: cells("—", "no release date: waits until Renovate finds one"),
    };
  }
  if (branch.digest) {
    return {
      order: Number.MAX_SAFE_INTEGER - 1,
      cells: cells("unknown", "a digest update: its date is not in the report"),
    };
  }
  const earliest = branch.released! + age;
  return {
    order: earliest,
    cells: cells(when(earliest), earliest <= now ? NEXT_RUN : span(earliest - now)),
  };
}

/** The comment: what waits, and until when, as of `now`. */
export function comment(options: {
  branches: Map<string, Branch>;
  dashboard: { pending: string[]; open: string[] };
  age: number;
  ageText: string;
  now: number;
  runUrl?: string;
}): string {
  const { age, now } = options;
  const names = new Set([
    ...[...options.branches.values()].filter((branch) => branch.pending).map(({ name }) => name),
    ...options.dashboard.pending,
  ]);
  const rows = [...names]
    .filter((name) => !options.dashboard.open.includes(name))
    .map((name) => ({ name, ...row(name, options.branches.get(name), age, now) }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const run =
    options.runUrl === undefined
      ? "a read-only Renovate run"
      : `a [read-only Renovate run](${options.runUrl})`;
  const lines = [
    MARKER,
    "## When the pending updates will be proposed",
    "",
    `Renovate proposes an update once its version has been public for ${options.ageText} (\`minimumReleaseAge\` in renovate.json5, [GOVERNANCE.md](../blob/main/GOVERNANCE.md#dependency-updates)). Estimated by ${run} at ${when(now)}: the Renovate app proposes each update on its first run after the earliest time.`,
    "",
  ];
  if (rows.length === 0)
    return [...lines, "No update is waiting for its release age.", ""].join("\n");
  return [
    ...lines,
    "| Update | Branch | Released | Earliest | When |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(({ cells }) => `| ${cells.join(" | ")} |`),
    "",
  ].join("\n");
}

/** What the script reads and writes. */
export interface PendingIo {
  now(): number;
  /** renovate.json5's text. */
  config(): string;
  read(path: string): string;
  /** A call to the repository's REST API, its JSON answer. */
  github(method: "GET" | "POST" | "PATCH", path: string, body?: { body: string }): Promise<unknown>;
  runUrl?: string;
  log(message: string): void;
}

type Issue = { number: number; title: string; body: string | null; user: { login: string } };
type Comment = { id: number; body: string; user: { login: string } };

/** Every page of a list, 100 at a time. */
async function all<T>(io: PendingIo, path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const found = (await io.github(
      "GET",
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    )) as T[];
    items.push(...found);
    if (found.length < 100) return items;
  }
}

/** Exit code: 0 once the comment is up to date, 1 when it can't be, 2 on a wrong call. */
export async function main(argv: readonly string[], io: PendingIo): Promise<number> {
  // `node -e` puts the node binary first and drops the `--`.
  const args = argv.slice(1);
  if (args.length !== 1) {
    io.log("Name Renovate's report, once.\nUsage: npm run pending:updates -- <report.json>");
    return 2;
  }
  const config = io.config();
  const age = minimumReleaseAge(config);
  const ageText = /^ {4}minimumReleaseAge: '([^']+)',$/m.exec(config)![1]!;
  const report = JSON.parse(io.read(args[0]!)) as Report;
  const issues = await all<Issue>(io, `issues?state=open&creator=${encodeURIComponent(RENOVATE)}`);
  const issue = issues.find(({ title, user }) => title === DASHBOARD && user.login === RENOVATE);
  if (issue === undefined) {
    io.log(`No open "${DASHBOARD}" issue of ${RENOVATE}: nothing to comment on.`);
    return 1;
  }
  const body = comment({
    branches: branches(report),
    dashboard: dashboard(issue.body ?? ""),
    age,
    ageText,
    now: io.now(),
    ...(io.runUrl === undefined ? {} : { runUrl: io.runUrl }),
  });
  const comments = await all<Comment>(io, `issues/${issue.number}/comments`);
  const own = comments.find(({ body, user }) => user.login === ACTIONS && body.startsWith(MARKER));
  if (own === undefined) {
    await io.github("POST", `issues/${issue.number}/comments`, { body });
    io.log(`Commented on #${issue.number}.`);
  } else {
    await io.github("PATCH", `issues/comments/${own.id}`, { body });
    io.log(`Updated comment ${own.id} on #${issue.number}.`);
  }
  return 0;
}

export type PendingEnv = Partial<
  Record<
    "GITHUB_REPOSITORY" | "GITHUB_API_URL" | "GITHUB_SERVER_URL" | "GITHUB_RUN_ID" | "GH_TOKEN",
    string
  >
>;

/** The io of the repository at `root`, in a run with environment `env`. */
export function defaultIo(
  root: string,
  env: PendingEnv,
  fetch: typeof globalThis.fetch,
): PendingIo {
  const runUrl =
    env.GITHUB_SERVER_URL !== undefined && env.GITHUB_RUN_ID !== undefined
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : undefined;
  return {
    now: () => Date.now(),
    config: () => readFileSync(join(root, "renovate.json5"), "utf8"),
    read: (path) => readFileSync(path, "utf8"),
    github: async (method, path, body) => {
      const url = new URL(
        `repos/${env.GITHUB_REPOSITORY}/${path}`,
        `${env.GITHUB_API_URL ?? "https://api.github.com"}/`,
      );
      const response = await fetch(url, {
        method,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${env.GH_TOKEN}`,
          "x-github-api-version": "2022-11-28",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error(`GitHub answered ${response.status} to ${method} ${url}.`);
      return response.json();
    },
    ...(runUrl === undefined ? {} : { runUrl }),
    log: (message) => console.log(message),
  };
}

/** The script entry: `node -e "import('./scripts/pendingUpdates.ts').then((m) => m.run(process))" -- <report.json>`. */
export async function run(process: {
  argv: readonly string[];
  env: PendingEnv;
  exitCode?: number | string | null | undefined;
}): Promise<void> {
  process.exitCode = await main(
    process.argv,
    defaultIo(resolve(import.meta.dirname, ".."), process.env, globalThis.fetch),
  );
}
