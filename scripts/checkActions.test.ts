// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { defaultIo, downloadProblems, fileProblems, main, run } from "./checkActions.ts";

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
      - run: npm ci --ignore-scripts
        # Run it after npm ci, a comment, is not read.
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

  it("refuses an npm ci that runs the packages' install scripts", () => {
    const yaml = `      - run: npm ci\n      - run: npm ci --prefer-offline # --ignore-scripts\n`;
    expect(fileProblems("deploy.yml", yaml)).toEqual([
      "deploy.yml:1: npm ci without --ignore-scripts runs the packages' install scripts.",
      "deploy.yml:2: npm ci without --ignore-scripts runs the packages' install scripts.",
    ]);
  });

  it("refuses a flag that turns install scripts back on", () => {
    const yaml = [
      "      - run: npm ci --ignore-scripts=false",
      "      - run: npm ci --ignore-scripts false",
      "      - run: npm ci --ignore-scripts --no-ignore-scripts",
      "      - run: npm ci --ignore-scripts-x",
      "      - run: npm ci --ignore-scripts=true && npm run build",
    ].join("\n");
    expect(fileProblems("deploy.yml", yaml)).toEqual([
      "deploy.yml:1: npm ci without --ignore-scripts runs the packages' install scripts.",
      "deploy.yml:2: npm ci without --ignore-scripts runs the packages' install scripts.",
      "deploy.yml:3: npm ci without --ignore-scripts runs the packages' install scripts.",
      "deploy.yml:4: npm ci without --ignore-scripts runs the packages' install scripts.",
    ]);
  });

  it("refuses npm's other installs without the flag", () => {
    const commands = [
      "install",
      "i",
      "clean-install",
      "ic",
      "install-test",
      "install-ci-test",
      "cit",
      "add",
      "update",
      "up",
      "upgrade",
      "dedupe",
      "ddp",
      "link",
      "rebuild",
    ];
    const yaml = commands
      .flatMap((command) => [
        `      - run: npm ${command} x`,
        `      - run: npm ${command} --ignore-scripts`,
      ])
      .join("\n");
    expect(fileProblems("ci.yml", yaml)).toEqual(
      commands.map(
        (command, index) =>
          `ci.yml:${2 * index + 1}: npm ${command} without --ignore-scripts runs the packages' install scripts.`,
      ),
    );
  });

  it("reads past npm's own options before the command", () => {
    const yaml = [
      "      - run: npm -w x install",
      "      - run: npm --prefix . ci",
      "      - run: npm --silent ci",
      "      - run: npm --prefix=. ci",
      "      - run: npm --prefix . ci --ignore-scripts",
      "      - run: npm --prefix . run ci",
    ].join("\n");
    expect(fileProblems("deploy.yml", yaml)).toEqual([
      "deploy.yml:1: npm install without --ignore-scripts runs the packages' install scripts.",
      "deploy.yml:2: npm ci without --ignore-scripts runs the packages' install scripts.",
      "deploy.yml:3: npm ci without --ignore-scripts runs the packages' install scripts.",
      "deploy.yml:4: npm ci without --ignore-scripts runs the packages' install scripts.",
    ]);
  });

  it("refuses npm_config_ignore_scripts set to anything but true", () => {
    const yaml = `    env:
      npm_config_ignore_scripts: false
      NPM_CONFIG_IGNORE_SCRIPTS: "true"
      - run: npm_config_ignore_scripts= npm run build
      # npm_config_ignore_scripts: false, a comment, is not read.
`;
    expect(fileProblems("deploy.yml", yaml)).toEqual([
      "deploy.yml:2: npm_config_ignore_scripts other than true runs the packages' install scripts.",
      "deploy.yml:4: npm_config_ignore_scripts other than true runs the packages' install scripts.",
    ]);
  });
});

const HASH = "211847305611417ac0b76af5169086232ea6c75ff6ae686227b6972a41599dd7";

const DOWNLOAD = `      env:
        # renovate: datasource=github-release-attachments depName=owner/tool
        TOOL_VERSION: v1.2.3
        TOOL_SHA256: ${HASH}
      run: |
        curl -fsSLO "https://github.com/owner/tool/releases/download/$TOOL_VERSION/tool.tar.gz"
        echo "$TOOL_SHA256  tool.tar.gz" | sha256sum -c -
`;

describe("downloadProblems", () => {
  it("accepts a download with its version and the SHA-256 the workflow checks", () => {
    expect(downloadProblems("action.yml", DOWNLOAD)).toEqual([]);
    expect(downloadProblems("ci.yml", PINNED)).toEqual([]);
  });

  it("refuses a download that names no SHA-256, or not after its version", () => {
    const yaml = `        # renovate: datasource=github-releases depName=owner/tool
        TOOL_VERSION: v1.2.3
      run: |
        curl -fsSLO "$base/checksums.txt"
        # renovate: datasource=github-release-attachments depName=owner/other
        OTHER_SHA256: ${HASH}
        OTHER_VERSION: v1.0.0
        # renovate: datasource=github-release-attachments depName=owner/short
        SHORT_VERSION: v1.0.0
        SHORT_SHA256: 2118473056
        # renovate: datasource=github-release-attachments depName=owner/end
        # renovate: datasource=github-release-attachments depName=owner/last
        LAST_VERSION: v1.0.0`;
    const why =
      "names no version and SHA-256 after it (<NAME>_VERSION: and <NAME>_SHA256: on the next lines), which the workflow checks the download against.";
    expect(downloadProblems("action.yml", yaml)).toEqual([
      `action.yml:1: owner/tool ${why}`,
      `action.yml:5: owner/other ${why}`,
      `action.yml:8: owner/short ${why}`,
      `action.yml:11: owner/end ${why}`,
      `action.yml:12: owner/last ${why}`,
    ]);
    expect(
      downloadProblems("action.yml", "# renovate: datasource=github-releases depName=owner/tool"),
    ).toEqual([`action.yml:1: owner/tool ${why}`]);
  });

  it("refuses a SHA-256 that nothing checks the download against", () => {
    const yaml = DOWNLOAD.replace("$TOOL_SHA256", "$(grep tool.tar.gz checksums.txt)");
    expect(downloadProblems("action.yml", yaml)).toEqual([
      "action.yml:2: owner/tool: nothing checks the download against TOOL_SHA256.",
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
    expect(io.logs).toEqual([
      "All 1 workflows and actions pin every action they use to a commit and every tool they download to its hash, and install no package's script.",
    ]);
  });

  it("logs each problem and returns 1", () => {
    const io = fakeIo({
      ".github/workflows/ci.yml": PINNED,
      ".github/actions/chromium/action.yml": "    - uses: actions/cache@v6\n",
      ".github/actions/tool/action.yml": DOWNLOAD.replace(/TOOL_SHA256: \w+/, "TOOL_SHA256: none"),
    });
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual([
      ".github/actions/chromium/action.yml:1: actions/cache@v6 is not pinned to a full commit SHA (owner/repo@<sha> # vX.Y.Z).",
      ".github/actions/tool/action.yml:2: owner/tool names no version and SHA-256 after it (<NAME>_VERSION: and <NAME>_SHA256: on the next lines), which the workflow checks the download against.",
    ]);
  });
});

describe("the repository's workflows", () => {
  it("pin every action they use to a commit, and every tool they download to its hash", () => {
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
    expect(io.read(".github/actions/publiccode/action.yml")).toMatch(/_SHA256: [0-9a-f]{64}\n/);
  });
});
