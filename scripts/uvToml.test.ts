// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * uv.toml: `uv pip compile` locks no package into scripts/requirements-*.txt,
 * a bumped pin's or one it pulls in, at a version younger than the wait
 * renovate.json5 sets on the updates it proposes
 * (GOVERNANCE.md#dependency-updates).
 */

const ROOT = join(import.meta.dirname, "..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("uv.toml", () => {
  it("waits as long as Renovate does for every package uv compiles", () => {
    const days = /^ {4}minimumReleaseAge: '(\d+ days)',$/m.exec(read("renovate.json5"))?.[1];
    expect(days).toBe("3 days");
    expect(/^exclude-newer = "(.*)"$/m.exec(read("uv.toml"))?.[1]).toBe(days);
  });

  it("exempts no package from the wait", () => {
    expect(read("uv.toml")).not.toMatch(/^exclude-newer-package/m);
  });

  it.each(["ci", "lint"])("is not overridden by requirements-%s.txt's command", (name) => {
    const command = /^#\s+(uv pip compile .*)$/m.exec(
      read(`scripts/requirements-${name}.txt`),
    )?.[1];
    expect(command).toContain("uv pip compile");
    expect(command).not.toContain("--exclude-newer");
  });
});
