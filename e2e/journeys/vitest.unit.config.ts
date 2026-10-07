import { defineConfig } from "vitest/config";

/**
 * The harness's own tests (`npm test`, so `npm run check`): what it makes
 * of the Solid server's answers, the time zone and the seeded random, and
 * the app's text, without Docker or a browser. The journeys themselves run
 * with Playwright (`npm run journeys`).
 */
export default defineConfig({
  test: { include: ["harness/**/*.test.ts"], environment: "node" },
});
