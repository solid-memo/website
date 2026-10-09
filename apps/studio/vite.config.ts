import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { turtleDirectoryPlugin } from "@solid-memo/vocab/tooling/publishTurtle";
import { DECKS_ROOT, NS_ROOT, VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { siteDefines } from "@solid-memo/vocab/tooling/siteBuild";

/**
 * In `npm run dev` only: the site's documents (the vocabulary and shapes,
 * the deck library, the vendored profiles) beside the Studio, as Solid
 * Memo's build publishes them at the site's root. The Studio's own build
 * is published at studio/ by Solid Memo's (docs/studio.md), so it carries
 * none of them.
 */
const servedOnly = (plugin: Plugin): Plugin => ({ ...plugin, apply: "serve" });

export default defineConfig({
  define: siteDefines(),
  base: "./",
  plugins: [
    preact(),
    servedOnly(turtleDirectoryPlugin({ dir: NS_ROOT, publicPath: "ns" })),
    ...(existsSync(DECKS_ROOT) ? [servedOnly(turtleDirectoryPlugin({ dir: DECKS_ROOT, publicPath: "decks" }))] : []),
    servedOnly(turtleDirectoryPlugin({ dir: `${VOCAB_ROOT}vendor`, publicPath: "vendor" })),
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
