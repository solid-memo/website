// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { defaultIo, fileProblems, main, run } from "./checkActions.ts";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";

const PINNED = `jobs:
  build:
    steps:
      - uses: actions/checkout@${SHA} # v7.0.1
        with:
          persist-credentials: false
      - id: cache
        uses: actions/cache/restore@${SHA} # v6.1.0
      - uses: "fsfe/reuse-action@${SHA}" # v6.0.0
      - uses: ./.github/actions/chromium
      # - uses: actions/checkout@v7, a comment, is not read.
      - run: echo "uses: actions/checkout@v7"
`;

describe("fileProblems", () => {
  it("accepts actions pinned to a commit with their version, and local ones", () => {
    expect(fileProblems("ci.yml", PINNED)).toEqual([]);
  });

  it("refuses an action referenced by a tag or a branch, or by a short SHA", () => {
    const yaml = `steps:
  - uses: actions/checkout@v7
  - uses: 'lycheeverse/lychee-action@main' # v2.9.0
  - uses: actions/cache/save@3d3c42e # v6.1.0
  - uses: actions/setup-node
`;
    expect(fileProblems("ci.yml", yaml)).toEqual([
      "ci.yml:2: actions/checkout@v7 is not pinned to a full commit SHA (owner/repo@<sha> # vX.Y.Z).",
      "ci.yml:3: lycheeverse/lychee-action@main is not pinned to a full commit SHA (owner/repo@<sha> # vX.Y.Z).",
      "ci.yml:4: actions/cache/save@3d3c42e is not pinned to a full commit SHA (owner/repo@<sha> # vX.Y.Z).",
      "ci.yml:5: actions/setup-node is not pinned to a full commit SHA (owner/repo@<sha> # vX.Y.Z).",
    ]);
  });

  it("refuses a pinned action that names no version", () => {
    const yaml = `      - uses: actions/checkout@${SHA}\n      - uses: actions/attest@${SHA} # latest\n`;
    expect(fileProblems("release.yml", yaml)).toEqual([
      `release.yml:1: actions/checkout@${SHA} names no version after it (# vX.Y.Z), which Renovate updates.`,
      `release.yml:2: actions/attest@${SHA} names no version after it (# vX.Y.Z), which Renovate updates.`,
    ]);
  });
});

describe("main", () => {
  function fakeIo(files: Record<string, string>) {
    const logs: string[] = [];
    return {
      logs,
      files: () => Object.keys(files),
      read: (path: string) => files[path]!,
      log: (message: string) => logs.push(message),
    };
  }

  it("says so and returns 0 when every action is pinned", () => {
    const io = fakeIo({ ".github/workflows/ci.yml": PINNED });
    expect(main(io)).toBe(0);
    expect(io.logs).toEqual(["All 1 workflows and actions pin every action they use to a commit."]);
  });

  it("logs each problem and returns 1", () => {
    const io = fakeIo({
      ".github/workflows/ci.yml": PINNED,
      ".github/actions/chromium/action.yml": "    - uses: actions/cache@v6\n",
    });
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual([
      ".github/actions/chromium/action.yml:1: actions/cache@v6 is not pinned to a full commit SHA (owner/repo@<sha> # vX.Y.Z).",
    ]);
  });
});

describe("the repository's workflows", () => {
  it("pin every action they use to a commit", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process = { exitCode: undefined as number | string | null | undefined };
    run(process);
    expect(process.exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^All \d+ workflows and actions pin/));
    log.mockRestore();
  });

  it("are read from .github/workflows and .github/actions, and nothing else", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    const files = io.files();
    expect(files).toContain(".github/workflows/release.yml");
    expect(files).toContain(".github/actions/chromium/action.yml");
    expect(files.every((file) => /^\.github\/(workflows|actions)\/.+\.ya?ml$/.test(file))).toBe(
      true,
    );
    expect(io.read(".github/workflows/release.yml")).toContain("uses:");
  });
});
