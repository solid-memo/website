import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NS_ROOT, VOCAB_ROOT } from "./root.ts";

/**
 * What the site is built with (apps/web/vite.config.ts): the values its
 * code reads as constants, the commit it names and the rules it checks
 * pod documents by.
 */

/**
 * The commit being built, shown as the site's version in the footer. Read
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

/**
 * Names the rules pod documents are checked by: a hash of every shape
 * (ns/shapes/) and vendored profile file. A check receipt in an
 * instance's digest counts only under the same rules.
 */
export function shapesRuleset(): string {
  const hash = createHash("sha256");
  const visit = (root: string, dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(root, path);
      else hash.update(path.slice(root.length)).update(readFileSync(path));
    }
  };
  visit(NS_ROOT, `${NS_ROOT}shapes`);
  visit(VOCAB_ROOT, `${VOCAB_ROOT}vendor`);
  return hash.digest("hex").slice(0, 16);
}

/** Vite's `define`: `__COMMIT_SHA__` and `__SHAPES_RULESET__`, as each app's vite-env.d.ts declares them. */
export function siteDefines(): Record<string, string> {
  return {
    __COMMIT_SHA__: JSON.stringify(commitSha()),
    __SHAPES_RULESET__: JSON.stringify(shapesRuleset()),
  };
}
