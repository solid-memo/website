// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { packageConfig } from "../../vitest.shared.ts";

// The type of Mermaid on the drawing page (src/mermaid.d.ts) holds no code.
export default packageConfig({ exclude: ["src/**/*.d.ts"] });
