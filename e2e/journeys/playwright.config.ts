import { defineConfig, devices } from "@playwright/test";
import { noonTimeZone } from "./harness/timezone.ts";

/**
 * The user journeys (docs/testing.md): the built app in Chromium, logging
 * in to a Community Solid Server 7 that globalSetup.ts starts. Every
 * failure keeps a trace (the journey step by step, replayable: `npx
 * playwright show-trace`), a video, and what fixtures.ts gathers.
 */
const CI = process.env.CI !== undefined && process.env.CI !== "";
const APP = "http://127.0.0.1:4173/";
const TRACE_MODES = ["on", "off", "retain-on-failure"] as const;
const trace = process.env.JOURNEY_TRACE || "retain-on-failure";
if (!(TRACE_MODES as readonly string[]).includes(trace)) throw new Error(`JOURNEY_TRACE is "${trace}"; it may be ${TRACE_MODES.join(", ")}.`);

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
    ...(CI ? ([["github"]] as const) : []),
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The built app (npm run build -w @solid-memo/web), its deck library and
  // shapes included; 127.0.0.1 is a secure context, so http will do.
  webServer: {
    command: "npm run preview -w @solid-memo/web -- --host 127.0.0.1 --port 4173 --strictPort",
    cwd: "../..",
    url: APP,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});
