// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The checks of a release that passed, kept by a key that covers all
 * they read (docs/deck-library.md#checking-each-version-once): `npm run library:check` and
 * the round trip check again only the releases whose key is new. A
 * check that failed is never kept, so it runs again.
 */
export interface ReleaseCache {
  has(key: string): boolean;
  add(key: string): void;
}

/** Where the keys are kept: one folder for every checkout and worktree of the machine. */
export function defaultCacheDir(home: string = homedir()): string {
  return join(home, ".cache", "solid-memo");
}

/** A cache of `kind`'s keys in `dir`, each an empty file named by the key. */
export function fileReleaseCache(kind: string, dir: string = defaultCacheDir()): ReleaseCache {
  const folder = join(dir, kind);
  return {
    has: (key) => existsSync(join(folder, key)),
    add: (key) => {
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, key), "");
    },
  };
}

/** A key over `parts`, each part's length before it, so no two lists give one key. */
export function keyOf(parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(`${Buffer.byteLength(part)}:`);
    hash.update(part);
  }
  return hash.digest("hex");
}

/** The repository's workspace packages, by name: each folder of a workspace pattern that has a package.json. */
function workspacesOf(repo: string): Map<string, { dir: string; dependencies: string[] }> {
  const root = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
  const packages = new Map<string, { dir: string; dependencies: string[] }>();
  for (const pattern of root.workspaces as string[]) {
    // Each pattern is folders and a final `*`, as the root's package.json has them.
    const parts = pattern.split("/");
    let dirs = [""];
    for (const part of parts) {
      dirs = dirs.flatMap((dir) =>
        part === "*"
          ? readdirSync(join(repo, dir), { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => join(dir, entry.name))
          : [join(dir, part)],
      );
    }
    for (const dir of dirs) {
      const file = join(repo, dir, "package.json");
      if (!existsSync(file)) continue;
      const json = JSON.parse(readFileSync(file, "utf8"));
      packages.set(json.name, {
        dir,
        dependencies: Object.keys({ ...json.dependencies, ...json.devDependencies }),
      });
    }
  }
  return packages;
}

/**
 * The code a check of `name` runs, as one hash: every file git has (or
 * would add) in the package and the workspace packages it depends on,
 * and in `extra` (paths from the repository's root), each by its path
 * and its content. Any change to them changes every key made with it.
 */
export function codeFingerprint(repo: string, name: string, extra: readonly string[]): string {
  const packages = workspacesOf(repo);
  const dirs: string[] = [];
  const todo = [name];
  const seen = new Set<string>();
  while (todo.length > 0) {
    const next = todo.pop()!;
    const found = packages.get(next);
    if (seen.has(next) || found === undefined) continue;
    seen.add(next);
    dirs.push(found.dir);
    todo.push(...found.dependencies);
  }
  if (dirs.length === 0) throw new Error(`${name} is no workspace package of ${repo}.`);
  const files = execFileSync(
    "git",
    [
      "-C",
      repo,
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...dirs.sort(),
      ...extra,
    ],
    { encoding: "utf8", maxBuffer: 1 << 30 },
  )
    .split("\0")
    .filter((file) => file !== "")
    .sort();
  const hash = createHash("sha256");
  for (const file of new Set(files)) {
    const path = join(repo, file);
    // A file git still lists but that was deleted counts by its path alone.
    hash.update(
      `${file}\0${existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : "-"}\0`,
    );
  }
  return hash.digest("hex");
}
