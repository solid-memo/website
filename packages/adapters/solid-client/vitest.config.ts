// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { packageConfig } from "../../../vitest.shared.ts";

/**
 * The seam reads no page, so its tests run in node. The modules a client
 * gives are declared here with no body (scripts/solidClient.ts): there
 * is no code in them to cover, and the build never loads them, as it
 * puts a client's module in their place.
 */
export default packageConfig({
  exclude: ["src/rdf.ts", "src/resources.ts", "src/session.ts", "src/access.ts"],
});
