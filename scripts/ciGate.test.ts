// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decide,
  defaultIo,
  JOURNEYS_BLOBS,
  type GateIo,
  isRelease,
  main,
  run,
  SITE,
  strayFiles,
  TURBO_CACHE,
} from "./ciGate.ts";

const SHA = "a".repeat(40);
const PARENT = "b".repeat(40);

/** A push to main of an ordinary commit, which no run has passed. */
function fakeIo(overrides: Partial<GateIo> = {}): GateIo & { outputs: string[]; logs: string[] } {
  const outputs: string[] = [];
  const logs: string[] = [];
  return {
    event: "push",
    ref: "refs/heads/main",
    head: () => ({ sha: SHA, subject: "feat(app): something", parents: [PARENT] }),
    changed: () => ["CHANGELOG.md", "package.json"],
    passed: async () => undefined,
    kept: async () => true,
    output: (name, value) => outputs.push(`${name}=${value}`),
    log: (message) => logs.push(message),
    outputs,
    logs,
    ...overrides,
  };
}

describe("isRelease", () => {
  it("takes semantic-release's commits, and nothing else", () => {
    expect(isRelease("chore(release): 4.1.1")).toBe(true);
    expect(isRelease("chore(deps): update zizmor")).toBe(false);
    expect(isRelease("fix(release): chore(release): x")).toBe(false);
  });
});

describe("strayFiles", () => {
  it("names the files a release does not write", () => {
    expect(
      strayFiles([
        "CHANGELOG.md",
        "CITATION.cff",
        "package.json",
        "package-lock.json",
        "publiccode.yml",
      ]),
    ).toEqual([]);
    expect(strayFiles(["package.json", "apps/web/src/main.ts"])).toEqual(["apps/web/src/main.ts"]);
  });
});

/** CI's passed runs, by "<sha>:<event>", and their ids. */
const runs =
  (passed: Record<string, number>) =>
  async (sha: string, event: string): Promise<number | undefined> =>
    passed[`${sha}:${event}`];

describe("decide", () => {
  it("runs every job in a pull request, the merge queue and a run by hand", async () => {
    const passed = vi.fn(async () => 1);
    for (const [event, ref] of [
      ["pull_request", "refs/pull/1/merge"],
      ["merge_group", "refs/heads/gh-readonly-queue/main/pr-1-abc"],
      ["workflow_dispatch", "refs/heads/main"],
      ["push", "refs/heads/other"],
    ] as const) {
      expect((await decide(fakeIo({ event, ref, passed }))).jobs).toBe("all");
    }
    expect(passed).not.toHaveBeenCalled();
  });

  it("reuses the queue run on main when the merge queue passed the commit", async () => {
    const passed = runs({ [`${SHA}:merge_group`]: 9 });
    const kept = vi.fn(async () => true);
    expect(await decide(fakeIo({ passed, kept }))).toEqual({
      jobs: "reuse",
      testedBy: 9,
      why: "aaaaaaaa passed the merge queue in run 9: this run reuses it.",
    });
    expect(kept.mock.calls).toEqual([
      [9, JOURNEYS_BLOBS],
      [9, SITE],
      [9, TURBO_CACHE],
    ]);
  });

  it("runs every job on main when the queue run keeps an artifact no longer", async () => {
    const kept = vi.fn(async (_run: number, prefix: string) => prefix !== SITE);
    const io = fakeIo({ passed: runs({ [`${SHA}:merge_group`]: 9 }), kept });
    expect(await decide(io)).toEqual({
      jobs: "all",
      why: "aaaaaaaa passed the merge queue in run 9, but it keeps no site*, or they expired: every job runs, so nothing is missing.",
    });
  });

  it("names every artifact the queue run keeps no longer", async () => {
    const io = fakeIo({ passed: runs({ [`${SHA}:merge_group`]: 9 }), kept: async () => false });
    expect((await decide(io)).why).toContain(
      "keeps no journeys-blob-*, site*, turbo-cache*, or they expired",
    );
  });

  it("runs every job on main when the commit skipped the merge queue", async () => {
    expect(await decide(fakeIo())).toEqual({
      jobs: "all",
      why: "aaaaaaaa reached main without passing the merge queue: every job runs, as in the queue.",
    });
  });

  describe("on a release commit", () => {
    const release = () => ({ sha: SHA, subject: "chore(release): 4.1.1", parents: [PARENT] });

    it("reuses its parent's queue run when CI passed the parent on main, but not its Turbo cache", async () => {
      const passed = runs({ [`${PARENT}:push`]: 7, [`${PARENT}:merge_group`]: 9 });
      const kept = vi.fn(async () => true);
      expect(await decide(fakeIo({ head: release, passed, kept }))).toEqual({
        jobs: "reuse",
        testedBy: 9,
        why: "A release commit, changing only the version's files, on bbbbbbbb, which CI passed on main; run 9 ran every job on its code: this run reuses it.",
      });
      expect(kept.mock.calls).toEqual([
        [9, JOURNEYS_BLOBS],
        [9, SITE],
      ]);
    });

    it("reuses its parent's push run when the parent skipped the queue", async () => {
      const passed = runs({ [`${PARENT}:push`]: 7 });
      expect(await decide(fakeIo({ head: release, passed }))).toMatchObject({
        jobs: "reuse",
        testedBy: 7,
      });
    });

    it("runs every job when CI has not passed its parent on main", async () => {
      const passed = runs({ [`${PARENT}:merge_group`]: 9 });
      expect((await decide(fakeIo({ head: release, passed }))).jobs).toBe("all");
    });

    it("refuses one that changes a file a release never writes", async () => {
      const io = fakeIo({ head: release, changed: () => ["package.json", "apps/web/x.ts"] });
      await expect(decide(io)).rejects.toThrow(/changes apps\/web\/x\.ts, which a release never/);
    });

    it("refuses a merge", async () => {
      const io = fakeIo({ head: () => ({ ...release(), parents: [PARENT, SHA] }) });
      await expect(decide(io)).rejects.toThrow(/has 2 parents, not one/);
    });
  });
});

describe("main", () => {
  it("writes what runs and says why", async () => {
    const io = fakeIo();
    expect(await main(io)).toBe(0);
    expect(io.outputs).toEqual(["jobs=all"]);
    expect(io.logs).toEqual([expect.stringContaining("without passing the merge queue")]);
  });

  it("writes which run tested the code when the run reuses it", async () => {
    const io = fakeIo({ passed: runs({ [`${SHA}:merge_group`]: 9 }) });
    expect(await main(io)).toBe(0);
    expect(io.outputs).toEqual(["jobs=reuse", "tested-by=9"]);
  });

  it("fails, writing nothing, on a release commit that is not one", async () => {
    const io = fakeIo({
      head: () => ({ sha: SHA, subject: "chore(release): 4.1.1", parents: [] }),
    });
    expect(await main(io)).toBe(1);
    expect(io.outputs).toEqual([]);
    expect(io.logs).toEqual([expect.stringContaining("has 0 parents")]);
  });
});

describe("defaultIo", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "ci-gate-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.org");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    writeFileSync(join(repo, "package.json"), "{}\n");
    git("add", ".");
    git("commit", "-q", "-m", "feat: start");
    writeFileSync(join(repo, "package.json"), '{"version":"1.0.0"}\n');
    writeFileSync(join(repo, "CHANGELOG.md"), "# Changelog\n");
    git("add", ".");
    git("commit", "-q", "-m", "chore(release): 1.0.0", "-m", "The notes.");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("reads the commit checked and the files it changes", () => {
    const io = defaultIo(repo, { GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main" }, fetch);
    const head = io.head();
    expect(io.event).toBe("push");
    expect(io.ref).toBe("refs/heads/main");
    expect(head).toEqual({
      sha: git("rev-parse", "HEAD"),
      subject: "chore(release): 1.0.0",
      parents: [git("rev-parse", "HEAD^")],
    });
    expect(io.changed(head.sha)).toEqual(["CHANGELOG.md", "package.json"]);
  });

  it("reads a root commit's parents as none, and no event as none", () => {
    const io = defaultIo(repo, {}, fetch);
    git("checkout", "-q", "HEAD^");
    expect(io.head().parents).toEqual([]);
    expect(io.event).toBe("");
    expect(io.ref).toBe("");
  });

  it("asks GitHub for a CI run that passed on a commit, and gives its id", async () => {
    const fetch = vi.fn(async () => Response.json({ total_count: 1, workflow_runs: [{ id: 42 }] }));
    const io = defaultIo(
      repo,
      { GITHUB_REPOSITORY: "owner/repo", GITHUB_API_URL: "https://api.example", GH_TOKEN: "t" },
      fetch,
    );
    expect(await io.passed(SHA, "merge_group")).toBe(42);
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(
      `https://api.example/repos/owner/repo/actions/workflows/ci.yml/runs?head_sha=${SHA}&event=merge_group&status=success&per_page=1`,
    );
    expect(init.headers).toMatchObject({ authorization: "Bearer t" });
  });

  it("asks GitHub whether a run keeps its artifacts of a prefix, none expired", async () => {
    const blob = (name: string, expired = false) => ({ name, expired });
    const answers = [
      {
        artifacts: [
          blob("journeys-blob-chromium-1"),
          blob("journeys-blob-engines-2"),
          blob("x", true),
        ],
      },
      { artifacts: [blob("journeys-blob-chromium-1"), blob("journeys-blob-engines-2", true)] },
      { artifacts: [blob("journeys-report")] },
    ];
    const fetch = vi.fn(async () => Response.json(answers.shift()));
    const io = defaultIo(repo, { GITHUB_REPOSITORY: "owner/repo" }, fetch);
    expect(await io.kept(9, "journeys-blob-")).toBe(true);
    expect(await io.kept(9, "journeys-blob-")).toBe(false);
    expect(await io.kept(9, "journeys-blob-")).toBe(false);
    expect(String((fetch.mock.calls[0] as unknown as [URL])[0])).toBe(
      "https://api.github.com/repos/owner/repo/actions/runs/9/artifacts?per_page=100",
    );
  });

  it("finds none passed when GitHub lists none, on github.com by default", async () => {
    const fetch = vi.fn(async () => Response.json({ total_count: 0, workflow_runs: [] }));
    const io = defaultIo(repo, { GITHUB_REPOSITORY: "owner/repo" }, fetch);
    expect(await io.passed(SHA, "push")).toBeUndefined();
    expect(String((fetch.mock.calls[0] as unknown as [URL])[0])).toMatch(
      /^https:\/\/api\.github\.com\/repos\/owner\/repo\//,
    );
  });

  it("fails when GitHub refuses", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 403 }));
    const io = defaultIo(repo, { GITHUB_REPOSITORY: "owner/repo" }, fetch);
    await expect(io.passed(SHA, "push")).rejects.toThrow(/GitHub answered 403/);
  });

  it("writes its outputs to GITHUB_OUTPUT, and nowhere without it", () => {
    const file = join(repo, "output");
    writeFileSync(file, "");
    defaultIo(repo, { GITHUB_OUTPUT: file }, fetch).output("jobs", "all");
    defaultIo(repo, {}, fetch).output("jobs", "deterministic");
    expect(readFileSync(file, "utf8")).toBe("jobs=all\n");
  });

  it("logs to the console", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    defaultIo(repo, {}, fetch).log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    log.mockRestore();
  });
});

describe("run", () => {
  it("sets the exit code from the repository's own gate", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process: { env: Record<string, string>; exitCode?: number } = {
      env: { GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/1/merge" },
    };
    await run(process);
    expect(process.exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith("A pull_request run on refs/pull/1/merge: every job runs.");
    log.mockRestore();
  });
});
