import { packageConfig } from "../vitest.shared.ts";

/**
 * The repository's own checks (`npm run check:scripts`), at 100% coverage
 * like every package (docs/testing.md). checkBoundaries.ts predates them
 * and has no tests of its own: `npm run check` runs it on the repository.
 */
export default packageConfig({
  include: ["*.ts"],
  exclude: ["*.test.ts", "vitest.config.ts", "checkBoundaries.ts"],
});
