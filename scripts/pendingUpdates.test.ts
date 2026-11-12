// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  branches,
  comment,
  dashboard,
  defaultIo,
  MARKER,
  main,
  minimumReleaseAge,
  type PendingIo,
  type Report,
  run,
} from "./pendingUpdates.ts";

/**
 * The comment on the Dependency Dashboard says when each update still
 * waiting for its release age will be proposed: from the release dates in
 * Renovate's report and the wait in renovate.json5. It is written once and
 * then edited, and only the workflow's own comment is ever edited.
 */

const ROOT = join(import.meta.dirname, "..");
const DAY = 86_400_000;
const NOW = Date.parse("2026-11-12T12:00:00Z");

/** renovate.json5 as far as the wait goes. */
const CONFIG = [
  "{",
  "    minimumReleaseAge: '3 days',",
  "    vulnerabilityAlerts: {",
  "        minimumReleaseAge: null,",
  "    },",
  "}",
].join("\n");

/** A report of one repository, its deps' updates in one npm file and one Dockerfile. */
function report(
  npm: { depName?: string; updates?: Record<string, unknown>[] }[],
  dockerfile: { depName?: string; updates?: Record<string, unknown>[] }[] = [],
): Report {
  return {
    repositories: {
      local: { packageFiles: { npm: [{ deps: npm }], dockerfile: [{ deps: dockerfile }] } },
    },
  };
}

const TURBO = {
  depName: "turbo",
  updates: [
    {
      branchName: "renovate/turbo-monorepo",
      updateType: "patch",
      newValue: "^2.11.11",
      pendingChecks: true,
      releaseTimestamp: "2026-11-11T18:30:00.000Z",
    },
  ],
};

describe("minimumReleaseAge", () => {
  it("reads the repository's own wait", () => {
    expect(minimumReleaseAge(readFileSync(join(ROOT, "renovate.json5"), "utf8"))).toBe(3 * DAY);
  });

  it.each([
    ["1 minute", 60_000],
    ["2 hours", 7_200_000],
    ["3 days", 3 * DAY],
    ["1 week", 7 * DAY],
  ])("reads %s", (age, ms) => {
    expect(minimumReleaseAge(`    minimumReleaseAge: '${age}',`)).toBe(ms);
  });

  it("refuses a wait it can't read", () => {
    expect(() => minimumReleaseAge("    minimumReleaseAge: '3d',")).toThrow(
      "not a number of minutes, hours, days or weeks: minimumReleaseAge: '3d',",
    );
  });

  it("refuses to estimate when a rule sets another wait, or none is set", () => {
    const rule = `${CONFIG}\n            minimumReleaseAge: '7 days',`;
    expect(() => minimumReleaseAge(rule)).toThrow("other than once at its top");
    expect(() => minimumReleaseAge("{}")).toThrow("other than once at its top");
  });
});

describe("branches", () => {
  it("gathers each branch's updates, once each, and its newest release date", () => {
    const found = branches(
      report(
        [
          TURBO,
          {
            depName: "vite",
            updates: [
              {
                branchName: "renovate/turbo-monorepo",
                newValue: "^8.3.8",
                releaseTimestamp: "2026-11-11T20:00:00.000Z",
              },
            ],
          },
          TURBO,
        ],
        [
          {
            depName: "caddy",
            updates: [
              {
                branchName: "renovate/caddy-2.11.9",
                updateType: "digest",
                newDigest: "sha256:e40b94d0a43b",
                pendingChecks: true,
              },
            ],
          },
          {
            depName: "node",
            updates: [
              { branchName: "renovate/node-24.x", newValue: "24.22.3", pendingChecks: true },
            ],
          },
          { depName: "nothing" },
        ],
      ),
    );
    expect([...found.values()]).toEqual([
      {
        name: "renovate/turbo-monorepo",
        updates: ["`turbo` → `^2.11.11`", "`vite` → `^8.3.8`"],
        pending: true,
        released: Date.parse("2026-11-11T20:00:00.000Z"),
        undated: false,
        digest: false,
      },
      {
        name: "renovate/caddy-2.11.9",
        updates: ["`caddy` → `digest e40b94d`"],
        pending: true,
        undated: false,
        digest: true,
      },
      {
        name: "renovate/node-24.x",
        updates: ["`node` → `24.22.3`"],
        pending: true,
        undated: true,
        digest: false,
      },
    ]);
  });

  it("leaves out an update with no branch, and survives missing names", () => {
    const found = branches({
      repositories: {
        local: {},
        other: {
          packageFiles: {
            regex: [
              {
                deps: [
                  { updates: [{ updateType: "digest", branchName: "renovate/a" }] },
                  { updates: [{ branchName: "renovate/b" }, { newValue: "1.0.0" }] },
                ],
              },
            ],
          },
        },
      },
    });
    expect([...found.values()].map(({ name, updates }) => ({ name, updates }))).toEqual([
      { name: "renovate/a", updates: ["`` → `digest `"] },
      { name: "renovate/b", updates: ["`` → ``"] },
    ]);
  });

  it("keeps a name's backticks and pipes out of the table", () => {
    const found = branches(
      report([{ depName: "a`b|c", updates: [{ branchName: "renovate/x", newValue: "1\n2" }] }]),
    );
    expect(found.get("renovate/x")!.updates).toEqual(["`abc` → `12`"]);
  });
});

describe("dashboard", () => {
  const body = [
    "## Awaiting Schedule",
    "",
    " - [ ] <!-- unschedule-branch=renovate/lock-file-maintenance -->lock file maintenance",
    "",
    "## Pending Status Checks",
    "",
    " - [ ] <!-- unpend-branch=renovate/turbo-monorepo -->update turbo",
    " - [ ] <!-- unpend-branch=renovate/caddy-2.11.9 -->update caddy",
    " - [ ] <!-- unpend-branch=renovate/<b>bold</b> -->not a branch name",
    "",
    "## Open",
    "",
    " - [ ] <!-- rebase-branch=renovate/cspell-monorepo -->[update cspell](../pull/689)",
    " - [ ] <!-- unpend-branch=renovate/elsewhere -->not pending",
  ].join("\n");

  it("lists the pending branches, and those with a pull request", () => {
    expect(dashboard(body)).toEqual({
      pending: ["renovate/turbo-monorepo", "renovate/caddy-2.11.9"],
      open: ["renovate/cspell-monorepo"],
    });
  });

  it("reads the pending section to the end of a dashboard that ends with it", () => {
    expect(dashboard("## Pending Status Checks\n<!-- unpend-branch=renovate/a -->")).toEqual({
      pending: ["renovate/a"],
      open: [],
    });
  });

  it("lists nothing pending on a dashboard without the section", () => {
    expect(dashboard("## Open\n")).toEqual({ pending: [], open: [] });
  });
});

describe("comment", () => {
  const options = {
    dashboard: { pending: [], open: [] },
    age: 3 * DAY,
    ageText: "3 days",
    now: NOW,
  };

  it("says so when nothing waits", () => {
    expect(comment({ ...options, branches: branches(report([])) })).toBe(
      [
        MARKER,
        "## When the pending updates will be proposed",
        "",
        "Renovate proposes an update once its version has been public for 3 days (`minimumReleaseAge` in renovate.json5, [GOVERNANCE.md](../blob/main/GOVERNANCE.md#dependency-updates)). Estimated by a read-only Renovate run at 2026-11-12 12:00 UTC: the Renovate app proposes each update on its first run after the earliest time.",
        "",
        "No update is waiting for its release age.",
        "",
      ].join("\n"),
    );
  });

  it("gives each waiting branch its earliest time, soonest first, then those it can't date", () => {
    const update = (depName: string, fields: Record<string, unknown>) => ({
      depName,
      updates: [
        { branchName: `renovate/${depName}`, newValue: "2.0.0", pendingChecks: true, ...fields },
      ],
    });
    const text = comment({
      ...options,
      runUrl: "https://github.com/solid-memo/website/actions/runs/7",
      dashboard: {
        pending: ["renovate/past", "renovate/gone", "renovate/open", "renovate/a", "renovate/idle"],
        open: ["renovate/open"],
      },
      branches: branches(
        report([
          update("a", { releaseTimestamp: "2026-11-11T18:30:00.000Z" }),
          update("b", { releaseTimestamp: "2026-11-12T11:30:00.000Z" }),
          update("c", { releaseTimestamp: "2026-11-09T12:30:00.000Z" }),
          update("d", { releaseTimestamp: "2026-11-09T11:00:00.000Z" }),
          update("undated", {}),
          update("digest", { updateType: "digest", newDigest: "abcdef0123" }),
          update("past", { pendingChecks: false, releaseTimestamp: "2026-11-01T00:00:00.000Z" }),
          update("open", { releaseTimestamp: "2026-11-11T00:00:00.000Z" }),
          update("idle", { pendingChecks: false }),
        ]),
      ),
    });
    expect(text).toContain(
      "Estimated by a [read-only Renovate run](https://github.com/solid-memo/website/actions/runs/7) at",
    );
    expect(text.split("\n").slice(5)).toEqual([
      "| Update | Branch | Released | Earliest | When |",
      "| --- | --- | --- | --- | --- |",
      "| `idle` → `2.0.0` | `renovate/idle` | — | — | past its age: on Renovate's next run |",
      "| `past` → `2.0.0` | `renovate/past` | 2026-11-01 00:00 UTC | — | past its age: on Renovate's next run |",
      "| `d` → `2.0.0` | `renovate/d` | 2026-11-09 11:00 UTC | 2026-11-12 11:00 UTC | past its age: on Renovate's next run |",
      "| `c` → `2.0.0` | `renovate/c` | 2026-11-09 12:30 UTC | 2026-11-12 12:30 UTC | in under an hour |",
      "| `a` → `2.0.0` | `renovate/a` | 2026-11-11 18:30 UTC | 2026-11-14 18:30 UTC | in 2 d 6 h |",
      "| `b` → `2.0.0` | `renovate/b` | 2026-11-12 11:30 UTC | 2026-11-15 11:30 UTC | in 2 d 23 h |",
      "| `undated` → `2.0.0` | `renovate/undated` | — | — | no release date: waits until Renovate finds one |",
      "| `digest` → `digest abcdef0` | `renovate/digest` | — | unknown | a digest update: its date is not in the report |",
      "| — | `renovate/gone` | — | — | not found by this run |",
      "",
    ]);
  });

  it("gives hours alone under a day", () => {
    const text = comment({
      ...options,
      branches: branches(
        report([
          {
            ...TURBO,
            updates: [{ ...TURBO.updates[0], releaseTimestamp: "2026-11-10T00:00:00.000Z" }],
          },
        ]),
      ),
    });
    expect(text).toContain("| 2026-11-13 00:00 UTC | in 12 h |");
  });
});

/** An io whose GitHub holds `issues` and `comments`, and records each write. */
function fakeIo(
  options: { issues?: unknown[]; comments?: unknown[]; report?: Report; runUrl?: string } = {},
) {
  const writes: { method: string; path: string; body: string }[] = [];
  const logs: string[] = [];
  const gets: string[] = [];
  const io: PendingIo = {
    now: () => NOW,
    config: () => CONFIG,
    read: () => JSON.stringify(options.report ?? report([TURBO])),
    github: async (method, path, body) => {
      if (method !== "GET") {
        writes.push({ method, path, body: body!.body });
        return {};
      }
      gets.push(path);
      if (path.startsWith("issues?")) return options.issues ?? [];
      const page = Number(/&page=(\d+)/.exec(path)![1]);
      return (options.comments ?? []).slice((page - 1) * 100, page * 100);
    },
    log: (message) => logs.push(message),
    ...(options.runUrl === undefined ? {} : { runUrl: options.runUrl }),
  };
  return { io, writes, logs, gets };
}

const DASHBOARD = {
  number: 1,
  title: "Dependency Dashboard",
  body: "## Pending Status Checks\n<!-- unpend-branch=renovate/turbo-monorepo -->",
  user: { login: "renovate[bot]" },
};

describe("main", () => {
  it("names the report once", async () => {
    const { io, logs } = fakeIo();
    expect(await main(["node"], io)).toBe(2);
    expect(logs[0]).toContain("Usage: npm run pending:updates -- <report.json>");
  });

  it("fails without an open dashboard of Renovate's", async () => {
    const { io, logs, gets } = fakeIo({
      issues: [
        { ...DASHBOARD, user: { login: "someone" } },
        { ...DASHBOARD, title: "Other" },
      ],
    });
    expect(await main(["node", "report.json"], io)).toBe(1);
    expect(gets[0]).toBe("issues?state=open&creator=renovate%5Bbot%5D&per_page=100&page=1");
    expect(logs).toEqual([
      'No open "Dependency Dashboard" issue of renovate[bot]: nothing to comment on.',
    ]);
  });

  it("comments on the dashboard once", async () => {
    const { io, writes, logs } = fakeIo({
      issues: [DASHBOARD],
      runUrl: "https://github.com/solid-memo/website/actions/runs/7",
      comments: [
        { id: 3, body: `${MARKER}\nsomeone else's`, user: { login: "someone" } },
        { id: 4, body: "hello", user: { login: "github-actions[bot]" } },
      ],
    });
    expect(await main(["node", "report.json"], io)).toBe(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.method).toBe("POST");
    expect(writes[0]!.path).toBe("issues/1/comments");
    expect(writes[0]!.body).toContain("| `turbo` → `^2.11.11` | `renovate/turbo-monorepo` |");
    expect(writes[0]!.body).toContain("actions/runs/7");
    expect(logs).toEqual(["Commented on #1."]);
  });

  it("edits its own comment, found on a later page", async () => {
    const others = Array.from({ length: 100 }, (_, id) => ({ id, body: "", user: { login: "x" } }));
    const { io, writes, logs } = fakeIo({
      issues: [{ ...DASHBOARD, body: null }],
      comments: [
        ...others,
        { id: 200, body: `${MARKER}\nold`, user: { login: "github-actions[bot]" } },
      ],
    });
    expect(await main(["node", "report.json"], io)).toBe(0);
    expect(writes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PATCH issues/comments/200",
    ]);
    expect(logs).toEqual(["Updated comment 200 on #1."]);
  });
});

describe("defaultIo", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true });
    dir = undefined;
  });

  const env = {
    GITHUB_REPOSITORY: "solid-memo/website",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_RUN_ID: "7",
    GH_TOKEN: "token",
  };

  it("reads the repository's wait, a file, the clock and the run's address", () => {
    dir = mkdtempSync(join(tmpdir(), "pending-"));
    writeFileSync(join(dir, "renovate.json5"), CONFIG);
    writeFileSync(join(dir, "report.json"), "{}");
    const io = defaultIo(dir, env, fetch);
    expect(io.config()).toBe(CONFIG);
    expect(io.read(join(dir, "report.json"))).toBe("{}");
    expect(io.now()).toBeGreaterThan(NOW);
    expect(io.runUrl).toBe("https://github.com/solid-memo/website/actions/runs/7");
    expect(defaultIo(dir, {}, fetch).runUrl).toBeUndefined();
  });

  it("calls the repository's REST API with the token", async () => {
    const calls: [URL, RequestInit][] = [];
    const fake = (async (url: URL, init: RequestInit) => {
      calls.push([url, init]);
      return new Response("[1]", { status: 200 });
    }) as unknown as typeof fetch;
    const io = defaultIo(ROOT, { ...env, GITHUB_API_URL: "https://api.example" }, fake);
    expect(await io.github("GET", "issues?state=open")).toEqual([1]);
    await io.github("PATCH", "issues/comments/4", { body: "text" });
    expect(String(calls[0]![0])).toBe(
      "https://api.example/repos/solid-memo/website/issues?state=open",
    );
    expect(calls[0]![1]).toEqual({
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: "Bearer token",
        "x-github-api-version": "2022-11-28",
      },
    });
    expect(calls[1]![1].body).toBe('{"body":"text"}');
    expect(calls[1]![1].headers).toHaveProperty("content-type", "application/json");
  });

  it("fails on an error from GitHub, at github.com by default", async () => {
    const fake = (async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    await expect(defaultIo(ROOT, env, fake).github("GET", "issues")).rejects.toThrow(
      "GitHub answered 403 to GET https://api.github.com/repos/solid-memo/website/issues.",
    );
  });

  it("logs to the console", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    defaultIo(ROOT, {}, fetch).log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    log.mockRestore();
  });
});

describe("run", () => {
  it("sets the exit code", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process: { argv: string[]; env: Record<string, string>; exitCode?: number } = {
      argv: ["node"],
      env: {},
    };
    await run(process);
    expect(process.exitCode).toBe(2);
    log.mockRestore();
  });
});
