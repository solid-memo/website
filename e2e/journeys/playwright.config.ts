// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { defineConfig, devices } from "@playwright/test";
import { noonTimeZone } from "./harness/timezone.ts";

/**
 * The user journeys (docs/testing.md): the built app in Chromium, logging
 * in to a Community Solid Server 7 that globalSetup.ts starts; a few of
 * them also in Firefox, WebKit and on a phone (ENGINE_JOURNEYS). Every
 * failure keeps a trace (the journey step by step, replayable: `npx
 * playwright show-trace`), a video, and what fixtures.ts gathers.
 */
const CI = process.env.CI !== undefined && process.env.CI !== "";
const APP = "http://127.0.0.1:4173/";
const TRACE_MODES = ["on", "off", "retain-on-failure"] as const;
const trace = process.env.JOURNEY_TRACE || "retain-on-failure";
if (!(TRACE_MODES as readonly string[]).includes(trace))
  throw new Error(`JOURNEY_TRACE is "${trace}"; it may be ${TRACE_MODES.join(", ")}.`);

/**
 * The journeys the other engines and the phone run: a guest's study kept
 * in the browser through the login's redirects, and the silent restore of
 * a session after a reload, which differ most between engines; the
 * reload's journey also logs in and out, as @smoke does in Chromium. The
 * rest exercise the app's logic, which doesn't (docs/testing.md#browsers).
 */
const ENGINE_JOURNEYS = /@guest|@reload/;

export default defineConfig({
  testDir: "journeys",
  testMatch: "**/*.journey.ts",
  outputDir: "test-results",
  globalSetup: "./globalSetup.ts",
  // Each journey has its own account and pod, so they can run side by side.
  fullyParallel: false,
  workers: CI ? 2 : undefined,
  // A journey that passes only on a second try is flaky, which a retry would hide.
  retries: 0,
  forbidOnly: CI,
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
    // For the CI job's summary (harness/summary.ts).
    ["json", { outputFile: "test-results/results.json" }],
    // In CI, also each job's run as a blob, to merge into one report of
    // every browser's journeys: the one published at /journeys/
    // (docs/testing.md#user-journeys).
    ...(CI ? ([["github"], ["blob"]] as const) : []),
  ],
  use: {
    baseURL: APP,
    // The server's certificate is its proxy's own (css/Caddyfile).
    ignoreHTTPSErrors: true,
    locale: "en-GB",
    timezoneId: noonTimeZone(new Date()),
    reducedMotion: "reduce",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: trace as (typeof TRACE_MODES)[number],
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Axe checks each step's screen in Chromium and on the phone, which is
  // WebKit too; desktop Firefox and WebKit leave it out
  // (docs/accessibility.md): it takes about 40% of a journey's time, and
  // the same screens are checked in Chromium.
  projects: [
    // Chromium runs every journey, in two shards in CI: a file's journeys
    // too may run side by side, and in either shard, so pod-safety's six
    // do not take one shard's last 100 seconds. A file whose journeys
    // depend on each other says so (studio.journey.ts, serial).
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, fullyParallel: true },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      grep: ENGINE_JOURNEYS,
      metadata: { accessibility: false },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      grep: ENGINE_JOURNEYS,
      metadata: { accessibility: false },
    },
    // Safari on an iPhone: a phone's viewport, touch, and WebKit.
    { name: "phone", use: { ...devices["iPhone 14"] }, grep: ENGINE_JOURNEYS },
  ],
  // The built app (npm run build -w @solid-memo/web), the Studio, its deck
  // library and shapes included; 127.0.0.1 is a secure context, so http will do.
  webServer: {
    command: "npm run preview -w @solid-memo/web -- --host 127.0.0.1 --port 4173 --strictPort",
    cwd: "../..",
    url: APP,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});
