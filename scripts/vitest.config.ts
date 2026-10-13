// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { packageConfig } from "../vitest.shared.ts";

/**
 * The repository's own checks (`npm run check:scripts`), at 100% coverage
 * like every package (docs/testing.md).
 */
export default packageConfig({
  include: ["*.ts"],
  exclude: ["*.test.ts", "vitest.config.ts"],
});
