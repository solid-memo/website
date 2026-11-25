// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codeFingerprint, defaultCacheDir, fileReleaseCache, keyOf } from "./releaseCache.ts";

describe("defaultCacheDir", () => {
  it("is one folder in the user's cache, for every checkout", () => {
    expect(defaultCacheDir("/home/someone")).toBe("/home/someone/.cache/solid-memo");
    expect(defaultCacheDir()).toBe(join(homedir(), ".cache", "solid-memo"));
  });
});

describe("fileReleaseCache", () => {
  it("keeps each key of its kind, which another kind doesn't have", () => {
    const dir = mkdtempSync(join(tmpdir(), "solid-memo-cache-"));
    const checks = fileReleaseCache("library-check", dir);
    expect(checks.has("a")).toBe(false);
    checks.add("a");
    checks.add("a");
    expect(checks.has("a")).toBe(true);
    expect(fileReleaseCache("library-check", dir).has("a")).toBe(true);
    expect(fileReleaseCache("round-trip", dir).has("a")).toBe(false);
    rmSync(dir, { recursive: true });
  });
});

describe("keyOf", () => {
  it("gives one key to the same parts, and another when they are cut elsewhere", () => {
    expect(keyOf(["a", "bc"])).toBe(keyOf(["a", "bc"]));
    expect(keyOf(["a", "bc"])).not.toBe(keyOf(["ab", "c"]));
    expect(keyOf(["a", "bc"])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("codeFingerprint", () => {
  const git = (repo: string, ...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  const write = (repo: string, path: string, text: string) => {
    mkdirSync(join(repo, path, ".."), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  /** A repository of three packages: a depends on b, b on a and on n3, c on none. */
  const repository = () => {
    const repo = mkdtempSync(join(tmpdir(), "solid-memo-code-"));
    git(repo, "init", "--quiet");
    write(repo, "package.json", JSON.stringify({ workspaces: ["packages/*", "tools"] }));
    write(repo, "packages/a/package.json", JSON.stringify({ name: "a", dependencies: { b: "*" } }));
    write(
      repo,
      "packages/b/package.json",
      JSON.stringify({ name: "b", devDependencies: { a: "*", n3: "*" } }),
    );
    write(repo, "packages/c/package.json", JSON.stringify({ name: "c" }));
    write(repo, "packages/a/src/a.ts", "a");
    write(repo, "packages/b/src/b.ts", "b");
    write(repo, "packages/c/src/c.ts", "c");
    write(repo, "packages/README.md", "not a package");
    mkdirSync(join(repo, "packages/empty"));
    write(repo, "ns/shapes.ttl", "shapes");
    git(repo, "add", ".");
    return repo;
  };

  it("changes with the package, the packages it depends on and the extra paths, not with others", () => {
    const repo = repository();
    const of = () => codeFingerprint(repo, "a", ["ns"]);
    const first = of();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(of()).toBe(first);
    write(repo, "packages/c/src/c.ts", "c2");
    expect(of()).toBe(first);
    write(repo, "packages/b/src/b.ts", "b2");
    const second = of();
    expect(second).not.toBe(first);
    write(repo, "packages/b/src/new.ts", "a file git doesn't have yet");
    const third = of();
    expect(third).not.toBe(second);
    write(repo, "ns/shapes.ttl", "shapes2");
    expect(of()).not.toBe(third);
    rmSync(repo, { recursive: true });
  });

  it("counts a file git has but that was deleted by its path", () => {
    const repo = repository();
    const before = codeFingerprint(repo, "a", []);
    rmSync(join(repo, "packages/a/src/a.ts"));
    expect(codeFingerprint(repo, "a", [])).not.toBe(before);
    rmSync(repo, { recursive: true });
  });

  it("refuses a name that is no workspace package", () => {
    const repo = repository();
    expect(() => codeFingerprint(repo, "n3", [])).toThrow(/n3 is no workspace package/);
    rmSync(repo, { recursive: true });
  });
});
