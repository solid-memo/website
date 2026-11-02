// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

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
      },
    },
  },
);
