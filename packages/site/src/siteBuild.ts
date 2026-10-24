// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NS_ROOT, VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";

/**
 * What the site is built with (apps/web/vite.config.ts): the values its
 * code reads as constants, the commit it names and the rules it checks
 * pod documents by.
 */

/**
 * The commit being built, shown beside the site's version in the footer. Read
 * from the checkout itself (the deploy workflow builds a specific commit,
 * which GITHUB_SHA need not equal); null outside a git checkout.
 */
export function commitSha(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.env.GITHUB_SHA ?? null;
  }
}

/** The site's version, which its page states for the footer: the repository's, from its root package.json. */
export function appVersion(): string {
  return (
    JSON.parse(readFileSync(join(VOCAB_ROOT, "../../package.json"), "utf8")) as { version: string }
  ).version;
}

/**
 * Names the rules pod documents are checked by: a hash of every shape
 * (ns/shapes/) and vendored profile file. A check receipt in an
 * instance's digest counts only under the same rules.
 */
export function shapesRuleset(): string {
  const hash = createHash("sha256");
  const visit = (root: string, dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(root, path);
      else hash.update(path.slice(root.length)).update(readFileSync(path));
    }
  };
  visit(NS_ROOT, `${NS_ROOT}shapes`);
  visit(VOCAB_ROOT, `${VOCAB_ROOT}vendor`);
  return hash.digest("hex").slice(0, 16);
}

/**
 * Vite's `define`: `__COMMIT_SHA__` and `__SHAPES_RULESET__`, as each
 * app's vite-env.d.ts declares them. The version is not one: the page
 * states it in its HTML (apps/web/index.html), so a built site can be
 * given another version without touching its script.
 */
export function siteDefines(): Record<string, string> {
  return {
    __COMMIT_SHA__: JSON.stringify(commitSha()),
    __SHAPES_RULESET__: JSON.stringify(shapesRuleset()),
  };
}
