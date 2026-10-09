import { createRequire } from "node:module";
import { mergeConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import { packageConfig } from "../../vitest.shared.ts";

/**
 * The Studio's screens run in a browser, as the components do
 * (packages/ui/vitest.config.ts); its build test, in node. The entry
 * point only wires and renders, so is left to the build test and the
 * journeys.
 */
export default mergeConfig(
  packageConfig({
    environment: "happy-dom",
    exclude: ["src/main.tsx", "src/vite-env.d.ts"],
    test: {
      // Testing Library unmounts after each test through vitest's global afterEach.
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
        "decode-named-character-reference": createRequire(import.meta.url).resolve("decode-named-character-reference"),
      },
    },
  },
);
