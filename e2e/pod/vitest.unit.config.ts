import { defineConfig } from "vitest/config";

/**
 * The harness's own tests (`npm test`, so `npm run check`): what the
 * servers' compose files may say, and what the probes of a server make of
 * its answers, without Docker and without starting a server.
 */
export default defineConfig({
  test: {
    include: ["*.test.ts", "src/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts"],
    environment: "node",
  },
});
