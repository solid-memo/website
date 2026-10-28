// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * .npmrc: npm resolves no package, an update's own or one it pulls in, to a
 * version younger than the wait renovate.json5 sets on the updates it
 * proposes (GOVERNANCE.md#dependency-updates), in the repository's npm
 * workspace and in each end-to-end test server's own lockfile beside it.
 */

const ROOT = join(import.meta.dirname, "..");

/** Each directory npm installs a package-lock.json from. */
const PREFIXES = [
  ".",
  "e2e/pod/servers/jss",
  "e2e/pod/servers/nss/5",
  "e2e/pod/servers/nss/6",
  "e2e/pod/servers/pivot",
];

/** A directory's npm settings as npm reads them, without the caller's. */
function npmConfig(prefix: string, key: string): string {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/^npm_config_/i.test(name)),
  );
  return execFileSync("npm", ["config", "get", key], {
    cwd: join(ROOT, prefix),
    env,
    encoding: "utf8",
  }).trim();
}

describe.each(PREFIXES)(".npmrc in %s", (prefix) => {
  it("waits as long as Renovate does for every package npm resolves", () => {
    const renovate = readFileSync(join(ROOT, "renovate.json5"), "utf8");
    const days = /^ {4}minimumReleaseAge: '(\d+) days',$/m.exec(renovate)?.[1];
    expect(days).toBe("3");
    expect(npmConfig(prefix, "min-release-age")).toBe(days);
  });

  it("exempts no package from the wait", () => {
    expect(npmConfig(prefix, "min-release-age-exclude")).toBe("");
  });
});
