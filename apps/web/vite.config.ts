import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { turtleDirectoryPlugin } from "@solid-memo/vocab/tooling/publishTurtle";
import { DECKS_ROOT, NS_ROOT, VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { siteDefines } from "@solid-memo/vocab/tooling/siteBuild";

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
});
