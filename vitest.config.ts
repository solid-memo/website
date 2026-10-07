import { defineConfig } from "vitest/config";

/**
 * Every workspace's tests from the root (`npm run test:unit`, or
 * `npx vitest run <file>` for one file), each under its own config: its
 * environment and setup, as its own `npm test` has them. No coverage:
 * the thresholds are each package's, checked by its own `npm test`
 * (turbo, so CI), which never reads this file. e2e/pod's and
 * e2e/journeys' are their harnesses' own tests, not those against real
 * servers or in a browser.
 */
export default defineConfig({
  test: {
    projects: ["apps/web", "packages/*", "e2e/pod/vitest.unit.config.ts", "e2e/journeys/vitest.unit.config.ts"],
  },
});
