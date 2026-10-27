// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { packageConfig } from "../../vitest.shared.ts";

/** The sign-in client reads the page's address and storage, as in a browser (packages/solid/vitest.config.ts). */
export default packageConfig({ environment: "happy-dom" });
