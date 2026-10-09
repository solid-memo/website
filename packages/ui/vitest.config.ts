import { createRequire } from "node:module";
import { mergeConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { packageConfig } from "../../vitest.shared.ts";

/** The components run in a browser: Preact, its React compatibility layer for TanStack Query, and the DOM matchers. */
export default mergeConfig(
  packageConfig({
    environment: "happy-dom",
    test: {
      globals: true,
      server: {
        deps: {
          inline: [/@tanstack\/react-query/],
        },
      },
      setupFiles: ["./src/test/setup.ts"],
    },
  }),
  {
    plugins: [preact()],
    resolve: {
      alias: {
        react: "preact/compat",
        "react-dom": "preact/compat",
        // The Markdown parser's entity decoder has a browser build that decodes
        // by writing to an element's innerHTML. The tests use the plain one, a
        // lookup table, as the built app does (apps/web/vite.config.ts).
        "decode-named-character-reference": createRequire(import.meta.url).resolve("decode-named-character-reference"),
      },
    },
  },
);
