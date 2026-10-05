import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { topicsPage, turtleDirectoryPlugin, vocabPage } from "@solid-memo/vocab/tooling/publishTurtle";
import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";

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
 * and vendored profile file. A check receipt in an instance's digest
 * counts only under the same rules.
 */
function shapesRuleset(): string {
  const hash = createHash("sha256");
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else hash.update(path.slice(VOCAB_ROOT.length)).update(readFileSync(path));
    }
  };
  visit(`${VOCAB_ROOT}shapes`);
  visit(`${VOCAB_ROOT}vendor`);
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
    turtleDirectoryPlugin({ dir: `${VOCAB_ROOT}vocab`, publicPath: "vocab", pages: [vocabPage(), topicsPage()] }),
    turtleDirectoryPlugin({ dir: `${VOCAB_ROOT}shapes`, publicPath: "shapes" }),
    turtleDirectoryPlugin({ dir: `${VOCAB_ROOT}vendor`, publicPath: "vendor" }),
  ],
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    server: {
      deps: {
        inline: [/@tanstack\/react-query/],
      },
    },
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/vite-env.d.ts", "src/test/**"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
