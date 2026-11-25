// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { packageConfig } from "../../../vitest.shared.ts";

/**
 * The round trips, a task of their own: every library release through a
 * draft (src/releaseDrafts.<n>.roundtrip.test.ts), and every pod
 * snapshot through the app (src/podSnapshots.roundtrip.test.ts), and the
 * other tests that read the whole library (`*.library.test.ts`), whose
 * decks the unit tests' task doesn't take as inputs. They
 * run in UTC: a pod's study days and an answer's offset from UTC are
 * the device's, and a snapshot is the same wherever it is written. A
 * worker takes up to about 1.5 GB, as the unit tests' do.
 */
export default packageConfig({
  environment: "happy-dom",
  workerGb: 1.5,
  test: { include: ["src/**/*.roundtrip.test.ts", "src/**/*.library.test.ts"], env: { TZ: "UTC" } },
});
