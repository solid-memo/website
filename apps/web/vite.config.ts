import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { ALL_SHAPES } from "@solid-memo/vocab/descriptors.generated";
import { readPodTurtle, SHAPES_POD } from "@solid-memo/vocab/tooling/pod";
import { turtleDirectoryPlugin } from "@solid-memo/vocab/tooling/publishTurtle";
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
 * the app knows, as the shapes' pod has it now, and of every vendored
 * profile file. A check receipt in an instance's digest counts only
 * under the same rules. A shape changes only by a new version, which
 * the app learns of by being built again (npm run generate), so the
 * hash taken when it is built holds for as long as it runs.
 */
async function shapesRuleset(): Promise<string> {
  const hash = createHash("sha256");
  for (const path of [...new Set(ALL_SHAPES.map((d) => d.shapeDocument))].sort()) {
    hash.update(path).update(await readPodTurtle(`${SHAPES_POD}${path}`));
  }
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else hash.update(path.slice(VOCAB_ROOT.length)).update(readFileSync(path));
    }
  };
  visit(`${VOCAB_ROOT}vendor`);
  return hash.digest("hex").slice(0, 16);
}

export default defineConfig(async ({ mode }) => ({
  define: {
    __COMMIT_SHA__: JSON.stringify(commitSha()),
    // The unit tests check no pod documents: they need no ruleset, nor the network to make one.
    __SHAPES_RULESET__: JSON.stringify(mode === "test" ? "test" : await shapesRuleset()),
  },
  base: "./",
  plugins: [
    preact(),
    // Solid Memo's own vocabulary and shapes are on their pods (@solid-memo/vocab/pods); only the vendored profiles are the site's.
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
      provider: "v8" as const,
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
}));
