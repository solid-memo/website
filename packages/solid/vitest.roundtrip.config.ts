// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { packageConfig } from "../../vitest.shared.ts";

/** The round trip of every library release through a draft (src/releaseDrafts.roundtrip.test.ts), a task of its own. */
export default packageConfig({
  environment: "happy-dom",
  test: { include: ["src/**/*.roundtrip.test.ts"] },
});
