import { defineConfig, type ViteUserConfig } from "vitest/config";

/**
 * The test setup every package shares (docs/testing.md): each package's
 * own code at 100% coverage, test helpers (`src/testing/`, `src/test/`)
 * excepted. `environment` is "node" unless the package runs in the
 * browser; `include` lists what counts, beyond `src/`.
 *
 * A test may take 30 s, not vitest's 5: CI runs every package's tests at
 * once, coverage on, on a runner that takes some tests fifty times as
 * long as a laptop does (the generator's check of `ns/`, 0.1 s on a
 * laptop, ran out of 5 s there). A test that hangs still fails.
 */
export function packageConfig({
  environment = "node",
  include = [],
  exclude = [],
  test = {},
}: {
  environment?: "node" | "happy-dom";
  include?: string[];
  exclude?: string[];
  test?: NonNullable<ViteUserConfig["test"]>;
} = {}) {
  return defineConfig({
    test: {
      environment,
      testTimeout: 30_000,
      ...test,
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}", ...include],
        exclude: ["src/testing/**", "src/test/**", ...exclude],
        thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  });
}
