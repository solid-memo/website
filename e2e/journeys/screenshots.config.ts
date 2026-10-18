// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { defineConfig, devices } from "@playwright/test";

/**
 * The app's screenshots (screenshots/app.screenshots.ts): the built app
 * in Chromium on a phone's screen (an iPhone 14's size, touch), as a
 * guest, so with no Solid server; its deck pictures
 * come from where the decks name them. Its own port, so a journeys'
 * server, or another worktree's, is not the one it pictures.
 */
const APP = "http://127.0.0.1:4174/";

export default defineConfig({
  testDir: "screenshots",
  testMatch: "**/*.screenshots.ts",
  outputDir: "test-results/screenshots",
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    baseURL: APP,
    locale: "en-GB",
    reducedMotion: "reduce",
    colorScheme: "light",
    deviceScaleFactor: 2,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: "npm run preview -w @solid-memo/web -- --host 127.0.0.1 --port 4174 --strictPort",
    cwd: "../..",
    url: APP,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
