import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { builtAppPlugin } from "@solid-memo/vocab/tooling/publishApp";
import { turtleDirectoryPlugin } from "@solid-memo/vocab/tooling/publishTurtle";
import { DECKS_ROOT, NS_ROOT, VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { siteDefines } from "@solid-memo/vocab/tooling/siteBuild";

/** The Studio's build (apps/studio), which turbo runs before this one (turbo.json). */
const STUDIO_DIST = resolve(import.meta.dirname, "../studio/dist");

export default defineConfig({
  define: siteDefines(),
  base: "./",
  plugins: [
    preact(),
    // Published with the site: the vocabulary and the shapes (ns/) and the deck
    // library (decks/), at their IRIs, and the vendored profiles. A checkout
    // without decks/ builds without the library; the deploy checks it is there.
    turtleDirectoryPlugin({ dir: NS_ROOT, publicPath: "ns" }),
    ...(existsSync(DECKS_ROOT) ? [turtleDirectoryPlugin({ dir: DECKS_ROOT, publicPath: "decks" })] : []),
    turtleDirectoryPlugin({ dir: `${VOCAB_ROOT}vendor`, publicPath: "vendor" }),
    // The Studio, at studio/, on the same origin (docs/studio.md). A build
    // of this app outside turbo copies whatever Studio build is there, or
    // warns that there is none; the deploy checks it is there.
    builtAppPlugin({ dir: STUDIO_DIST, publicPath: "studio" }),
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
