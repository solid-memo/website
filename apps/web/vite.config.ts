import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { turtleDirectoryPlugin } from "@solid-memo/vocab/tooling/publishTurtle";
import { DECKS_ROOT, NS_ROOT, VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";

/**
 * The commit being built, shown as the site's version in the footer. Read
 * from the checkout itself (the deploy workflow builds a specific commit,
 * which GITHUB_SHA need not equal); null outside a git checkout.
 */
function commitSha(): string | null {
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
function shapesRuleset(): string {
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

export default defineConfig({
  define: {
    __COMMIT_SHA__: JSON.stringify(commitSha()),
    __SHAPES_RULESET__: JSON.stringify(shapesRuleset()),
  },
  base: "./",
  plugins: [
    preact(),
    // Published with the site: the vocabulary and the shapes (ns/) and the deck
    // library (decks/), at their IRIs, and the vendored profiles. A checkout
    // without decks/ builds without the library; the deploy checks it is there.
    turtleDirectoryPlugin({ dir: NS_ROOT, publicPath: "ns" }),
    ...(existsSync(DECKS_ROOT) ? [turtleDirectoryPlugin({ dir: DECKS_ROOT, publicPath: "decks" })] : []),
    turtleDirectoryPlugin({ dir: `${VOCAB_ROOT}vendor`, publicPath: "vendor" }),
  ],
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
      // The Markdown parser's entity decoder has a browser build that decodes
      // by writing to an element's innerHTML. Its plain one, a lookup table,
      // keeps the bundle free of HTML sinks (docs/markdown.md, src/build.test.ts).
      "decode-named-character-reference": createRequire(import.meta.url).resolve("decode-named-character-reference"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/vite-env.d.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
