// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { configDefaults } from "vitest/config";
import { packageConfig } from "../../../vitest.shared.ts";

/**
 * The round trip of every library release, and the other tests that read
 * the whole library (`*.library.test.ts`), have a task of their own
 * (vitest.roundtrip.config.ts). The unit tests read only the decks
 * src/testing/libraryDecks.ts lists, which libraryDecks.setup.ts makes
 * sure of. A worker takes up to about 1.5 GB (four took 5.9 GB), so a run
 * starts fewer of them (vitest.shared.ts).
 */
export default packageConfig({
  environment: "happy-dom",
  workerGb: 1.5,
  test: {
    exclude: [...configDefaults.exclude, "src/**/*.roundtrip.test.ts", "src/**/*.library.test.ts"],
    setupFiles: ["./src/testing/libraryDecks.setup.ts"],
  },
});
