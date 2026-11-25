// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/preact-vite";

/**
 * The Storybook of the UI's components (docs/storybook.md): every
 * `*.stories.tsx` beside its component, built by the Preact renderer on
 * Vite. Nothing is sent anywhere: no telemetry, no crash reports, no
 * check for a newer Storybook, so a build or a visit reaches nothing
 * but the files it serves.
 */
const config: StorybookConfig = {
  framework: { name: "@storybook/preact-vite", options: {} },
  stories: ["../src/**/*.stories.tsx"],
  core: {
    disableTelemetry: true,
    enableCrashReports: false,
    disableWhatsNewNotifications: true,
  },
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import("vite");
    return mergeConfig(viteConfig, {
      resolve: {
        alias: {
          // TanStack Query on Preact, as the app's build has it (apps/web/vite.config.ts).
          react: "preact/compat",
          "react-dom": "preact/compat",
          // The test fakes' vi.fn, Storybook's spy (vitest.ts).
          vitest: fileURLToPath(new URL("./vitest.ts", import.meta.url)),
        },
      },
    });
  },
};

export default config;
