// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED,
  defaultIo,
  dependencyProblems,
  INSTALL_SCRIPTS,
  installProblems,
  isUnready,
  type Lockfile,
  main,
  run,
  shipped,
} from "./checkDependencies.ts";

/** An app that loads a library from the workspace, as apps/web loads its packages. */
const LOCK: Lockfile = {
  packages: {
    "": { name: "root", dependencies: {} },
    "apps/app": {
      name: "@x/app",
      version: "0.0.0",
      dependencies: { "@x/lib": "*", stable: "^2.0.0" },
      // Development tools are not shipped.
      devDependencies: { tool: "^0.1.0" },
    },
    "packages/lib": { name: "@x/lib", version: "0.0.0", dependencies: { young: "^0.3.0" } },
    "node_modules/@x/app": { link: true, resolved: "apps/app" },
    "node_modules/@x/lib": { link: true, resolved: "packages/lib" },
    "node_modules/stable": {
      version: "2.1.0",
      dependencies: { shared: "^1.0.0", nested: "^1.0.0-beta.1" },
      optionalDependencies: { "platform-binary": "^1.0.0", "not-installed": "^1.0.0" },
      peerDependencies: {
        peer: "^1.0.0",
        "optional-peer": "^1.0.0",
        "absent-optional-peer": "^1.0.0",
      },
      peerDependenciesMeta: {
        "optional-peer": { optional: true },
        "absent-optional-peer": { optional: true },
      },
    },
    // A version of its own under stable's folder wins over the hoisted one.
    "node_modules/stable/node_modules/nested": {
      version: "1.0.0-beta.1",
      dependencies: { shared: "^1.0.0" },
    },
    "node_modules/nested": { version: "1.0.0" },
    "node_modules/shared": { version: "1.2.3" },
    "node_modules/young": { version: "0.3.1", dependencies: { shared: "^1.0.0" } },
    "node_modules/platform-binary": { version: "1.0.0" },
    "node_modules/peer": { version: "1.0.0" },
    "node_modules/optional-peer": { version: "1.0.0" },
    "node_modules/tool": { version: "0.1.0" },
  },
};

describe("isUnready", () => {
  it.each([
    ["0.6.5", true],
    ["0.0.4", true],
    ["8.0.0-alpha.3", true],
    ["1.0.0-rc.1", true],
    ["1.0.0", false],
    ["11.0.0", false],
    ["10.0.0", false],
  ])("%s: %s", (version, unready) => {
    expect(isUnready(version)).toBe(unready);
  });
});

describe("shipped", () => {
  it("walks the app's run-time dependencies through the workspace, as node resolves them", () => {
    const { packages, missing } = shipped(LOCK, ["apps/app"]);
    expect(missing).toEqual([]);
    expect(packages.map(({ name, version }) => `${name}@${version}`).sort()).toEqual([
      "nested@1.0.0-beta.1",
      "optional-peer@1.0.0",
      "peer@1.0.0",
      "platform-binary@1.0.0",
      "shared@1.2.3",
      "stable@2.1.0",
      "young@0.3.1",
    ]);
    expect(packages.find((p) => p.name === "young")?.via).toEqual(["@x/app", "@x/lib"]);
    expect(packages.find((p) => p.name === "nested")?.via).toEqual(["@x/app", "stable"]);
  });

  it("names what the lockfile lacks, and the chain that asked for it", () => {
    const lock: Lockfile = {
      packages: {
        "apps/app": { name: "@x/app", dependencies: { gone: "^1.0.0" } },
      },
    };
    expect(shipped(lock, ["apps/app", "apps/none"]).missing).toEqual([
      "gone (@x/app)",
      "apps/none ()",
    ]);
  });
});

describe("dependencyProblems", () => {
  const DOC = "| Zazuko | `young` |";

  it("passes when every unready version is allowed and named in the page", () => {
    expect(
      dependencyProblems(LOCK, ["apps/app"], { young: "why", nested: "why" }, `${DOC} \`nested\``),
    ).toEqual([]);
  });

  it("fails on an unready version that is not allowed", () => {
    expect(dependencyProblems(LOCK, ["apps/app"], { young: "why" }, DOC)).toEqual([
      "nested@1.0.0-beta.1 (@x/app > stable) is not a released version: depend on one, or add it to ALLOWED in scripts/checkDependencies.ts and docs/vendor-code.md.",
    ]);
  });

  it("fails on an allowed package the page does not name, or that is no longer shipped unready", () => {
    expect(
      dependencyProblems(
        LOCK,
        ["apps/app"],
        { young: "why", nested: "why", shared: "why" },
        `${DOC} \`shared\``,
      ),
    ).toEqual([
      "nested: allowed in scripts/checkDependencies.ts, but docs/vendor-code.md does not name it.",
      "shared: allowed in scripts/checkDependencies.ts, but no unready version of it is shipped; take it off.",
    ]);
  });

  it("fails on a dependency the lockfile lacks", () => {
    const lock: Lockfile = {
      packages: { "apps/app": { name: "@x/app", dependencies: { gone: "^1.0.0" } } },
    };
    expect(dependencyProblems(lock, ["apps/app"], {}, "")).toEqual([
      "gone (@x/app): not in package-lock.json; run `npm install`.",
    ]);
  });
});

describe("installProblems", () => {
  const NPMRC = "# No install scripts.\nignore-scripts=true\n";
  const FROM = "https://registry.npmjs.org/a/-/a-1.0.0.tgz";
  const HASH = "sha512-x";
  const DOC = "| `watcher` | why |";
  const CLEAN: Lockfile = {
    packages: {
      "": { name: "root" },
      "apps/app": { name: "@x/app", version: "0.0.0" },
      "node_modules/@x/app": { link: true, resolved: "apps/app" },
      "node_modules/a": { version: "1.0.0", resolved: FROM, integrity: HASH },
      "apps/app/node_modules/b": { name: "b", version: "1.0.0", resolved: FROM, integrity: HASH },
      // A package carried in another's tarball has neither.
      "node_modules/a/node_modules/c": { version: "1.0.0", inBundle: true },
      "node_modules/watcher": {
        version: "2.0.0",
        resolved: FROM,
        integrity: HASH,
        hasInstallScript: true,
      },
    },
  };

  it("passes on registry packages with their hashes, scripts off, and the allowed install scripts", () => {
    expect(installProblems(CLEAN, NPMRC, { watcher: "why" }, DOC)).toEqual([]);
  });

  it("fails when .npmrc leaves install scripts on", () => {
    expect(installProblems(CLEAN, "# ignore-scripts=true\n", { watcher: "why" }, DOC)).toEqual([
      ".npmrc: does not say `ignore-scripts=true`, so `npm ci` runs install scripts.",
    ]);
  });

  it("fails when a later line of .npmrc turns install scripts back on", () => {
    for (const npmrc of [
      "ignore-scripts=true\nignore-scripts=false\n",
      "ignore-scripts=true\n  ignore-scripts = false\n",
    ]) {
      expect(installProblems(CLEAN, npmrc, { watcher: "why" }, DOC)).toEqual([
        ".npmrc: does not say `ignore-scripts=true`, so `npm ci` runs install scripts.",
      ]);
    }
    expect(
      installProblems(
        CLEAN,
        "ignore-scripts=false\nignore-scripts = true\n",
        { watcher: "why" },
        DOC,
      ),
    ).toEqual([]);
  });

  it("fails on a package from elsewhere, without a hash, or with an install script not allowed", () => {
    const lock: Lockfile = {
      packages: {
        ...CLEAN.packages,
        "node_modules/git": {
          version: "1.0.0",
          resolved: "git+ssh://git@github.com/x/git.git#abc",
          integrity: HASH,
        },
        "node_modules/tarball": { version: "1.0.0", resolved: "https://example.org/t.tgz" },
        "node_modules/unhashed": { version: "1.0.0", resolved: FROM },
        "node_modules/hook": {
          name: "hook",
          version: "1.0.0",
          resolved: FROM,
          integrity: HASH,
          hasInstallScript: true,
        },
      },
    };
    expect(installProblems(lock, NPMRC, {}, DOC)).toEqual([
      "node_modules/watcher: has an install script, which does not run: depend on another package, or add it to INSTALL_SCRIPTS in scripts/checkDependencies.ts.",
      "node_modules/git: resolved from git+ssh://git@github.com/x/git.git#abc, not from https://registry.npmjs.org/.",
      "node_modules/tarball: resolved from https://example.org/t.tgz, not from https://registry.npmjs.org/.",
      "node_modules/tarball: no integrity hash.",
      "node_modules/unhashed: no integrity hash.",
      "node_modules/hook: has an install script, which does not run: depend on another package, or add it to INSTALL_SCRIPTS in scripts/checkDependencies.ts.",
    ]);
  });

  it("fails on an allowed install script the page does not name, or no package has", () => {
    expect(installProblems(CLEAN, NPMRC, { watcher: "why", gone: "why" }, "`gone`")).toEqual([
      "watcher: in INSTALL_SCRIPTS in scripts/checkDependencies.ts, but docs/vendor-code.md does not name it.",
      "gone: in INSTALL_SCRIPTS in scripts/checkDependencies.ts, but no package of that name has an install script; take it off.",
    ]);
  });
});

describe("main", () => {
  function fakeIo(allowedInDoc: string, npmrc = "ignore-scripts=true\n") {
    const logs: string[] = [];
    const lock: Lockfile = {
      packages: {
        "apps/web": {
          name: "@solid-memo/web",
          dependencies: Object.fromEntries(Object.keys(ALLOWED).map((name) => [name, "*"])),
        },
        "packages/solid-memo-client": { name: "@solid-memo/solid-memo-client" },
        ...Object.fromEntries(
          Object.keys(ALLOWED).map((name) => [
            `node_modules/${name}`,
            {
              version: "0.1.0",
              resolved: `https://registry.npmjs.org/${name}/-/${name}-0.1.0.tgz`,
              integrity: "sha512-x",
            },
          ]),
        ),
        ...Object.fromEntries(
          Object.keys(INSTALL_SCRIPTS).map((name) => [
            `node_modules/${name}`,
            {
              version: "1.0.0",
              resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`,
              integrity: "sha512-x",
              hasInstallScript: true,
            },
          ]),
        ),
      },
    };
    return {
      logs,
      lockfile: () => lock,
      vendorDoc: () => allowedInDoc,
      npmrc: () => npmrc,
      log: (message: string) => logs.push(message),
    };
  }

  it("says so and returns 0 when the app ships released or allowed versions", () => {
    const io = fakeIo(
      [...Object.keys(ALLOWED), ...Object.keys(INSTALL_SCRIPTS)]
        .map((name) => `\`${name}\``)
        .join(", "),
    );
    expect(main(io)).toBe(0);
    expect(io.logs).toEqual([
      "The app ships released versions only, and the allowed ones (docs/vendor-code.md#maturity), installed from the registry without install scripts (docs/vendor-code.md#installing).",
    ]);
  });

  it("logs each problem and returns 1", () => {
    const io = fakeIo("", "");
    expect(main(io)).toBe(1);
    expect(io.logs).toHaveLength(
      Object.keys(ALLOWED).length + 1 + Object.keys(INSTALL_SCRIPTS).length,
    );
  });
});

describe("the repository's app", () => {
  it("ships released versions, or allowed ones the vendor page explains", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process = { exitCode: undefined as number | string | null | undefined };
    run(process);
    expect(log.mock.calls).toEqual([
      [
        "The app ships released versions only, and the allowed ones (docs/vendor-code.md#maturity), installed from the registry without install scripts (docs/vendor-code.md#installing).",
      ],
    ]);
    expect(process.exitCode).toBe(0);
    log.mockRestore();
  });

  it("is read from package-lock.json, docs/vendor-code.md and .npmrc", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    expect(io.lockfile().packages["apps/web"]?.name).toBe("@solid-memo/web");
    expect(io.vendorDoc()).toContain("# Vendor");
    expect(io.npmrc()).toContain("ignore-scripts=true");
  });
});
