// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { packageConfig } from "../../vitest.shared.ts";

/**
 * One step of an exchange of a pod with another version of the app
 * (src/testing/podExchange.ts), run by scripts/exchangePods.ts and by
 * no other task. In UTC, as the round trips are: a pod is the same
 * wherever it is written.
 */
export default packageConfig({
  environment: "happy-dom",
  test: { include: ["src/testing/podExchange.ts"], env: { TZ: "UTC" } },
});
