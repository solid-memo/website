// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED,
  defaultIo,
  dependencyProblems,
  INSTALL_SCRIPTS,
  installProblems,
  isUnready,
  LOCKFILE_DIRS,
  type Lockfile,
  lockfileProblems,
  type Manifest,
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
  const REGISTRY = "https://registry.npmjs.org";
  const HASH = "sha512-x";
  const DOC = "| `watcher` | why |";
  const NO_ALIASES = () => ({});
  const CLEAN: Lockfile = {
    packages: {
      "": { name: "root" },
      "apps/app": { name: "@x/app", version: "0.0.0" },
      "node_modules/@x/app": { link: true, resolved: "apps/app" },
      "node_modules/a": {
        version: "1.0.0",
        resolved: `${REGISTRY}/a/-/a-1.0.0.tgz`,
        integrity: HASH,
        bundleDependencies: ["c"],
      },
      "node_modules/@x/scoped": {
        version: "1.0.0",
        resolved: `${REGISTRY}/@x/scoped/-/scoped-1.0.0.tgz`,
        integrity: HASH,
      },
      "apps/app/node_modules/b": {
        name: "b",
        version: "1.0.0",
        resolved: `${REGISTRY}/b/-/b-1.0.0.tgz`,
        integrity: HASH,
      },
      // A package carried in another's tarball has neither.
      "node_modules/a/node_modules/c": { version: "1.0.0", inBundle: true },
      "node_modules/watcher": {
        version: "2.0.0",
        resolved: `${REGISTRY}/watcher/-/watcher-2.0.0.tgz`,
        integrity: HASH,
        hasInstallScript: true,
      },
    },
  };

  it("passes on registry packages with their hashes, scripts off, and the allowed install scripts", () => {
    expect(installProblems(CLEAN, NPMRC, { watcher: "why" }, DOC, NO_ALIASES)).toEqual([]);
  });

  it("fails when .npmrc leaves install scripts on", () => {
    expect(
      installProblems(CLEAN, "# ignore-scripts=true\n", { watcher: "why" }, DOC, NO_ALIASES),
    ).toEqual([".npmrc: does not say `ignore-scripts=true`, so `npm ci` runs install scripts."]);
  });

  it("fails when a later line of .npmrc turns install scripts back on", () => {
    for (const npmrc of [
      "ignore-scripts=true\nignore-scripts=false\n",
      "ignore-scripts=true\n  ignore-scripts = false\n",
    ]) {
      expect(installProblems(CLEAN, npmrc, { watcher: "why" }, DOC, NO_ALIASES)).toEqual([
        ".npmrc: does not say `ignore-scripts=true`, so `npm ci` runs install scripts.",
      ]);
    }
    expect(
      installProblems(
        CLEAN,
        "ignore-scripts=false\nignore-scripts = true\n",
        { watcher: "why" },
        DOC,
        NO_ALIASES,
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
        "node_modules/unhashed": {
          version: "1.0.0",
          resolved: `${REGISTRY}/unhashed/-/unhashed-1.0.0.tgz`,
        },
        "node_modules/hook": {
          name: "hook",
          version: "1.0.0",
          resolved: `${REGISTRY}/hook/-/hook-1.0.0.tgz`,
          integrity: HASH,
          hasInstallScript: true,
        },
      },
    };
    expect(installProblems(lock, NPMRC, {}, DOC, NO_ALIASES)).toEqual([
      "node_modules/watcher: has an install script, which does not run: depend on another package, or add it to INSTALL_SCRIPTS in scripts/checkDependencies.ts.",
      "node_modules/git: resolved from git+ssh://git@github.com/x/git.git#abc, not from https://registry.npmjs.org/git/-/git-1.0.0.tgz.",
      "node_modules/tarball: resolved from https://example.org/t.tgz, not from https://registry.npmjs.org/tarball/-/tarball-1.0.0.tgz.",
      "node_modules/tarball: no integrity hash.",
      "node_modules/unhashed: no integrity hash.",
      "node_modules/hook: has an install script, which does not run: depend on another package, or add it to INSTALL_SCRIPTS in scripts/checkDependencies.ts.",
    ]);
  });

  it("fails on a registry tarball that is not the package's own name and version", () => {
    const swap = (location: string, version: string, resolved: string) =>
      installProblems(
        { packages: { [location]: { version, resolved, integrity: HASH } } },
        NPMRC,
        {},
        DOC,
        NO_ALIASES,
      );
    expect(swap("node_modules/left-pad", "1.0.0", `${REGISTRY}/other/-/other-9.9.9.tgz`)).toEqual([
      "node_modules/left-pad: resolved from https://registry.npmjs.org/other/-/other-9.9.9.tgz, not from https://registry.npmjs.org/left-pad/-/left-pad-1.0.0.tgz.",
    ]);
    expect(
      swap("node_modules/left-pad", "1.0.0", `${REGISTRY}/left-pad/-/left-pad-1.0.1.tgz`),
    ).toEqual([
      "node_modules/left-pad: resolved from https://registry.npmjs.org/left-pad/-/left-pad-1.0.1.tgz, not from https://registry.npmjs.org/left-pad/-/left-pad-1.0.0.tgz.",
    ]);
    expect(
      swap("node_modules/@x/scoped", "1.0.0", `${REGISTRY}/@y/scoped/-/scoped-1.0.0.tgz`),
    ).toEqual([
      "node_modules/@x/scoped: resolved from https://registry.npmjs.org/@y/scoped/-/scoped-1.0.0.tgz, not from https://registry.npmjs.org/@x/scoped/-/scoped-1.0.0.tgz.",
    ]);
  });

  it("takes an alias a package.json declares, with the tarball of the package it is", () => {
    const lock: Lockfile = {
      packages: {
        "": { name: "root" },
        "apps/app": { name: "@x/app" },
        "node_modules/nick": {
          name: "@x/real",
          version: "1.0.0",
          resolved: `${REGISTRY}/@x/real/-/real-1.0.0.tgz`,
          integrity: HASH,
        },
      },
    };
    expect(
      installProblems(lock, NPMRC, {}, DOC, (location) =>
        location === "apps/app" ? { devDependencies: { nick: "npm:@x/real" } } : {},
      ),
    ).toEqual([]);
    expect(
      installProblems(lock, NPMRC, {}, DOC, (location) =>
        location === "" ? { dependencies: { nick: "npm:@x/real@^1.0.0" } } : {},
      ),
    ).toEqual([]);
  });

  it("fails on an entry named after another package that no package.json declares", () => {
    const named = {
      name: "other",
      version: "1.0.0",
      resolved: `${REGISTRY}/other/-/other-1.0.0.tgz`,
      integrity: HASH,
    };
    const problem =
      "node_modules/left-pad: named other, but no package.json of the workspace declares that alias; declare it in one if it is meant.";
    const alias = { "left-pad": "npm:other@1.0.0" };
    for (const [packages, manifest] of [
      // Nothing declares it.
      [{ "": { name: "root" } }, {}],
      // An alias of another name, or a plain range, is not this one.
      [
        { "": { name: "root" } },
        { dependencies: { nick: "npm:other@1.0.0", "left-pad": "1.0.0" } },
      ],
      // The lockfile cannot vouch for it, in a workspace entry or a package's.
      [{ "": { name: "root", dependencies: alias } }, {}],
      [{ "": { name: "root" }, "node_modules/third": { dependencies: alias } }, {}],
    ] as [Lockfile["packages"], Manifest][]) {
      expect(
        installProblems(
          { packages: { ...packages, "node_modules/left-pad": named } },
          NPMRC,
          {},
          DOC,
          () => manifest,
        ).filter((line) => line.startsWith("node_modules/left-pad")),
      ).toEqual([problem]);
    }
  });

  describe("what the lockfile alone could claim", () => {
    const EVIL = `${REGISTRY}/evil-pkg/-/evil-pkg-1.0.0.tgz`;
    const problemsOf = (packages: Lockfile["packages"], manifest: () => Manifest | undefined) =>
      installProblems({ packages }, NPMRC, {}, DOC, manifest);
    const WORKSPACE = {
      "": { name: "root" },
      "packages/lib": { name: "@x/lib", version: "0.0.0" },
    };

    it("takes the word of inBundle only for an entry with no address and no hash", () => {
      const swapped = { version: "1.0.0", resolved: EVIL, integrity: HASH, inBundle: true };
      const expected = (location: string) =>
        `${location}: resolved from ${EVIL}, not from ${REGISTRY}/left-pad/-/left-pad-1.0.0.tgz.`;
      for (const location of [
        "node_modules/left-pad",
        "node_modules/parent-pkg/node_modules/left-pad",
      ]) {
        expect(problemsOf({ [location]: swapped }, NO_ALIASES)).toEqual([expected(location)]);
      }
      expect(
        problemsOf(
          { "node_modules/left-pad": { version: "1.0.0", resolved: EVIL, inBundle: true } },
          NO_ALIASES,
        ),
      ).toEqual([expected("node_modules/left-pad"), "node_modules/left-pad: no integrity hash."]);
      expect(
        problemsOf(
          { "node_modules/left-pad": { version: "1.0.0", integrity: HASH, inBundle: true } },
          NO_ALIASES,
        ),
      ).toEqual([
        `node_modules/left-pad: resolved from undefined, not from ${REGISTRY}/left-pad/-/left-pad-1.0.0.tgz.`,
      ]);
    });

    describe("an entry with no address and no hash, and the flag", () => {
      const carried = { version: "1.0.0", inBundle: true };
      const OWNER = {
        version: "1.0.0",
        resolved: `${REGISTRY}/owner/-/owner-1.0.0.tgz`,
        integrity: HASH,
        bundleDependencies: ["left-pad"],
      };
      const AT = "node_modules/owner/node_modules/left-pad";
      const refused = (location: string, wanted = `${REGISTRY}/left-pad/-/left-pad-1.0.0.tgz`) => [
        `${location}: resolved from undefined, not from ${wanted}.`,
        `${location}: no integrity hash.`,
      ];

      it("is carried when the package above it bundles, at any depth", () => {
        expect(problemsOf({ "node_modules/owner": OWNER, [AT]: carried }, NO_ALIASES)).toEqual([]);
        expect(
          problemsOf(
            {
              "node_modules/owner": OWNER,
              [AT]: carried,
              [`${AT}/node_modules/inner`]: carried,
            },
            NO_ALIASES,
          ),
        ).toEqual([]);
      });

      it("is fetched below a link, or when it says it has an install script", () => {
        expect(
          problemsOf({ "node_modules/owner": { ...OWNER, link: true }, [AT]: carried }, NO_ALIASES),
        ).toContain(`${AT}: no integrity hash.`);
        expect(
          problemsOf(
            { "node_modules/owner": OWNER, [AT]: { ...carried, hasInstallScript: true } },
            NO_ALIASES,
          ),
        ).toContain(`${AT}: no integrity hash.`);
      });

      it("fails with a field of npm's own, at any kind of entry", () => {
        const addressed = { ...carried, _resolved: EVIL, _from: "x" };
        expect(problemsOf({ "node_modules/owner": OWNER, [AT]: addressed }, NO_ALIASES)).toEqual([
          `${AT}: has _resolved, _from, which a lockfile never has.`,
        ]);
        const hashed = { ...OWNER, _integrity: HASH };
        expect(problemsOf({ "node_modules/owner": hashed }, NO_ALIASES)).toEqual([
          "node_modules/owner: has _integrity, which a lockfile never has.",
        ]);
      });

      it("is fetched at the top level, where no package carries it", () => {
        const at = "node_modules/left-pad";
        expect(problemsOf({ [at]: carried }, NO_ALIASES)).toEqual(refused(at));
      });

      it("is fetched below a package that lists nothing to bundle, or none at all", () => {
        const { bundleDependencies: _, ...plain } = OWNER;
        expect(problemsOf({ "node_modules/owner": plain, [AT]: carried }, NO_ALIASES)).toEqual(
          refused(AT),
        );
        expect(problemsOf({ [AT]: carried }, NO_ALIASES)).toEqual(refused(AT));
      });

      it("is fetched below a folder of the workspace, whatever it lists", () => {
        const at = "packages/lib/node_modules/left-pad";
        const folder = { name: "@x/lib", version: "0.0.0", bundleDependencies: ["left-pad"] };
        expect(problemsOf({ "packages/lib": folder, [at]: carried }, NO_ALIASES)).toEqual(
          refused(at),
        );
      });

      it("is fetched when it goes by another name or has no plain version", () => {
        const named = { ...carried, name: "evil-pkg" };
        expect(problemsOf({ "node_modules/owner": OWNER, [AT]: named }, NO_ALIASES)).toEqual([
          `${AT}: named evil-pkg, but no package.json of the workspace declares that alias; declare it in one if it is meant.`,
          ...refused(AT, `${REGISTRY}/evil-pkg/-/evil-pkg-1.0.0.tgz`),
        ]);
        for (const version of ["npm:evil-pkg@1.0.0", "http://127.0.0.1/x/evil.tgz"]) {
          expect(
            problemsOf({ "node_modules/owner": OWNER, [AT]: { ...carried, version } }, NO_ALIASES),
          ).toEqual([
            `${AT}: name left-pad or version ${version} is not one a registry address can be made of.`,
          ]);
        }
        expect(
          problemsOf({ "node_modules/owner": OWNER, [AT]: { inBundle: true } }, NO_ALIASES),
        ).toEqual([
          `${AT}: name left-pad or version undefined is not one a registry address can be made of.`,
        ]);
      });
    });

    it("counts an empty or malformed integrity hash as none", () => {
      for (const integrity of ["", "x", "md5-abc"]) {
        expect(
          problemsOf(
            {
              "node_modules/left-pad": {
                version: "1.0.0",
                resolved: `${REGISTRY}/left-pad/-/left-pad-1.0.0.tgz`,
                integrity,
              },
            },
            NO_ALIASES,
          ),
        ).toEqual(["node_modules/left-pad: no integrity hash."]);
      }
    });

    describe("what an entry asks for", () => {
      const parent = (range: string) => ({
        "node_modules/parent": {
          version: "1.0.0",
          resolved: `${REGISTRY}/parent/-/parent-1.0.0.tgz`,
          integrity: HASH,
          dependencies: { "left-pad": range },
        },
      });
      const refused = (range: string) => [
        `node_modules/parent: asks for left-pad as ${range}, not as a version range.`,
      ];

      it("passes on a version range", () => {
        for (const range of ["1.0.0", "^1.2.3 || >=2", "*"]) {
          expect(problemsOf(parent(range), NO_ALIASES)).toEqual([]);
        }
      });

      it("fails on an address, whatever its form, or an alias no package.json declares", () => {
        for (const range of [
          "http://127.0.0.1/x/lp.tgz",
          "https://example.org/lp.tgz",
          "git+https://example.org/lp.git",
          "github:someone/lp",
          "someone/lp",
          "file:../lp.tgz",
          "npm:other@1.0.0",
        ]) {
          expect(problemsOf(parent(range), NO_ALIASES)).toEqual(refused(range));
        }
      });

      it("fails on an address however it is listed, in a workspace folder too", () => {
        const url = "http://127.0.0.1/x/lp.tgz";
        for (const list of ["devDependencies", "optionalDependencies", "peerDependencies"]) {
          expect(
            problemsOf({ ...WORKSPACE, "packages/lib": { [list]: { x: url } } }, () => ({})),
          ).toEqual([`packages/lib: asks for x as ${url}, not as a version range.`]);
        }
      });

      it("takes an alias a package.json declares, but not with an address for its version", () => {
        const declared = () => ({ dependencies: { "left-pad": "npm:other@1.0.0" } });
        const listed = (range: string) => ({
          ...WORKSPACE,
          "packages/lib": { dependencies: { "left-pad": range } },
        });
        expect(problemsOf(listed("npm:other@1.0.0"), declared)).toEqual([]);
        const url = "npm:other@http://127.0.0.1/x.tgz";
        expect(problemsOf(listed(url), declared)).toEqual([
          `packages/lib: asks for left-pad as ${url}, not as a version range.`,
        ]);
      });
    });

    it("fails on a package that brings a shrinkwrap of its own", () => {
      expect(
        problemsOf(
          {
            "node_modules/left-pad": {
              version: "1.0.0",
              resolved: `${REGISTRY}/left-pad/-/left-pad-1.0.0.tgz`,
              integrity: HASH,
              hasShrinkwrap: true,
            },
          },
          NO_ALIASES,
        ),
      ).toEqual([
        "node_modules/left-pad: brings a shrinkwrap of its own, which decides what is installed below it.",
      ]);
    });

    it("fails on a lockfile that lists no packages", () => {
      expect(problemsOf({}, NO_ALIASES)).toEqual(["package-lock.json: lists no packages."]);
    });

    it("lets a link lead only to a folder the workspace lists", () => {
      const link = (resolved?: string) =>
        problemsOf({ ...WORKSPACE, "node_modules/left-pad": { link: true, resolved } }, NO_ALIASES);
      expect(link("packages/lib")).toEqual([]);
      for (const target of ["node_modules/evil-pkg", "packages/none", "constructor", ""]) {
        expect(link(target)).toEqual([
          `node_modules/left-pad: a link to ${target}, not to a workspace folder.`,
        ]);
      }
      expect(link()).toEqual(["node_modules/left-pad: a link to , not to a workspace folder."]);
    });

    it.each([
      "node_modules/evil-pkg/-/evil-pkg-1.0.0.tgz#/../../../left-pad",
      "node_modules/left-pad?x",
      "node_modules/../node_modules/left-pad",
      "node_modules/.hidden",
      "node_modules/@x",
      "node_modules/left-pad/",
      "node_modules/a_node_modules/left-pad",
      "apps/../node_modules/left-pad",
      "apps/app/node_modules",
      "../outside",
      "apps/#x",
    ])("refuses the location %s", (location) => {
      const manifest = vi.fn(() => ({}));
      const entry = { version: "1.0.0", resolved: `${EVIL}#/x`, integrity: HASH };
      expect(problemsOf({ [location]: entry }, manifest)).toEqual([
        `${location}: not a location where npm installs a package of a valid name.`,
      ]);
      // A location that cannot be a folder of the workspace is not looked up on the disk.
      expect(manifest).not.toHaveBeenCalled();
    });

    it.each([
      "x/../../../evil-pkg/-/evil-pkg-1.0.0",
      "1.0.0#x",
      "1.0.0?x",
      "1.0.%2e",
      "1.0",
      "1.0.0-",
      "1.0.0-a..b",
      "latest",
    ])("refuses the version %s, even at the address made of it", (version) => {
      const entry = {
        version,
        resolved: `${REGISTRY}/left-pad/-/left-pad-${version}.tgz`,
        integrity: HASH,
      };
      expect(problemsOf({ "node_modules/left-pad": entry }, NO_ALIASES)).toEqual([
        `node_modules/left-pad: name left-pad or version ${version} is not one a registry address can be made of.`,
      ]);
    });

    it("refuses an entry with no version, and a name an address cannot be made of", () => {
      expect(
        problemsOf({ "node_modules/left-pad": { resolved: EVIL, integrity: HASH } }, NO_ALIASES),
      ).toEqual([
        "node_modules/left-pad: name left-pad or version undefined is not one a registry address can be made of.",
      ]);
      expect(
        problemsOf(
          {
            "node_modules/left-pad": {
              name: "evil-pkg/-/x/../..",
              version: "1.0.0",
              resolved: EVIL,
              integrity: HASH,
            },
          },
          NO_ALIASES,
        ),
      ).toEqual([
        "node_modules/left-pad: name evil-pkg/-/x/../.. or version 1.0.0 is not one a registry address can be made of.",
      ]);
    });

    it("takes the versions a registry publishes", () => {
      for (const version of ["1.0.0", "8.0.0-alpha.3", "1.0.0-rc-1+build.5", "10.20.30+x"]) {
        expect(
          problemsOf(
            {
              "node_modules/a": {
                version,
                resolved: `${REGISTRY}/a/-/a-${version}.tgz`,
                integrity: HASH,
              },
            },
            NO_ALIASES,
          ),
        ).toEqual([]);
      }
    });

    it("fails on a workspace folder with no package.json, or with an address", () => {
      expect(problemsOf({ "apps/gone": { name: "gone" } }, () => undefined)).toEqual([
        "apps/gone: listed as part of the workspace, but has no package.json.",
      ]);
      for (const entry of [{ resolved: EVIL }, { integrity: HASH }]) {
        expect(problemsOf({ "apps/app": entry }, NO_ALIASES)).toEqual([
          "apps/app: part of the workspace, but has an address or integrity hash.",
        ]);
      }
    });
  });

  it("fails on an allowed install script the page does not name, or no package has", () => {
    expect(
      installProblems(CLEAN, NPMRC, { watcher: "why", gone: "why" }, "`gone`", NO_ALIASES),
    ).toEqual([
      "watcher: in INSTALL_SCRIPTS in scripts/checkDependencies.ts, but docs/vendor-code.md does not name it.",
      "gone: in INSTALL_SCRIPTS in scripts/checkDependencies.ts, but no package of that name has an install script; take it off.",
    ]);
  });
});

describe("lockfileProblems", () => {
  const REGISTRY = "https://registry.npmjs.org";
  const TOOL: Lockfile = {
    packages: {
      "": { name: "tool", dependencies: { a: "^1.0.0" } },
      "node_modules/a": {
        version: "1.0.0",
        resolved: `${REGISTRY}/a/-/a-1.0.0.tgz`,
        integrity: "sha512-x",
        // Installed with --ignore-scripts on npm's command line, and not shipped.
        hasInstallScript: true,
      },
    },
  };
  const ROOT_ONLY = () => ({});

  it("passes on registry packages with their hashes, an install script among them", () => {
    expect(lockfileProblems(TOOL, "scripts/tool", ROOT_ONLY)).toEqual([]);
  });

  it("fails, under the lockfile's path, on a package fetched from another package's tarball", () => {
    const swapped: Lockfile = {
      packages: {
        ...TOOL.packages,
        "node_modules/a": {
          ...TOOL.packages["node_modules/a"],
          resolved: `${REGISTRY}/evil/-/evil-1.0.0.tgz`,
          integrity: "sha512-y",
        },
      },
    };
    expect(lockfileProblems(swapped, "scripts/tool", ROOT_ONLY)).toEqual([
      `scripts/tool/package-lock.json: node_modules/a: resolved from ${REGISTRY}/evil/-/evil-1.0.0.tgz, not from ${REGISTRY}/a/-/a-1.0.0.tgz.`,
    ]);
  });

  it("fails on a package with no hash, or with a shrinkwrap of its own", () => {
    const { integrity: _, ...unhashed } = TOOL.packages["node_modules/a"]!;
    const lock: Lockfile = {
      packages: {
        ...TOOL.packages,
        "node_modules/a": unhashed,
        "node_modules/b": {
          version: "1.0.0",
          resolved: `${REGISTRY}/b/-/b-1.0.0.tgz`,
          integrity: "sha512-x",
          hasShrinkwrap: true,
        },
      },
    };
    expect(lockfileProblems(lock, "e2e/server", ROOT_ONLY)).toEqual([
      "e2e/server/package-lock.json: node_modules/a: no integrity hash.",
      "e2e/server/package-lock.json: node_modules/b: brings a shrinkwrap of its own, which decides what is installed below it.",
    ]);
  });

  it("fails on its root with no package.json, and on a lockfile that lists no packages", () => {
    expect(lockfileProblems(TOOL, "gone", () => undefined)).toEqual([
      "gone/package-lock.json: : listed as part of the workspace, but has no package.json.",
    ]);
    expect(lockfileProblems({ packages: {} }, "e2e/server", ROOT_ONLY)).toEqual([
      "e2e/server/package-lock.json: lists no packages.",
    ]);
  });
});

describe("main", () => {
  /** A clean lockfile of its own for each of the other directories npm installs from. */
  const OTHER: Lockfile = {
    packages: {
      "": { name: "tool" },
      "node_modules/a": {
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/a/-/a-1.0.0.tgz",
        integrity: "sha512-x",
      },
    },
  };

  function fakeIo(
    allowedInDoc: string,
    npmrc = "ignore-scripts=true\n",
    shrinkwrap: (dir: string) => boolean = () => false,
    other: Lockfile = OTHER,
  ) {
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
              resolved: `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-0.1.0.tgz`,
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
      lockfile: (dir: string) => (dir === "." ? lock : other),
      vendorDoc: () => allowedInDoc,
      npmrc: () => npmrc,
      manifest: () => ({}),
      hasShrinkwrap: shrinkwrap,
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

  it("fails on an npm-shrinkwrap.json, which npm ci would read instead", () => {
    const io = fakeIo(
      [...Object.keys(ALLOWED), ...Object.keys(INSTALL_SCRIPTS)]
        .map((name) => `\`${name}\``)
        .join(", "),
      "ignore-scripts=true\n",
      (dir) => dir === "." || dir === "scripts/renovate",
    );
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual([
      "npm-shrinkwrap.json: `npm ci` prefers it to package-lock.json, the file checked here.",
      "scripts/renovate/npm-shrinkwrap.json: `npm ci` prefers it to package-lock.json, the file checked here.",
    ]);
  });

  it("checks every other lockfile npm installs from", () => {
    const io = fakeIo(
      [...Object.keys(ALLOWED), ...Object.keys(INSTALL_SCRIPTS)]
        .map((name) => `\`${name}\``)
        .join(", "),
      "ignore-scripts=true\n",
      () => false,
      { packages: {} },
    );
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual(
      LOCKFILE_DIRS.filter((dir) => dir !== ".").map(
        (dir) => `${dir}/package-lock.json: lists no packages.`,
      ),
    );
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

  it("fails on a swapped tarball in the real lockfile", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    const lock = io.lockfile(".");
    const manifest = (location: string) => io.manifest(".", location);
    const clean = installProblems(lock, io.npmrc(), {}, "", manifest);
    const entry = lock.packages["node_modules/semver"]!;
    entry.resolved = "https://registry.npmjs.org/other/-/other-9.9.9.tgz";
    entry.integrity = "sha512-x";
    const problems = installProblems(lock, io.npmrc(), {}, "", manifest);
    expect(problems.filter((line) => !clean.includes(line))).toEqual([
      `node_modules/semver: resolved from https://registry.npmjs.org/other/-/other-9.9.9.tgz, not from https://registry.npmjs.org/semver/-/semver-${entry.version}.tgz.`,
    ]);
  });

  it("fails on a swapped tarball in the Pending updates workflow's Renovate lockfile", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    const dir = "scripts/renovate";
    const lock = io.lockfile(dir);
    const manifest = (location: string) => io.manifest(dir, location);
    expect(lockfileProblems(lock, dir, manifest)).toEqual([]);
    const entry = lock.packages["node_modules/semver"]!;
    entry.resolved = "https://registry.npmjs.org/other/-/other-9.9.9.tgz";
    entry.integrity = "sha512-x";
    expect(lockfileProblems(lock, dir, manifest)).toEqual([
      `${dir}/package-lock.json: node_modules/semver: resolved from https://registry.npmjs.org/other/-/other-9.9.9.tgz, not from https://registry.npmjs.org/semver/-/semver-${entry.version}.tgz.`,
    ]);
  });

  it("checks every package-lock.json and npm-shrinkwrap.json in the repository", () => {
    const tracked = execFileSync(
      "git",
      ["ls-files", "--", "*package-lock.json", "*npm-shrinkwrap.json"],
      { cwd: `${import.meta.dirname}/..`, encoding: "utf8" },
    );
    const dirs = new Set(tracked.split("\n").filter(Boolean).map(dirname));
    expect([...dirs].sort()).toEqual([...LOCKFILE_DIRS].sort());
  });

  it("is read from package-lock.json, docs/vendor-code.md and .npmrc", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    expect(io.lockfile(".").packages["apps/web"]?.name).toBe("@solid-memo/web");
    expect(io.lockfile("scripts/renovate").packages[""]?.name).toBeDefined();
    expect(io.vendorDoc()).toContain("# Vendor");
    expect(io.npmrc()).toContain("ignore-scripts=true");
    expect(io.manifest(".", "apps/web")?.dependencies).toBeDefined();
    expect(io.manifest("scripts/renovate", "")?.dependencies).toBeDefined();
    expect(io.manifest(".", "apps/none")).toBeUndefined();
    expect(io.hasShrinkwrap(".")).toBe(false);
  });
});
