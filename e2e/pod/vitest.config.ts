import { defineConfig } from "vitest/config";
import { SERVERS, serversNamed } from "./servers.ts";

/**
 * Against real Solid servers (docs/testing.md), which globalSetup.ts
 * starts unless SOLID_SERVER_URL names one; no coverage: this package
 * only tests. The harness's own tests are vitest.unit.config.ts's.
 * E2E_RESULT_JSON names a file for the results too, which compare.ts reads.
 */
const resultFile = process.env.E2E_RESULT_JSON;
/** One test file at a time, where a server the tests start fails writes made at once (servers.ts). */
const serial = !process.env.SOLID_SERVER_URL && serversNamed(process.env.SOLID_SERVERS).some((id) => (SERVERS[id] as { serialFiles?: true }).serialFiles);

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    // Naming any reporter drops the one Vitest adds on GitHub Actions: named
    // again. Named as undefined, there would be none.
    ...(resultFile && {
      reporters: ["default", ...(process.env.GITHUB_ACTIONS ? ["github-actions"] : []), ["json", { outputFile: resultFile }]],
    }),
    environment: "node",
    fileParallelism: !serial,
    testTimeout: 60_000,
    hookTimeout: 90_000,
    globalSetup: ["./globalSetup.ts"],
    // No request on a pooled connection the server may have closed (connections.ts).
    setupFiles: ["./setup.ts"],
  },
});
