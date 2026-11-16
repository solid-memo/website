// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  defaultIo,
  type ExchangeIo,
  main,
  releasesToExchange,
  run,
  RUNNER,
} from "./exchangePods.ts";

describe("releasesToExchange", () => {
  it("takes the earliest release, then the earliest of each major version after it", () => {
    expect(
      releasesToExchange(["v9.0.1", "v7.10.0", "v8.1.0", "v7.9.2", "v9.0.0", "v8.0.3", "v7.9.10"]),
    ).toEqual(["v7.9.2", "v8.0.3", "v9.0.0"]);
  });

  it("takes none of no releases, and counts a tag that is no release for nothing", () => {
    expect(releasesToExchange([])).toEqual([]);
    expect(releasesToExchange(["latest", "v1.2", "v1.2.3-rc.1", "1.2.3", "v2.0.0"])).toEqual([
      "v2.0.0",
    ]);
  });
});

/** An io that records what is asked of it, over releases that have the runner or not. */
function fakeIo(releases: Record<string, boolean>, fail: (call: string) => boolean = () => false) {
  const calls: string[] = [];
  const logged: string[] = [];
  let pods = 0;
  const io: ExchangeIo = {
    tags: () => Object.keys(releases),
    hasRunner: (tag) => releases[tag]!,
    checkout(tag) {
      calls.push(`checkout ${tag}`);
      if (fail(`checkout ${tag}`)) throw new Error("no network");
      return `/work/${tag}`;
    },
    remove: (dir) => void calls.push(`remove ${dir}`),
    podsDir: () => `/pods/${++pods}`,
    step(dir, step, podsDir) {
      const call = `${step} in ${dir ?? "here"} with ${podsDir}`;
      calls.push(call);
      if (fail(call)) throw new Error("exited with 1");
    },
    log: (message) => void logged.push(message),
  };
  return { io, calls, logged };
}

describe("main", () => {
  it("exchanges a pod with this checkout, then with each release chosen, in a checkout removed after", () => {
    const { io, calls, logged } = fakeIo({ "v7.6.9": false, "v7.7.0": true, "v7.8.0": true });
    expect(main(["node"], io)).toBe(0);
    expect(calls).toEqual([
      "write in here with /pods/1",
      "use in here with /pods/1",
      "read in here with /pods/1",
      "checkout v7.7.0",
      "write in /work/v7.7.0 with /pods/2",
      "use in here with /pods/2",
      "read in /work/v7.7.0 with /pods/2",
      "remove /work/v7.7.0",
    ]);
    expect(logged).toEqual([
      "this checkout: a pod it wrote was used here, and it read and saved the pod again.",
      "v7.7.0: a pod it wrote was used here, and it read and saved the pod again.",
    ]);
  });

  it("exchanges with this checkout alone when asked, and says so while no release has the runner", () => {
    const self = fakeIo({ "v7.7.0": true });
    expect(main(["node", "--self"], self.io)).toBe(0);
    expect(self.calls).toHaveLength(3);

    const none = fakeIo({ "v7.6.9": false });
    expect(main(["node"], none.io)).toBe(0);
    expect(none.calls).toHaveLength(3);
    expect(none.logged[1]).toBe(
      `No release has ${RUNNER} yet: the first that does takes part from then on.`,
    );
  });

  it("fails on a step that fails, saying whose it was, and still tries the other releases", () => {
    const { io, calls, logged } = fakeIo(
      { "v7.7.0": true, "v8.0.0": true },
      (call) =>
        call === "read in /work/v7.7.0 with /pods/2" || call.startsWith("use in here with /pods/3"),
    );
    expect(main(["node"], io)).toBe(1);
    expect(logged.slice(1)).toEqual([
      'v7.7.0: the step "read", taken by v7.7.0, failed: exited with 1',
      'v8.0.0: the step "use", taken by this checkout, failed: exited with 1',
    ]);
    // A step after the one that failed is not taken, and each checkout is removed.
    expect(calls).not.toContain("read in /work/v8.0.0 with /pods/3");
    expect(calls.filter((call) => call.startsWith("remove"))).toEqual([
      "remove /work/v7.7.0",
      "remove /work/v8.0.0",
    ]);
  });

  it("fails when this checkout does not exchange with itself, or a release cannot be checked out", () => {
    const self = fakeIo({}, (call) => call.startsWith("write in here"));
    expect(main(["node", "--self"], self.io)).toBe(1);

    const { io, calls, logged } = fakeIo({ "v7.7.0": true }, (call) => call === "checkout v7.7.0");
    expect(main(["node"], io)).toBe(1);
    expect(logged.at(-1)).toBe("v7.7.0: could not be checked out: no network");
    expect(calls.filter((call) => call.startsWith("remove"))).toEqual([]);
  });

  it("says how it is run when given anything else", () => {
    for (const args of [["--base"], ["--self", "--self"]]) {
      const { io, calls, logged } = fakeIo({});
      expect(main(["node", ...args], io)).toBe(1);
      expect(logged).toEqual(["Usage: npm run check:exchange [-- --self]"]);
      expect(calls).toEqual([]);
    }
  });
});

describe("defaultIo", () => {
  /** An exec that records each command, and answers git as a repository with two tags would. */
  function recorded() {
    const commands: {
      file: string;
      args: readonly string[];
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    }[] = [];
    const exec = vi.fn(
      (
        file: string,
        args: readonly string[],
        options: { cwd?: string; env?: NodeJS.ProcessEnv },
      ) => {
        commands.push({ file, args, cwd: options.cwd, env: options.env });
        if (args.includes("tag")) return "v7.7.0\nv7.6.9\n";
        if (args.includes("cat-file") && args.at(-1) === `v7.6.9:${RUNNER}`)
          throw new Error("absent");
        return "";
      },
    );
    return { commands, exec };
  }

  it("lists the tags, and tells which releases have the runner", () => {
    const { commands, exec } = recorded();
    const io = defaultIo("/repo", exec);
    expect(io.tags()).toEqual(["v7.7.0", "v7.6.9"]);
    expect(io.hasRunner("v7.7.0")).toBe(true);
    expect(io.hasRunner("v7.6.9")).toBe(false);
    expect(commands.map(({ file, args }) => [file, ...args].join(" "))).toEqual([
      "git -C /repo tag --list",
      `git -C /repo cat-file -e v7.7.0:${RUNNER}`,
      `git -C /repo cat-file -e v7.6.9:${RUNNER}`,
    ]);
  });

  it("checks a release out in a worktree of its own with its dependencies, and removes it", () => {
    const { commands, exec } = recorded();
    const temp = mkdtempSync(join(tmpdir(), "exchange-test-"));
    const io = defaultIo("/repo", exec, temp);
    const dir = io.checkout("v7.7.0");
    expect(dir.startsWith(join(temp, "pod-exchange-release-"))).toBe(true);
    expect(dir.endsWith("/v7.7.0")).toBe(true);
    expect(existsSync(join(dir, ".."))).toBe(true);
    io.remove(dir);
    expect(existsSync(join(dir, ".."))).toBe(false);
    expect(commands.map(({ file, args, cwd }) => [cwd ?? "", file, ...args].join(" "))).toEqual([
      ` git -C /repo worktree add --detach ${dir} v7.7.0`,
      `${dir} npm ci --ignore-scripts`,
      ` git -C /repo worktree remove --force ${dir}`,
    ]);
  });

  it("takes a step in a checkout, or in the repository, with the step and the pods' folder", () => {
    const { commands, exec } = recorded();
    const temp = mkdtempSync(join(tmpdir(), "exchange-test-"));
    const io = defaultIo("/repo", exec, temp);
    const pods = io.podsDir();
    expect(existsSync(pods)).toBe(true);
    io.step("/work/v7.7.0", "write", pods);
    io.step(null, "use", pods);
    expect(
      commands.map(({ file, args, cwd, env }) =>
        [cwd, file, ...args, env!.POD_EXCHANGE, env!.POD_EXCHANGE_DIR].join(" "),
      ),
    ).toEqual([
      `/work/v7.7.0 npm run exchange -w @solid-memo/solid write ${pods}`,
      `/repo npm run exchange -w @solid-memo/solid use ${pods}`,
    ]);
  });

  it("logs to the console, and the runner it looks for is this repository's", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    defaultIo("/repo").log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    log.mockRestore();
    expect(readFileSync(join(import.meta.dirname, "..", RUNNER), "utf8")).toContain("POD_EXCHANGE");
  });
});

describe("run", () => {
  it("sets the exit code, here for arguments it does not take", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const process: { argv: string[]; exitCode?: number } = { argv: ["node", "--nothing"] };
    run(process);
    expect(process.exitCode).toBe(1);
    log.mockRestore();
  });
});
