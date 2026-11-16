// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { configDefaults } from "vitest/config";
import { packageConfig } from "../../vitest.shared.ts";

/**
 * The round trip of every library release has a task of its own
 * (vitest.roundtrip.config.ts). A worker takes up to about 1.5 GB (four
 * took 5.9 GB), so a run starts fewer of them (vitest.shared.ts).
 */
export default packageConfig({
  environment: "happy-dom",
  workerGb: 1.5,
  test: { exclude: [...configDefaults.exclude, "src/**/*.roundtrip.test.ts"] },
});
