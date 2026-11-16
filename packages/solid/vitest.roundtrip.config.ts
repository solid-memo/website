// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { packageConfig } from "../../vitest.shared.ts";

/**
 * The round trips, a task of their own: every library release through a
 * draft (src/releaseDrafts.<n>.roundtrip.test.ts), and every pod
 * snapshot through the app (src/podSnapshots.roundtrip.test.ts). They
 * run in UTC: a pod's study days and an answer's offset from UTC are
 * the device's, and a snapshot is the same wherever it is written.
 */
export default packageConfig({
  environment: "happy-dom",
  test: { include: ["src/**/*.roundtrip.test.ts"], env: { TZ: "UTC" } },
});
